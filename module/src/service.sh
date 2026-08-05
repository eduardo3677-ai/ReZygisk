#!/system/bin/sh

set -e

DEBUG=@DEBUG@

MODDIR=${0%/*}

if [ "$ZYGISK_ENABLED" ]; then
  sed -i "s/^description=/description=[Disable Magisk's built-in Zygisk] /" "$MODDIR/module.prop"
  exit 0
fi

cd "$MODDIR"

if [ "$(which magisk)" ]; then
  for file in ../*; do
    if [ -d "$file" ] && [ -d "$file/zygisk" ] && ! [ -f "$file/disable" ]; then
      if [ -f "$file/service.sh" ]; then
        cd "$file"
        log -p i -t "zygisk-sh" "Manually trigger service.sh for $file"
        sh "$(realpath ./service.sh)" & 2>/dev/null || log -p e -t "zygisk-sh" "service.sh failed for $file"
        cd "$MODDIR"
      fi
    fi
  done
fi

# Background log collector if debug logging is enabled
if [ -f /data/adb/rezygisk/debug_logging ] || [ -f "$MODDIR/debug_logging" ] || grep -q '"debugLogging": true' /data/adb/rezygisk/config.json 2>/dev/null; then
  log -p i -t "rezygisk-log" "Starting background log collector"
  (
    echo "=== ReZygisk Boot Log $(date) ===" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null
    logcat -v time 2>/dev/null | grep -iE "zygisk|rezygisk|pmpatch|luckypatcher|lsposed|apatch|apd|ksu" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null
  ) &
fi

exit 0
