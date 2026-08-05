import { loadPage } from '../pageLoader.js'
import utils from '../utils.js'
import { exec, fullScreen, toast } from '../../kernelsu.js'
import { loadPersistentConfig, savePersistentConfig } from '../../configManager.js'

async function refreshLogDisplay() {
  const display = document.getElementById('rz_log_display')
  if (!display) return

  try {
    const res = await exec('/system/bin/cat /data/adb/rezygisk/rezygisk.log /data/adb/rezygisk/webui_error.log 2>/dev/null | tail -n 250')
    if (res && res.errno === 0 && res.stdout && res.stdout.trim().length > 0) {
      display.value = res.stdout.trim()
      display.scrollTop = display.scrollHeight
    } else {
      display.value = '[ No logs recorded yet ]\nEnable file logging above or click Refresh to capture live logcat logs.'
    }
  } catch (e) {
    display.value = 'Failed to load logs: ' + e
  }
}

export async function loadOnce() {

}

export async function loadOnceView() {
  refreshLogDisplay()
}

export async function onceViewAfterUpdate() {
  refreshLogDisplay()
}

export async function load() {
  const config = await loadPersistentConfig()

  utils.addListener(document.getElementById('lang_page_toggle'), 'click', () => {
    loadPage('mini_settings_language')
  })

  utils.addListener(document.getElementById('theme_page_toggle'), 'click', () => {
    loadPage('mini_settings_theme')
  })

  const rz_webui_fullscreen_switch = document.getElementById('rz_webui_fullscreen_switch')
  if (config.disableFullscreen) rz_webui_fullscreen_switch.checked = true

  utils.addListener(rz_webui_fullscreen_switch, 'click', async () => {
    config.disableFullscreen = !config.disableFullscreen
    await savePersistentConfig({ disableFullscreen: config.disableFullscreen })
    fullScreen(!config.disableFullscreen)
  })

  const rz_webui_font_switch = document.getElementById('rz_webui_font_switch')
  if (config.enableSystemFont) rz_webui_font_switch.checked = true

  utils.addListener(rz_webui_font_switch, 'click', async () => {
    config.enableSystemFont = !config.enableSystemFont

    if (config.enableSystemFont) {
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

    await savePersistentConfig({ enableSystemFont: config.enableSystemFont })
  })

  const rz_webui_logging_switch = document.getElementById('rz_webui_logging_switch')
  if (rz_webui_logging_switch) {
    if (config.debugLogging) rz_webui_logging_switch.checked = true

    utils.addListener(rz_webui_logging_switch, 'change', async () => {
      const isChecked = rz_webui_logging_switch.checked
      await savePersistentConfig({ debugLogging: isChecked })

      if (isChecked) {
        toast('File logging enabled')
        const captureCmd = [
          'echo "=== ReZygisk Log Dump $(date) ===" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null',
          'echo "--- LOGCAT (Zygisk / ReZygisk / LSPosed / Daemon) ---" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null',
          'logcat -d -t 500 2>/dev/null | grep -iE "zygisk|rezygisk|lsposed|apatch|apd|ksu" >> /data/adb/rezygisk/rezygisk.log 2>/dev/null || logcat -d -t 200 2>/dev/null >> /data/adb/rezygisk/rezygisk.log 2>/dev/null || true'
        ].join(' && ')

        await exec(captureCmd).catch(() => {})
      } else {
        toast('File logging disabled & logs cleared')
      }
      refreshLogDisplay()
    })
  }

  const refreshBtn = document.getElementById('rz_log_refresh_btn')
  if (refreshBtn) {
    utils.addListener(refreshBtn, 'click', async () => {
      toast('Refreshing logs...')
      await refreshLogDisplay()
    })
  }

  const clearBtn = document.getElementById('rz_log_clear_btn')
  if (clearBtn) {
    utils.addListener(clearBtn, 'click', async () => {
      await exec('/system/bin/rm -f /data/adb/rezygisk/rezygisk.log /data/adb/rezygisk/webui_error.log 2>/dev/null || true')
      toast('Logs cleared')
      refreshLogDisplay()
    })
  }

  refreshLogDisplay()
}
