#include <stdio.h>
#include <inttypes.h>
#include <string.h>

#include <link.h>
#include <signal.h>
#include <sys/mman.h>
#include <sys/ptrace.h>
#include <sys/wait.h>

#include <elf.h>
#include <unistd.h>

#define LOG_TAG "zygisk-injector" LP_SELECT("32", "64")

#include "misc.h"
#include "utils.h"

#include "remote_csoloader.h"

bool inject_on_main(int pid, const char *lib_path, uintptr_t libc_init_target, uintptr_t libc_init_got_slot, bool is_tango) {
  LOGI("injecting %s to zygote %d via GOT hook", lib_path, pid);

  bool got_is_patched = false;
  bool have_backup_regs = false;
  struct user_regs_struct backup = { 0 };

  uintptr_t break_addr = (uintptr_t)((intptr_t)(-0x0F & ~1) | (intptr_t)(libc_init_target & 1));
  if (!ptrace_poke_uintptr(pid, libc_init_got_slot, break_addr)) {
    LOGE("Failed to patch GOT slot with break_addr");

    return false;
  }
  got_is_patched = true;

  if (ptrace(PTRACE_CONT, pid, 0, 0) == -1) {
    PLOGE("Failed to continue to GOT break");

    goto restore_tracee;
  }

  int status = 0;
  wait_for_trace(pid, &status, __WALL);

  if (!WIFSTOPPED(status) || WSTOPSIG(status) != SIGSEGV) {
    char status_str[64];
    parse_status(status, status_str, sizeof(status_str));

    LOGE("expected SIGSEGV on __libc_init GOT call, got: %s", status_str);

    goto restore_tracee;
  }

  struct user_regs_struct regs = { 0 };
  if (!get_regs(pid, &regs)) {
    LOGE("Failed to get regs after GOT break");

    goto restore_tracee;
  }

  memcpy(&backup, &regs, sizeof(backup));
  have_backup_regs = true;

  /* Restore valid __libc_init pointer to RELRO GOT slot via PTRACE_POKEDATA fallback */
  if (!ptrace_poke_uintptr(pid, libc_init_got_slot, libc_init_target)) {
    LOGE("Failed to restore __libc_init GOT slot");

    goto restore_tracee;
  }
  got_is_patched = false;

  char pid_str[11];
  snprintf(pid_str, sizeof(pid_str), "%d", pid);

  struct maps_info *map = parse_maps(pid_str);
  if (!map) {
    LOGE("Failed to parse remote maps after GOT break");

    goto restore_tracee;
  }

  struct maps_info *local_map = parse_maps("self");
  if (!local_map) {
    LOGE("Failed to parse local maps");

    free_maps(map);

    goto restore_tracee;
  }

  void *libc_return_addr = find_module_return_addr(map, "libc.so");
  uintptr_t remote_base = 0, injector_entry = 0;
  size_t remote_size = 0;

  if (!remote_csoloader_load_and_resolve_entry(pid, &regs, map, local_map, lib_path, &remote_base, &remote_size, &injector_entry)) {
    LOGE("Remote CSOLoader mapping failed");

    free_maps(local_map);
    free_maps(map);

    goto restore_tracee;
  }

  free_maps(local_map);
  free_maps(map);

  long args[3] = {
    (long)remote_base,
    (long)remote_size,
    is_tango ? 1 : 0
  };
  remote_call(pid, &regs, injector_entry, (uintptr_t)libc_return_addr, args, 3);

  bool injector_ok = false;
  #if defined(__arm__)
    injector_ok = (((uintptr_t)regs.REG_IP & ~1u) == ((uintptr_t)libc_return_addr & ~1u));
  #else
    injector_ok = ((uintptr_t)regs.REG_IP == (uintptr_t)libc_return_addr);
  #endif

  if (!injector_ok) {
    LOGE("injector entry faulted at %p", (void *)regs.REG_IP);

    goto restore_tracee;
  }

  backup.REG_IP = (long)libc_init_target;
  if (!set_regs(pid, &backup)) goto restore_tracee;

  LOGD("injection complete, instruction pointer reset to __libc_init (%p)", (void *)libc_init_target);

  return true;

  restore_tracee:
    if (got_is_patched && !ptrace_poke_uintptr(pid, libc_init_got_slot, libc_init_target))
      LOGE("Failed to restore __libc_init GOT slot during injection cleanup");

    if (have_backup_regs) {
      backup.REG_IP = (long)libc_init_target;
      if (!set_regs(pid, &backup)) LOGE("Failed to restore zygote registers during injection cleanup");
    }

    return false;
}

