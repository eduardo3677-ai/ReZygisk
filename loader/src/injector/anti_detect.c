#include <stdlib.h>
#include <string.h>

#define LOG_TAG "zygisk"
#include "logging.h"

#include "anti_detect.h"

static const char *HIDE_ENV_VARS[] = {
  "ZYGISK_ENABLED",
  "REZYGISK_DEBUG",
  NULL
};

void anti_detect_init(void) {
  for (size_t i = 0; HIDE_ENV_VARS[i] != NULL; i++) {
    unsetenv(HIDE_ENV_VARS[i]);
  }
}
