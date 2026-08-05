#ifndef UTILS_H
#define UTILS_H

#include <stdio.h>
#include <sys/types.h>

#include <android/log.h>

#include "constants.h"
#include "root_impl/common.h"

#define CONCAT_(x,y) x##y
#define CONCAT(x,y) CONCAT_(x,y)

#ifdef __LP64__
  #define LP_SELECT(a, b) b
#else
  #define LP_SELECT(a, b) a
#endif

#ifndef LOG_TAG
  #define LOG_TAG "zygiskd" LP_SELECT("32", "64")
#endif

#include <stdarg.h>
#include <time.h>
#include <unistd.h>

static inline void rz_daemon_log_print(int priority, const char *tag, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  __android_log_vprint(priority, tag, fmt, ap);
  va_end(ap);

  va_start(ap, fmt);
  vprintf(fmt, ap);
  va_end(ap);

  if (access("/data/adb/rezygisk/debug_logging", F_OK) == 0 ||
      access("/data/adb/modules/rezygisk/debug_logging", F_OK) == 0) {
    FILE *f = fopen("/data/adb/rezygisk/rezygisk.log", "a");
    if (!f) {
      f = fopen("/data/adb/modules/rezygisk/rezygisk.log", "a");
    }
    if (f) {
      time_t now = time(NULL);
      struct tm *tm_info = localtime(&now);
      char time_buf[32];
      if (tm_info) strftime(time_buf, sizeof(time_buf), "%m-%d %H:%M:%S", tm_info);
      else time_buf[0] = '\0';

      const char *prio_str = "D";
      switch (priority) {
        case ANDROID_LOG_VERBOSE: prio_str = "V"; break;
        case ANDROID_LOG_DEBUG:   prio_str = "D"; break;
        case ANDROID_LOG_INFO:    prio_str = "I"; break;
        case ANDROID_LOG_WARN:    prio_str = "W"; break;
        case ANDROID_LOG_ERROR:   prio_str = "E"; break;
        case ANDROID_LOG_FATAL:   prio_str = "F"; break;
      }

      fprintf(f, "%s %s/%s: ", time_buf, prio_str, tag);
      va_start(ap, fmt);
      vfprintf(f, fmt, ap);
      va_end(ap);
      fprintf(f, "\n");
      fclose(f);
    }
  }
}

#define LOGI(...) rz_daemon_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) rz_daemon_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define LOGE(...) rz_daemon_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

#define ASSURE_SIZE_WRITE(area_name, subarea_name, sent_size, expected_size, return_type)                        \
  if (sent_size != (ssize_t)(expected_size)) {                                                                   \
    LOGE("Failed to sent " subarea_name " in " area_name ": Expected %zu, got %zd\n", expected_size, sent_size); \
                                                                                                                 \
    return_type;                                                                                                 \
  }

#define ASSURE_SIZE_READ(area_name, subarea_name, sent_size, expected_size, return_type)                         \
  if (sent_size != (ssize_t)(expected_size)) {                                                                   \
    LOGE("Failed to read " subarea_name " in " area_name ": Expected %zu, got %zd\n", expected_size, sent_size); \
                                                                                                                 \
    return_type;                                                                                                 \
  }

#define IS_ISOLATED_SERVICE(uid)      \
  ((uid) >= 90000 && (uid) < 1000000)

#define write_func_def(type)              \
  ssize_t write_## type(int fd, type val)

#define read_func_def(type)               \
  ssize_t read_## type(int fd, type *val)

bool switch_mount_namespace(pid_t pid);

void get_property(const char *name, char *restrict output);

void set_socket_create_context(const char *restrict context);

void unix_datagram_sendto(const char *restrict path, const void *restrict buf, size_t len);

int chcon(const char *path, const char *restrict context);

int unix_listener_from_path(const char *path);

ssize_t write_fd(int fd, int sendfd);
int read_fd(int fd);

write_func_def(size_t);
read_func_def(size_t);

write_func_def(uint32_t);
read_func_def(uint32_t);

write_func_def(uint8_t);
read_func_def(uint8_t);

ssize_t write_string(int fd, const char *restrict str);

ssize_t read_string(int fd, char *restrict buf, size_t buf_size);

bool exec_command(char *restrict buf, size_t len, const char *restrict file, const char *const argv[]);

bool check_unix_socket(int fd, bool block);

int non_blocking_execv(const char *restrict file, char *const argv[]);

void stringify_root_impl_name(struct root_impl impl, char *restrict output);

int save_mns_fd(int pid, enum MountNamespaceState mns_state, struct root_impl impl);

#endif /* UTILS_H */
