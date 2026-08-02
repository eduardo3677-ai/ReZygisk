#include <string.h>
#include <stdbool.h>

#define LOG_TAG "zygisk"
#include "logging.h"

#include "zygisk_compat.h"

#define MAX_COMPAT_MODULES 32

struct compat_module_state {
  struct zygisk_compat_module_abi abi;
  bool registered;
};

static struct compat_module_state compat_modules[MAX_COMPAT_MODULES];
static size_t compat_module_count = 0;

static struct zygisk_compat_api_table compat_api_table;

static void *compat_hook_jni = NULL;
static void *compat_plt_register = NULL;
static void *compat_plt_exclude = NULL;
static void *compat_plt_commit = NULL;
static void *compat_connect_companion = NULL;
static void *compat_set_option = NULL;
static void *compat_get_module_dir = NULL;
static void *compat_get_flags = NULL;

size_t zygisk_compat_get_count(void) {
  return compat_module_count;
}

bool zygisk_compat_is_registered(size_t idx) {
  if (idx >= compat_module_count) return false;
  return compat_modules[idx].registered;
}

struct zygisk_compat_module_abi *zygisk_compat_get_abi(size_t idx) {
  if (idx >= compat_module_count) return NULL;
  return &compat_modules[idx].abi;
}

void zygisk_compat_reset(void) {
  compat_module_count = 0;
}

static bool compat_register_module(struct zygisk_compat_api_table *table, struct zygisk_compat_module_abi *abi) {
  if (compat_module_count >= MAX_COMPAT_MODULES) {
    LOGE("Too many Zygisk compat modules");
    return false;
  }

  if (abi->api_version > ZYGISK_COMPAT_API_VERSION) {
    LOGE("Zygisk compat module API version %ld too high (max %d)", abi->api_version, ZYGISK_COMPAT_API_VERSION);
    return false;
  }

  compat_modules[compat_module_count].abi = *abi;
  compat_modules[compat_module_count].registered = true;

  table->impl = (void *)(uintptr_t)(compat_module_count + 1);

  LOGD("Zygisk compat module %zu registered, API version %ld", compat_module_count, abi->api_version);

  compat_module_count++;

  return true;
}

static void compat_hook_jni_native_methods(JNIEnv *env, const char *className, JNINativeMethod *methods, int numMethods) {
  if (compat_hook_jni) {
    ((void (*)(JNIEnv *, const char *, JNINativeMethod *, int))compat_hook_jni)(env, className, methods, numMethods);
  }
}

static void compat_plt_hook_register(const char *regex, const char *symbol, void *newFunc, void **oldFunc) {
  if (compat_plt_register) {
    ((void (*)(const char *, const char *, void *, void **))compat_plt_register)(regex, symbol, newFunc, oldFunc);
  }
}

static void compat_plt_hook_exclude(const char *regex, const char *symbol) {
  if (compat_plt_exclude) {
    ((void (*)(const char *, const char *))compat_plt_exclude)(regex, symbol);
  }
}

static bool compat_plt_hook_commit(void) {
  if (compat_plt_commit) {
    return ((bool (*)())compat_plt_commit)();
  }
  return false;
}

static bool compat_unload_requested = false;

static int compat_connect_companion_fn(void *impl) {
  (void)impl;
  if (compat_connect_companion) {
    return ((int (*)(void *))compat_connect_companion)((void *)0);
  }
  return -1;
}

static void compat_set_option_fn(void *impl, int opt) {
  (void)impl;

  if (opt == ZYGISK_OPTION_DLCLOSE_MODULE_LIBRARY) {
    compat_unload_requested = true;
  } else if (opt == ZYGISK_OPTION_FORCE_DENYLIST_UNMOUNT && compat_set_option) {
    ((void (*)(void *, int))compat_set_option)((void *)0, opt);
  }
}

static int compat_get_module_dir_fn(void *impl) {
  (void)impl;
  if (compat_get_module_dir) {
    return ((int (*)(void *))compat_get_module_dir)((void *)0);
  }
  return -1;
}

static uint32_t compat_get_flags_fn(void *impl) {
  (void)impl;
  if (compat_get_flags) {
    return ((uint32_t (*)(void *))compat_get_flags)((void *)0);
  }
  return 0;
}

bool zygisk_compat_is_unload_requested(void) {
  return compat_unload_requested;
}

void zygisk_compat_clear_unload(void) {
  compat_unload_requested = false;
}

void zygisk_compat_set_callbacks(
  void (*hook_jni)(JNIEnv *, const char *, JNINativeMethod *, int),
  void (*plt_register)(const char *, const char *, void *, void **),
  void (*plt_exclude)(const char *, const char *),
  bool (*plt_commit)(),
  int (*connect_companion)(void *),
  void (*set_option)(void *, int),
  int (*get_module_dir)(void *),
  uint32_t (*get_flags)(void *)
) {
  compat_hook_jni = (void *)hook_jni;
  compat_plt_register = (void *)plt_register;
  compat_plt_exclude = (void *)plt_exclude;
  compat_plt_commit = (void *)plt_commit;
  compat_connect_companion = (void *)connect_companion;
  compat_set_option = (void *)set_option;
  compat_get_module_dir = (void *)get_module_dir;
  compat_get_flags = (void *)get_flags;

  compat_api_table.impl = NULL;
  compat_api_table.registerModule = compat_register_module;
  compat_api_table.hookJniNativeMethods = compat_hook_jni_native_methods;
  compat_api_table.pltHookRegister = compat_plt_hook_register;
  compat_api_table.pltHookExclude = compat_plt_hook_exclude;
  compat_api_table.pltHookCommit = compat_plt_hook_commit;
  compat_api_table.connectCompanion = compat_connect_companion_fn;
  compat_api_table.setOption = compat_set_option_fn;
  compat_api_table.getModuleDir = compat_get_module_dir_fn;
  compat_api_table.getFlags = compat_get_flags_fn;
}

struct zygisk_compat_api_table *zygisk_compat_get_api_table(void) {
  return &compat_api_table;
}

size_t zygisk_compat_call_entry(void *entry, JNIEnv *env) {
  size_t before = compat_module_count;

  zygisk_compat_entry_fn fn = (zygisk_compat_entry_fn)entry;
  fn(&compat_api_table, env);

  return compat_module_count - before;
}

void zygisk_compat_call_pre_app(void *args) {
  for (size_t i = 0; i < compat_module_count; i++) {
    if (!compat_modules[i].abi.preAppSpecialize) continue;
    compat_modules[i].abi.preAppSpecialize(compat_modules[i].abi.module_this, args);
  }
}

void zygisk_compat_call_post_app(const void *args) {
  for (size_t i = 0; i < compat_module_count; i++) {
    if (!compat_modules[i].abi.postAppSpecialize) continue;
    compat_modules[i].abi.postAppSpecialize(compat_modules[i].abi.module_this, args);
  }
}

void zygisk_compat_call_pre_server(void *args) {
  for (size_t i = 0; i < compat_module_count; i++) {
    if (!compat_modules[i].abi.preServerSpecialize) continue;
    compat_modules[i].abi.preServerSpecialize(compat_modules[i].abi.module_this, args);
  }
}

void zygisk_compat_call_post_server(const void *args) {
  for (size_t i = 0; i < compat_module_count; i++) {
    if (!compat_modules[i].abi.postServerSpecialize) continue;
    compat_modules[i].abi.postServerSpecialize(compat_modules[i].abi.module_this, args);
  }
}
