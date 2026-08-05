import { loadPage } from '../pageLoader.js'
import utils from '../utils.js'
import { exec, fullScreen, toast } from '../../kernelsu.js'
import { loadPersistentConfig, savePersistentConfig } from '../../configManager.js'

let rawLogLines = []

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function parseAndRenderLogs() {
  const consoleDiv = document.getElementById('rz_log_console')
  const levelSelect = document.getElementById('rz_log_level_select')
  const searchInput = document.getElementById('rz_log_search_input')
  if (!consoleDiv) return

  const selectedLevel = levelSelect ? levelSelect.value : 'ALL'
  const filterQuery = searchInput ? searchInput.value.trim().toLowerCase() : ''

  const levelPriority = { 'E': 4, 'F': 4, 'W': 3, 'I': 2, 'D': 1, 'V': 0 }
  const targetPriority = (selectedLevel === 'ALL') ? -1 : (levelPriority[selectedLevel] || 0)

  const renderedHtml = []

  for (const rawLine of rawLogLines) {
    if (!rawLine || !rawLine.trim()) continue

    if (filterQuery && !rawLine.toLowerCase().includes(filterQuery)) continue

    const line = escapeHtml(rawLine)

    // Regex for matching: Timestamp [pid:tid] Level/Tag: Message
    // e.g., "08-05 09:03:45 [12345:12345] E/zygisk-core64: Failed to load module"
    const match = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(?:(\[\d+:\d+\])\s*)?([VDIWEF])\/([^:]+):\s*(.*)$/)

    if (match) {
      const timestamp = match[1]
      const pidTid = match[2] || ''
      const level = match[3]
      const tag = match[4]
      const message = match[5]

      const currentPrio = levelPriority[level] !== undefined ? levelPriority[level] : 1
      if (targetPriority >= 0 && currentPrio < targetPriority) continue

      let badgeStyle = 'background: #bd93f9; color: #12141d;'
      let msgColor = '#f8f8f2'

      if (level === 'E' || level === 'F') {
        badgeStyle = 'background: #ff5555; color: #fff;'
        msgColor = '#ff8888'
      } else if (level === 'W') {
        badgeStyle = 'background: #ffb86c; color: #12141d;'
        msgColor = '#f1fa8c'
      } else if (level === 'I') {
        badgeStyle = 'background: #50fa7b; color: #12141d;'
        msgColor = '#88ffaa'
      } else if (level === 'D' || level === 'V') {
        badgeStyle = 'background: #bd93f9; color: #12141d;'
        msgColor = '#d6acff'
      }

      renderedHtml.push(`
        <div style="margin-bottom: 3px; font-family: monospace;">
          <span style="color: #8be9fd;">${timestamp}</span>
          ${pidTid ? `<span style="color: #6272a4;">${pidTid}</span>` : ''}
          <span style="${badgeStyle} padding: 1px 5px; border-radius: 3px; font-weight: bold; font-size: 0.85em;">${level}</span>
          <span style="color: #ff79c6; font-weight: bold;">${tag}:</span>
          <span style="color: ${msgColor};">${message}</span>
        </div>
      `)
    } else {
      // Header or unformatted log lines
      if (line.includes('===') || line.includes('---')) {
        renderedHtml.push(`<div style="color: #50fa7b; font-weight: bold; margin: 6px 0;">${line}</div>`)
      } else {
        renderedHtml.push(`<div style="color: #f8f8f2; opacity: 0.85;">${line}</div>`)
      }
    }
  }

  if (renderedHtml.length === 0) {
    consoleDiv.innerHTML = '<div style="color: #6272a4;">[ No logs matching filter ]</div>'
  } else {
    consoleDiv.innerHTML = renderedHtml.join('')
    consoleDiv.scrollTop = consoleDiv.scrollHeight
  }
}

async function refreshLogDisplay() {
  const consoleDiv = document.getElementById('rz_log_console')
  if (!consoleDiv) return

  try {
    const res = await exec('/system/bin/cat /data/adb/rezygisk/rezygisk.log /data/adb/rezygisk/webui_error.log 2>/dev/null | tail -n 350')
    if (res && res.errno === 0 && res.stdout && res.stdout.trim().length > 0) {
      rawLogLines = res.stdout.trim().split('\n')
      parseAndRenderLogs()
    } else {
      rawLogLines = []
      consoleDiv.innerHTML = '<div style="color: #6272a4;">[ No logs recorded yet. Enable ReZygisk File Logging above to start logging C/C++ events. ]</div>'
    }
  } catch (e) {
    consoleDiv.innerHTML = `<div style="color: #ff5555;">Failed to load logs: ${escapeHtml(String(e))}</div>`
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
        toast('Native ReZygisk logging enabled')
      } else {
        toast('Native ReZygisk logging disabled & logs cleared')
      }
      refreshLogDisplay()
    })
  }

  const levelSelect = document.getElementById('rz_log_level_select')
  if (levelSelect) {
    utils.addListener(levelSelect, 'change', () => {
      parseAndRenderLogs()
    })
  }

  const searchInput = document.getElementById('rz_log_search_input')
  if (searchInput) {
    utils.addListener(searchInput, 'input', () => {
      parseAndRenderLogs()
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
      rawLogLines = []
      toast('Logs cleared')
      refreshLogDisplay()
    })
  }

  refreshLogDisplay()
}
