import { loadPage } from '../pageLoader.js'
import utils from '../utils.js'
import { exec, fullScreen } from '../../kernelsu.js'

function _writeState(ConfigState) {
  return localStorage.setItem('/ReZygisk/webui_config', JSON.stringify(ConfigState))
}

export async function loadOnce() {

}

export async function loadOnceView() {

}

export async function onceViewAfterUpdate() {

}

export async function load() {
  let ConfigState = {
    disableFullscreen: false,
    enableSystemFont: false
  }

  let webui_config = localStorage.getItem('/ReZygisk/webui_config')

  if (!webui_config) {
    localStorage.setItem('/ReZygisk/webui_config', JSON.stringify(ConfigState))
  } else {
    ConfigState = JSON.parse(webui_config)
  }

  utils.addListener(document.getElementById('lang_page_toggle'), 'click', () => {
    loadPage('mini_settings_language')
  })

  utils.addListener(document.getElementById('theme_page_toggle'), 'click', () => {
    loadPage('mini_settings_theme')
  })

  const rz_webui_fullscreen_switch = document.getElementById('rz_webui_fullscreen_switch')
  if (ConfigState.disableFullscreen) rz_webui_fullscreen_switch.checked = true

  utils.addListener(rz_webui_fullscreen_switch, 'click', () => {
    /* INFO: This is swapped, as it meant to disable the fullscreen */
    ConfigState.disableFullscreen = !ConfigState.disableFullscreen
    _writeState(ConfigState)

    fullScreen(!ConfigState.disableFullscreen)
  })

  const rz_webui_font_switch = document.getElementById('rz_webui_font_switch')
  if (ConfigState.enableSystemFont) rz_webui_font_switch.checked = true

  utils.addListener(rz_webui_font_switch, 'click', () => {
    /* INFO: This is swapped, as it meant to enable the system font */
    ConfigState.enableSystemFont = !ConfigState.enableSystemFont

    if (ConfigState.enableSystemFont) {
      const headTag = document.getElementsByTagName('head')[0]
      const styleTag = document.createElement('style')

      styleTag.id = 'font-tag'
      headTag.appendChild(styleTag)
      styleTag.innerHTML = `
        :root {
          --font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif
        }`
    } else {
      const fontTag = document.getElementById('font-tag')
      if (fontTag) fontTag.remove()
    }

    _writeState(ConfigState)
  })

  const rz_webui_logging_switch = document.getElementById('rz_webui_logging_switch')
  if (rz_webui_logging_switch) {
    exec('/system/bin/test -f /data/adb/rezygisk/debug_logging || /system/bin/test -f /data/adb/modules/rezygisk/debug_logging').then((res) => {
      if (res && res.errno === 0) {
        rz_webui_logging_switch.checked = true
      }
    }).catch(() => {})

    utils.addListener(rz_webui_logging_switch, 'change', async () => {
      if (rz_webui_logging_switch.checked) {
        await exec('/system/bin/touch /data/adb/rezygisk/debug_logging /data/adb/modules/rezygisk/debug_logging 2>/dev/null || true').catch(() => {})
        
        const captureCmd = [
          'echo "=== ReZygisk Log Dump $(date) ===" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null',
          'echo "--- LOGCAT (Zygisk / ReZygisk / LSPosed / Daemon) ---" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null',
          'logcat -d -t 500 2>/dev/null | grep -iE "zygisk|rezygisk|lsposed|apatch|apd|ksu" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null || logcat -d -t 200 2>/dev/null >> /data/adb/rezygisk/rezygisk.log 2>/dev/null || true',
          'echo "--- DMESG (Kernel Logs) ---" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null',
          'dmesg 2>/dev/null | tail -n 100 >> /data/adb/rezygisk/rezygisk.log 2>/dev/null || true'
        ].join(' && ')

        await exec(captureCmd).catch(() => {})
      } else {
        await exec('/system/bin/rm -f /data/adb/rezygisk/debug_logging /data/adb/modules/rezygisk/debug_logging /data/adb/rezygisk/rezygisk.log /data/adb/modules/rezygisk/rezygisk.log /data/adb/rezygisk/webui_error.log 2>/dev/null || true').catch(() => {})
      }
    })
  }
}
