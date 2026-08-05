#ifndef LOGGING_H
#define LOGGING_H

#include <errno.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <sys/syscall.h>

#include <android/log.h>

#include "misc.h"

#ifndef LOG_TAG
  #define LOG_TAG "zygisk-core" LP_SELECT("32", "64")
#endif

static inline void rz_log_print(int priority, const char *tag, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  __android_log_vprint(priority, tag, fmt, ap);
  va_end(ap);

  /* App-specialized children cannot write the root-owned native log under
     SELinux. Logcat above remains available for diagnostics in those processes. */
  if (geteuid() != 0) return;

  if (access("/data/adb/rezygisk/debug_logging", F_OK) == 0 ||
      access("/data/adb/modules/rezygisk/debug_logging", F_OK) == 0 ||
      access("/data/adb/rezygisk/rezygisk.log", F_OK) == 0) {
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

      long tid = (long)syscall(SYS_gettid);
      fprintf(f, "%s [%d:%ld] %s/%s: ", time_buf, getpid(), tid, prio_str, tag);
      va_start(ap, fmt);
      vfprintf(f, fmt, ap);
      va_end(ap);
      fprintf(f, "\n");
      fclose(f);
    }
  }
}

#define LOGD(...) rz_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGV(...) rz_log_print(ANDROID_LOG_VERBOSE, LOG_TAG, __VA_ARGS__)
#define LOGI(...) rz_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) rz_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define LOGE(...) rz_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGF(...) rz_log_print(ANDROID_LOG_FATAL, LOG_TAG, __VA_ARGS__)
#define PLOGE(fmt, args...) LOGE(fmt " failed with %d: %s", ##args, errno, strerror(errno))

#endif /* LOGGING_H */
