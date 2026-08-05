#include <stdlib.h>
#include <string.h>
#include <errno.h>

#include <sys/stat.h>
#include <unistd.h>

#include "../utils.h"
#include "common.h"

#include "apatch.h"

#define APATCH_APD_PATH "/data/adb/ap/bin/apd"
#define APATCH_PACKAGE_CONFIG_PATH "/data/adb/ap/package_config"

static struct {
  struct package_config *configs;
  size_t size;
  dev_t device;
  ino_t inode;
  off_t file_size;
  time_t mtime;
  bool loaded;
} apatch_config_cache = { 0 };

void apatch_get_existence(struct root_impl_state *state) {
  if (access(APATCH_APD_PATH, X_OK) != 0) {
    state->state = Inexistent;

    return;
  }

  char apatch_version[32];
  const char *const argv[] = { "apd", "-V", NULL };

  if (!exec_command(apatch_version, sizeof(apatch_version), APATCH_APD_PATH, argv)) {
    LOGE("Failed to execute apd binary: %s", strerror(errno));

    state->state = Inexistent;

    return;
  }

  const char *prefix = "apd ";
  if (strncmp(apatch_version, prefix, strlen(prefix)) != 0) {
    LOGE("Unexpected apd version output: %s", apatch_version);

    state->state = Abnormal;

    return;
  }

  char *end = NULL;
  errno = 0;
  long version = strtol(apatch_version + strlen(prefix), &end, 10);
  if (errno != 0 || end == apatch_version + strlen(prefix) || *end != '\0') {
    LOGE("Invalid apd version output: %s", apatch_version);

    state->state = Abnormal;

    return;
  }

  if (version == 0) state->state = Abnormal;
  else if (version >= MIN_APATCH_VERSION && version <= 999999) state->state = Supported;
  else if (version >= 1 && version <= MIN_APATCH_VERSION - 1) state->state = TooOld;
  else state->state = Abnormal;
}

struct package_config {
  char *process;
  uid_t uid;
  bool root_granted;
  bool umount_needed;
};

static void free_package_configs(struct package_config *configs, size_t size) {
  for (size_t i = 0; i < size; i++) {
    free(configs[i].process);
  }

  free(configs);
}

static bool apatch_config_is_current(const struct stat *st) {
  return apatch_config_cache.loaded &&
         apatch_config_cache.device == st->st_dev &&
         apatch_config_cache.inode == st->st_ino &&
         apatch_config_cache.file_size == st->st_size &&
         apatch_config_cache.mtime == st->st_mtime;
}

static bool apatch_load_package_config(void) {
  struct stat st;
  if (stat(APATCH_PACKAGE_CONFIG_PATH, &st) == -1) {
    LOGE("Failed to stat APatch's package_config: %s", strerror(errno));

    return false;
  }

  if (apatch_config_is_current(&st)) return true;

  FILE *fp = fopen(APATCH_PACKAGE_CONFIG_PATH, "r");
  if (fp == NULL) {
    LOGE("Failed to open APatch's package_config: %s", strerror(errno));

    return false;
  }

  struct package_config *configs = NULL;
  size_t size = 0;
  size_t capacity = 0;

  char line[1024];
  /* INFO: Skip the CSV header */
  if (fgets(line, sizeof(line), fp) == NULL) {
    LOGE("Failed to read APatch's package_config header: %s", strerror(errno));

    fclose(fp);

    return false;
  }

  while (fgets(line, sizeof(line), fp) != NULL) {
    char *save_ptr = NULL;
    const char *process_str = strtok_r(line, ",", &save_ptr);
    if (process_str == NULL) continue;

    const char *exclude_str = strtok_r(NULL, ",", &save_ptr);
    if (exclude_str == NULL) continue;

    const char *allow_str = strtok_r(NULL, ",", &save_ptr);
    if (allow_str == NULL) continue;

    const char *uid_str = strtok_r(NULL, ",", &save_ptr);
    if (uid_str == NULL) continue;

    char *process = strdup(process_str);
    if (process == NULL) {
      LOGE("Failed to strdup for the process \"%s\": %s", process_str, strerror(errno));

      goto fail;
    }

    if (size == capacity) {
      size_t new_capacity = capacity == 0 ? 16 : capacity * 2;
      struct package_config *tmp_configs = realloc(configs, new_capacity * sizeof(*configs));
      if (tmp_configs == NULL) {
        LOGE("Failed to realloc APatch config struct: %s", strerror(errno));

        free(process);

        goto fail;
      }

      configs = tmp_configs;
      capacity = new_capacity;
    }

    configs[size] = (struct package_config){
      .process = process,
      .uid = (uid_t)atoi(uid_str),
      .root_granted = strcmp(allow_str, "1") == 0,
      .umount_needed = strcmp(exclude_str, "1") == 0
    };
    size++;
  }

  fclose(fp);

  free_package_configs(apatch_config_cache.configs, apatch_config_cache.size);
  apatch_config_cache.configs = configs;
  apatch_config_cache.size = size;
  apatch_config_cache.device = st.st_dev;
  apatch_config_cache.inode = st.st_ino;
  apatch_config_cache.file_size = st.st_size;
  apatch_config_cache.mtime = st.st_mtime;
  apatch_config_cache.loaded = true;

  return true;

  fail:
    fclose(fp);
    free_package_configs(configs, size);

    return false;
}

bool apatch_uid_granted_root(uid_t uid) {
  if (!apatch_load_package_config()) return false;

  for (size_t i = 0; i < apatch_config_cache.size; i++) {
    if (apatch_config_cache.configs[i].uid != uid) continue;

    return apatch_config_cache.configs[i].root_granted;
  }

  return false;
}

bool apatch_uid_should_umount(uid_t uid, const char *const process) {
  if (!apatch_load_package_config()) return false;

  for (size_t i = 0; i < apatch_config_cache.size; i++) {
    if (apatch_config_cache.configs[i].uid != uid) continue;

    return apatch_config_cache.configs[i].umount_needed;
  }

  /* INFO: Isolated services have different UIDs than the main app, and
             while libzygisk.so has code to send the UID of the app related
             to the isolated service, we add this so that in case it fails,
             this should avoid it pass through as Mounted.
  */
  if (IS_ISOLATED_SERVICE(uid) && process) {
    size_t targeted_process_length = strlen(process);

    for (size_t i = 0; i < apatch_config_cache.size; i++) {
      size_t config_process_length = strlen(apatch_config_cache.configs[i].process);
      if (targeted_process_length < config_process_length) continue;

      if (strncmp(apatch_config_cache.configs[i].process, process, config_process_length) != 0) continue;
      if (process[config_process_length] != '\0' && process[config_process_length] != ':') continue;

      return apatch_config_cache.configs[i].umount_needed;
    }
  }

  return false;
}

bool apatch_uid_is_manager(uid_t uid) {
  static const char *apatch_manager_paths[] = {
    "/data/user_de/0/me.bmax.apatch",
    "/data/user_de/0/io.github.a13e300.tools.apatch",
    NULL
  };

  for (size_t i = 0; apatch_manager_paths[i] != NULL; i++) {
    struct stat st;
    if (stat(apatch_manager_paths[i], &st) == 0) {
      return st.st_uid == uid;
    }
  }

  return false;
}
