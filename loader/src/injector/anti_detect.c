#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <unistd.h>

#define LOG_TAG "zygisk"
#include "logging.h"

#include "anti_detect.h"

static const char *HIDE_PATTERNS[] = {
  "rezygisk",
  "libzygisk",
  "zygiskd",
  "cp32.sock",
  "cp64.sock",
  "init_monitor",
  "rezygiskd",
  NULL
};

static const char *HIDE_ENV_VARS[] = {
  "ZYGISK_ENABLED",
  "REZYGISK_DEBUG",
  NULL
};

void anti_detect_init(void) {
  anti_detect_scrub_env();
}

void anti_detect_scrub_env(void) {
  for (size_t i = 0; HIDE_ENV_VARS[i] != NULL; i++) {
    unsetenv(HIDE_ENV_VARS[i]);
  }
}

bool anti_detect_should_hide(const char *path) {
  if (!path || !*path) return false;

  for (size_t i = 0; HIDE_PATTERNS[i] != NULL; i++) {
    if (strstr(path, HIDE_PATTERNS[i]) != NULL) return true;
  }

  return false;
}
