#ifndef ZYGISK_COMPAT_H
#define ZYGISK_COMPAT_H

#include <jni.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#define ZYGISK_COMPAT_API_VERSION 2

#define ZYGISK_OPTION_FORCE_DENYLIST_UNMOUNT 0
#define ZYGISK_OPTION_DLCLOSE_MODULE_LIBRARY 1

struct zygisk_compat_module_abi {
  long api_version;
  void *module_this;

  void (*preAppSpecialize)(void *module_this, void *args);
  void (*postAppSpecialize)(void *module_this, const void *args);
  void (*preServerSpecialize)(void *module_this, void *args);
  void (*postServerSpecialize)(void *module_this, const void *args);
};

struct zygisk_compat_app_specialize_args {
  jint *uid;
  jint *gid;
  jintArray *gids;
  jint *runtime_flags;
  jint *mount_external;
  jstring *se_info;
  jstring *nice_name;
  jstring *instruction_set;
  jstring *app_data_dir;

  jboolean *is_child_zygote;
  jboolean *is_top_app;
  jobjectArray *pkg_data_info_list;
  jobjectArray *whitelisted_data_info_list;
  jboolean *mount_data_dirs;
  jboolean *mount_storage_dirs;
};

struct zygisk_compat_server_specialize_args {
  jint *uid;
  jint *gid;
  jintArray *gids;
  jint *runtime_flags;
  jlong *permitted_capabilities;
  jlong *effective_capabilities;
};

struct zygisk_compat_api_table {
  void *impl;
  bool (*registerModule)(struct zygisk_compat_api_table *table, struct zygisk_compat_module_abi *abi);

  void (*hookJniNativeMethods)(JNIEnv *env, const char *className, JNINativeMethod *methods, int numMethods);
  void (*pltHookRegister)(const char *regex, const char *symbol, void *newFunc, void **oldFunc);
  void (*pltHookExclude)(const char *regex, const char *symbol);
  bool (*pltHookCommit)();

  int (*connectCompanion)(void *impl);
  void (*setOption)(void *impl, int opt);
  int (*getModuleDir)(void *impl);
  uint32_t (*getFlags)(void *impl);
};

typedef void (*zygisk_compat_entry_fn)(struct zygisk_compat_api_table *table, JNIEnv *env);

void zygisk_compat_set_callbacks(
  void (*hook_jni)(JNIEnv *, const char *, JNINativeMethod *, int),
  void (*plt_register)(const char *, const char *, void *, void **),
  void (*plt_exclude)(const char *, const char *),
  bool (*plt_commit)(),
  int (*connect_companion)(void *),
  void (*set_option)(void *, int),
  int (*get_module_dir)(void *),
  uint32_t (*get_flags)(void)
);

size_t zygisk_compat_get_count(void);
void zygisk_compat_reset(void);

size_t zygisk_compat_call_entry(void *entry, JNIEnv *env);

void zygisk_compat_call_pre_app(void *args);
void zygisk_compat_call_post_app(const void *args);
void zygisk_compat_call_pre_server(void *args);
void zygisk_compat_call_post_server(const void *args);

bool zygisk_compat_is_unload_requested(void);

#endif
