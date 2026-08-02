#!/system/bin/sh

set -e

export TMP_PATH=/data/adb/rezygisk
rm -rf "$TMP_PATH"

rm -f /data/adb/post-fs-data.d/rezygisk.sh
rm -f /data/adb/post-mount.d/rezygisk.sh

rm -f /data/adb/rezygisk/state.json 2>/dev/null || true
rm -f /data/adb/rezygisk/webui_error.log 2>/dev/null || true

rmdir /data/adb/post-fs-data.d 2>/dev/null || true
rmdir /data/adb/post-mount.d 2>/dev/null || true

exit 0
