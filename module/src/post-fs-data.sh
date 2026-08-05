#!/system/bin/sh

set -e

MODDIR=${0%/*}
if [ "$ZYGISK_ENABLED" ]; then
  exit 0
fi

cd "$MODDIR"

if [ "$(which magisk)" ]; then
  for file in ../*; do
    if [ -d "$file" ] && [ -d "$file/zygisk" ] && ! [ -f "$file/disable" ]; then
      if [ -f "$file/post-fs-data.sh" ]; then
        cd "$file"
        log -p i -t "zygisk-sh" "Manually trigger post-fs-data.sh for $file"
        sh "$(realpath ./post-fs-data.sh)" || log -p e -t "zygisk-sh" "post-fs-data.sh failed for $file"
        cd "$MODDIR"
      fi
    fi
  done
fi

create_sys_perm() {
  mkdir -p "$1"
  chmod 555 "$1"
  chcon u:object_r:system_file:s0 "$1" 2>/dev/null || true
}

export TMP_PATH=/data/adb/rezygisk
mkdir -p "$TMP_PATH"
# Clean up temporary sockets and runtime state, preserving config.json and logs
rm -f "$TMP_PATH"/*.sock "$TMP_PATH"/init_monitor "$TMP_PATH"/state.json "$TMP_PATH"/webui_error.log 2>/dev/null || true

# Pre-create and label the native log before locking down the runtime directory.
# Native processes open it without O_CREAT, so zygote never needs directory write access.
touch "$TMP_PATH/rezygisk.log"
chmod 600 "$TMP_PATH/rezygisk.log"
chcon u:object_r:rezygisk_log_file:s0 "$TMP_PATH/rezygisk.log" 2>/dev/null || true

create_sys_perm "$TMP_PATH"

sh /data/adb/post-fs-data.d/rezygisk.sh || true

CPU_ABIS_PROP1=$(getprop ro.system.product.cpu.abilist)
CPU_ABIS_PROP2=$(getprop ro.product.cpu.abilist)

if [ "${#CPU_ABIS_PROP2}" -gt "${#CPU_ABIS_PROP1}" ]; then
  CPU_ABIS=$CPU_ABIS_PROP2
else
  CPU_ABIS=$CPU_ABIS_PROP1
fi

PTRACER=""
case "$CPU_ABIS" in
  *arm64-v8a*|*x86_64*)
    PTRACER="./bin/zygisk-ptrace64"
    ;;
  *)
    PTRACER="./bin/zygisk-ptrace32"
    ;;
esac

if [ -x "$PTRACER" ]; then
  "$PTRACER" monitor &
else
  log -p e -t "zygisk-sh" "Ptracer binary not found: $PTRACER"
fi

exit 0