#define STOPPED_WITH(sig, event) (WIFSTOPPED(status) && WSTOPSIG(status) == (sig) && (status >> 16) == (event))
#define WAIT_OR_DIE wait_for_trace(pid, &status, __WALL);
#define CONT_OR_DIE                           \
  if (ptrace(PTRACE_CONT, pid, 0, 0) == -1) { \
    PLOGE("cont");                            \
                                              \
    return false;                             \
  }

bool trace_zygote(int pid, bool tango_flag) {
  LOGI("start tracing %d (tracer %d)", pid, getpid());

  /* INFO: Set value 0 to make compiler happy. */
  int status = 0;

  struct kernel_version version = parse_kversion();
  if (version.major > 3 || (version.major == 3 && version.minor >= 8)) {
    if (ptrace(PTRACE_SEIZE, pid, 0, PTRACE_O_EXITKILL | PTRACE_O_TRACESECCOMP | PTRACE_O_TRACESYSGOOD) == -1) {
      PLOGE("seize for tango");

      return false;
    }

    WAIT_OR_DIE;
  } else {
    if (ptrace(PTRACE_SEIZE, pid, 0, PTRACE_O_TRACESYSGOOD) == -1) {
      PLOGE("seize");

      return false;
    }

    WAIT_OR_DIE;
  }

  if (kill(pid, SIGCONT) == -1) {
    PLOGE("kill SIGCONT");
    ptrace(PTRACE_DETACH, pid, 0, 0);

    return false;
  }

  if (ptrace(PTRACE_SYSCALL, pid, 0, 0) == -1) {
    PLOGE("initial PTRACE_SYSCALL");
    ptrace(PTRACE_DETACH, pid, 0, SIGCONT);

    return false;
  }

  int dummy;
  if (!wait_for_ptrace_syscall_stop(pid, &dummy)) {
    ptrace(PTRACE_DETACH, pid, 0, SIGCONT);

    return false;
  }

  uintptr_t libc_init_got_slot = 0, libc_init_resolved = 0;
  if (!wait_linker_ready(pid, &libc_init_resolved, &libc_init_got_slot)) {
    LOGE("Failed to wait for linker ready for injection");

    ptrace(PTRACE_DETACH, pid, 0, SIGCONT);

    return false;
  }

  LOGD("Resolved __libc_init at %p (GOT slot %p)", (void *)libc_init_resolved, (void *)libc_init_got_slot);

  if (STOPPED_WITH(SIGSTOP, PTRACE_EVENT_STOP)) {
    char *lib_path = "/data/adb/modules/rezygisk/lib" LP_SELECT("", "64") "/libzygisk.so";
    if (!inject_on_main(pid, lib_path, libc_init_resolved, libc_init_got_slot, tango_flag)) {
      LOGE("failed to inject");

      return false;
    }

    LOGD("inject done, continue process");
    if (kill(pid, SIGCONT)) {
      PLOGE("kill");

      return false;
    }

    CONT_OR_DIE
    WAIT_OR_DIE

    if (STOPPED_WITH(SIGTRAP, PTRACE_EVENT_STOP)) {
      CONT_OR_DIE
      WAIT_OR_DIE

      if (STOPPED_WITH(SIGCONT, 0)) {
        LOGD("received SIGCONT");

        /* INFO: Due to kernel bugs, fixed in 5.16+, ptrace_message (msg of
             PTRACE_GETEVENTMSG) may not represent the current state of
             the process. Because we set some options, which alters the
             ptrace_message, we need to call PTRACE_SYSCALL to reset the
             ptrace_message to 0, the default/normal state.
        */
        ptrace(PTRACE_SYSCALL, pid, 0, 0);

        WAIT_OR_DIE

        ptrace(PTRACE_DETACH, pid, 0, SIGCONT);
      }
    } else {
      char status_str[64];
      parse_status(status, status_str, sizeof(status_str));

      LOGE("Expected SIGTRAP (event: EVENT_STOP), found: %s", status_str);

      ptrace(PTRACE_DETACH, pid, 0, 0);

      return false;
    }
  } else {
    char status_str[64];
    parse_status(status, status_str, sizeof(status_str));

    LOGE("Expected SIGSTOP (event: EVENT_STOP), found: %s", status_str);

    ptrace(PTRACE_DETACH, pid, 0, 0);

    return false;
  }

  return true;
}
