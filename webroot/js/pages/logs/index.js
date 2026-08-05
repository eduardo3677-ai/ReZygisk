import { clearLogFiles, filterLogEntries, readAllLogText, readLogEntries } from '../../logRepository.js'
import { toast } from '../../kernelsu.js'
import { whichCurrentPage } from '../navbar.js'
import utils from '../utils.js'

let entries = []
let refreshTimer = null
let searchTimer = null
let isRefreshing = false
let followTail = true

function getConsole() {
  return document.getElementById('rz_log_console')
}

function getFilteredEntries() {
  const searchInput = document.getElementById('rz_log_search_input')
  const levelSelect = document.getElementById('rz_log_level_select')

  return filterLogEntries(
    entries,
    searchInput ? searchInput.value : '',
    levelSelect ? levelSelect.value : 'ALL'
  )
}

function isAtBottom(consoleElement) {
  return consoleElement.scrollHeight - consoleElement.scrollTop - consoleElement.clientHeight < 18
}

function setStatus(message) {
  const status = document.getElementById('rz_log_status')
  if (status) status.textContent = message
}

function updateJumpButton() {
  const jumpButton = document.getElementById('rz_log_jump_btn')
  if (jumpButton) jumpButton.hidden = followTail
}

function createTextElement(className, text) {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text

  return element
}

function renderLogs({ forceBottom = false, error = null } = {}) {
  const consoleElement = getConsole()
  if (!consoleElement) return

  const shouldFollow = forceBottom || followTail
  const filteredEntries = getFilteredEntries()
  const fragment = document.createDocumentFragment()

  if (error) {
    const errorElement = document.createElement('div')
    errorElement.className = 'logs_error'
    errorElement.textContent = `Unable to load logs: ${error}`
    fragment.append(errorElement)
  } else if (filteredEntries.length === 0) {
    const emptyElement = document.createElement('div')
    emptyElement.className = 'logs_empty'
    emptyElement.textContent = entries.length === 0
      ? 'No logs recorded yet. Enable file logging in Settings to capture native events.'
      : 'No log entries match the current filters.'
    fragment.append(emptyElement)
  } else {
    for (const entry of filteredEntries) {
      const row = document.createElement('div')
      row.className = `log_entry log_entry--${entry.kind} log_entry--${entry.source.type}`

      if (entry.kind === 'header') {
        row.textContent = entry.message
      } else if (entry.kind === 'native') {
        row.append(createTextElement('log_time', entry.timestamp))
        if (entry.pid) row.append(createTextElement('log_context', `[${entry.pid}:${entry.tid}]`))
        row.append(createTextElement(`log_level log_level--${entry.level}`, entry.level))
        row.append(createTextElement('log_tag', `${entry.tag}:`))
        row.append(createTextElement('log_message', entry.message))
      } else {
        row.append(createTextElement('log_source', `[${entry.source.name}]`))
        if (entry.level) row.append(createTextElement(`log_level log_level--${entry.level}`, entry.level))
        row.append(createTextElement('log_message', entry.message))
      }

      fragment.append(row)
    }
  }

  consoleElement.textContent = ''
  consoleElement.appendChild(fragment)
  setStatus(`${filteredEntries.length} shown of ${entries.length} entries`)

  if (shouldFollow) {
    requestAnimationFrame(() => {
      consoleElement.scrollTop = consoleElement.scrollHeight
      followTail = true
      updateJumpButton()
    })
  } else {
    updateJumpButton()
  }
}

async function refreshLogs({ initial = false } = {}) {
  if (isRefreshing || whichCurrentPage() !== 'logs') return

  isRefreshing = true
  const refreshButton = document.getElementById('rz_log_refresh_btn')
  if (refreshButton) refreshButton.disabled = true

  try {
    entries = await readLogEntries()
    renderLogs({ forceBottom: initial })
  } catch (error) {
    setStatus('Unable to refresh logs')
    renderLogs({ error: String(error.message || error) })
  } finally {
    isRefreshing = false
    if (refreshButton) refreshButton.disabled = false
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer)

  refreshTimer = setInterval(() => {
    if (whichCurrentPage() !== 'logs') {
      clearInterval(refreshTimer)
      refreshTimer = null

      return
    }

    refreshLogs()
  }, 4000)
}

async function copyAllLogs() {
  let text = ''
  try {
    text = await readAllLogText()
  } catch (error) {
    toast(`Unable to read all logs: ${error.message || error}`)

    return
  }

  if (!text) {
    toast('There are no logs to copy.')

    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.append(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      if (!copied) throw new Error('Clipboard access is unavailable.')
    }

    toast('All logs copied to the clipboard.')
  } catch (error) {
    toast(`Unable to copy logs: ${error.message || error}`)
  }
}

async function downloadAllLogs() {
  let text = ''
  try {
    text = await readAllLogText()
  } catch (error) {
    toast(`Unable to read all logs: ${error.message || error}`)

    return
  }

  if (!text) {
    toast('There are no logs to save.')

    return
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const blob = new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rezygisk-${timestamp}.log`
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  toast('All logs saved.')
}

export async function loadOnce() {
}

export async function loadOnceView() {
}

export async function onceViewAfterUpdate() {
}

export async function load() {
  const consoleElement = getConsole()
  const levelSelect = document.getElementById('rz_log_level_select')
  const searchInput = document.getElementById('rz_log_search_input')
  const refreshButton = document.getElementById('rz_log_refresh_btn')
  const copyButton = document.getElementById('rz_log_copy_btn')
  const downloadButton = document.getElementById('rz_log_download_btn')
  const clearButton = document.getElementById('rz_log_clear_btn')
  const jumpButton = document.getElementById('rz_log_jump_btn')

  utils.addListener(consoleElement, 'scroll', () => {
    followTail = isAtBottom(consoleElement)
    updateJumpButton()
  })

  utils.addListener(levelSelect, 'change', () => renderLogs())
  utils.addListener(searchInput, 'input', () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => renderLogs(), 120)
  })
  utils.addListener(refreshButton, 'click', () => refreshLogs())
  utils.addListener(copyButton, 'click', copyAllLogs)
  utils.addListener(downloadButton, 'click', downloadAllLogs)
  utils.addListener(jumpButton, 'click', () => {
    followTail = true
    renderLogs({ forceBottom: true })
  })
  utils.addListener(clearButton, 'click', async () => {
    if (!window.confirm('Clear all ReZygisk and WebUI logs?')) return

    try {
      await clearLogFiles()
      entries = []
      followTail = true
      renderLogs({ forceBottom: true })
      toast('Logs cleared.')
    } catch (error) {
      toast(`Unable to clear logs: ${error.message || error}`)
    }
  })

  await refreshLogs({ initial: true })
  startAutoRefresh()
}
