#ifndef LOGGING_H
#define LOGGING_H

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <sys/xattr.h>
#include <time.h>
#include <unistd.h>
#include <sys/syscall.h>

#include <android/log.h>

#include "misc.h"

#ifndef LOG_TAG
  #define LOG_TAG "zygisk-core" LP_SELECT("32", "64")
#endif

#define REZYGISK_NATIVE_LOG_PATH "/data/adb/rezygisk/rezygisk.log"
#define REZYGISK_NATIVE_LOG_CONTEXT "u:object_r:rezygisk_log_file:s0"

static inline int rz_native_file_logging_enabled(void) {
  return access("/data/adb/rezygisk/debug_logging", F_OK) == 0 ||
         access("/data/adb/modules/rezygisk/debug_logging", F_OK) == 0;
}

static inline int rz_native_log_is_ready(void) {
  char context[sizeof(REZYGISK_NATIVE_LOG_CONTEXT)];
  ssize_t length = lgetxattr(REZYGISK_NATIVE_LOG_PATH, "security.selinux", context, sizeof(context) - 1);
  if (length <= 0) return 0;

  context[length] = '\0';
  return strcmp(context, REZYGISK_NATIVE_LOG_CONTEXT) == 0;
}

static inline void rz_log_print(int priority, const char *tag, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  __android_log_vprint(priority, tag, fmt, ap);
  va_end(ap);

  if (geteuid() != 0 || !rz_native_file_logging_enabled() || !rz_native_log_is_ready()) return;

  int fd = open(REZYGISK_NATIVE_LOG_PATH, O_WRONLY | O_APPEND | O_CLOEXEC);
  if (fd == -1) return;

  FILE *f = fdopen(fd, "a");
  if (!f) {
    close(fd);
    return;
  }

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

  long tid = (long)syscall(SYS_gettid);
  fprintf(f, "%s [%d:%ld] %s/%s: ", time_buf, getpid(), tid, prio_str, tag);
  va_start(ap, fmt);
  vfprintf(f, fmt, ap);
  va_end(ap);
  fprintf(f, "\n");
  fclose(f);
}

#define LOGD(...) rz_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGV(...) rz_log_print(ANDROID_LOG_VERBOSE, LOG_TAG, __VA_ARGS__)
#define LOGI(...) rz_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) rz_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define LOGE(...) rz_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGF(...) rz_log_print(ANDROID_LOG_FATAL, LOG_TAG, __VA_ARGS__)
#define PLOGE(fmt, args...) LOGE(fmt " failed with %d: %s", ##args, errno, strerror(errno))

#endif /* LOGGING_H */
