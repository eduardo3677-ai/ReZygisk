import { exec } from './kernelsu.js'

const SOURCE_MARKER = '__REZYGISK_LOG_SOURCE__:'
const NATIVE_LOG_PATTERN = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(?:\[(\d+):(\d+)\]\s*)?([VDIWEF])\/([^:]+):\s*(.*)$/

const LOG_SOURCES = [
  { path: '/data/adb/rezygisk/rezygisk.log', name: 'Native', type: 'native' },
  { path: '/data/adb/modules/rezygisk/rezygisk.log', name: 'Module fallback', type: 'native' },
  { path: '/data/adb/rezygisk/webui_error.log', name: 'WebUI', type: 'webui' }
]

export const LEVEL_PRIORITY = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5 }

const readCommand = "/system/bin/sh -c 'for file in /data/adb/rezygisk/rezygisk.log /data/adb/modules/rezygisk/rezygisk.log /data/adb/rezygisk/webui_error.log; do if [ -f \"$file\" ]; then printf \"__REZYGISK_LOG_SOURCE__:%s\\n\" \"$file\"; /system/bin/tail -n 350 \"$file\"; fi; done'"
const readAllCommand = "/system/bin/sh -c 'for file in /data/adb/rezygisk/rezygisk.log /data/adb/modules/rezygisk/rezygisk.log /data/adb/rezygisk/webui_error.log; do if [ -f \"$file\" ]; then printf \"__REZYGISK_LOG_SOURCE__:%s\\n\" \"$file\"; /system/bin/cat \"$file\"; fi; done'"

function sourceForPath(path) {
  return LOG_SOURCES.find((source) => source.path === path) || {
    path,
    name: 'Unknown source',
    type: 'unknown'
  }
}

function parseLogLine(raw, source) {
  const nativeMatch = raw.match(NATIVE_LOG_PATTERN)
  if (nativeMatch) {
    return {
      raw,
      source,
      timestamp: nativeMatch[1],
      pid: nativeMatch[2] || null,
      tid: nativeMatch[3] || null,
      level: nativeMatch[4],
      tag: nativeMatch[5],
      message: nativeMatch[6],
      kind: 'native'
    }
  }

  const isHeader = raw.includes('===') || raw.includes('---')
  const isWebUiError = source.type === 'webui' && /^error/i.test(raw)

  return {
    raw,
    source,
    timestamp: null,
    pid: null,
    tid: null,
    level: isWebUiError ? 'E' : null,
    tag: null,
    message: raw,
    kind: isHeader ? 'header' : 'raw'
  }
}

export async function readLogEntries() {
  const result = await exec(readCommand)
  if (!result || result.errno !== 0) {
    throw new Error((result && result.stderr) || 'Unable to read the ReZygisk log files.')
  }

  const entries = []
  let source = LOG_SOURCES[0]
  for (const raw of (result.stdout || '').split(/\r?\n/)) {
    if (raw.startsWith(SOURCE_MARKER)) {
      source = sourceForPath(raw.slice(SOURCE_MARKER.length))

      continue
    }

    if (!raw.trim()) continue
    entries.push(parseLogLine(raw, source))
  }

  return entries
}

export async function readAllLogText() {
  const result = await exec(readAllCommand)
  if (!result || result.errno !== 0) {
    throw new Error((result && result.stderr) || 'Unable to read the ReZygisk log files.')
  }

  const lines = []
  let source = null
  let sourceLines = []
  const flushSource = () => {
    if (!source || sourceLines.length === 0) return

    if (lines.length > 0) lines.push('')
    lines.push(`=== ReZygisk log source: ${source.name} ===`, ...sourceLines)
    sourceLines = []
  }

  for (const raw of (result.stdout || '').split(/\r?\n/)) {
    if (raw.startsWith(SOURCE_MARKER)) {
      flushSource()
      source = sourceForPath(raw.slice(SOURCE_MARKER.length))

      continue
    }

    if (source && raw) sourceLines.push(raw)
  }

  flushSource()

  return lines.join('\n')
}

export function filterLogEntries(entries, query, minimumLevel) {
  const normalizedQuery = query.trim().toLowerCase()
  const minimumPriority = minimumLevel === 'ALL' ? -1 : LEVEL_PRIORITY[minimumLevel]

  return entries.filter((entry) => {
    if (normalizedQuery) {
      const searchable = `${entry.source.name} ${entry.raw}`.toLowerCase()
      if (!searchable.includes(normalizedQuery)) return false
    }

    if (minimumPriority < 0) return true
    return entry.level !== null && LEVEL_PRIORITY[entry.level] >= minimumPriority
  })
}

export async function clearLogFiles() {
  const result = await exec('/system/bin/rm -f /data/adb/rezygisk/rezygisk.log /data/adb/modules/rezygisk/rezygisk.log /data/adb/rezygisk/webui_error.log')
  if (!result || result.errno !== 0) {
    throw new Error((result && result.stderr) || 'Unable to clear the ReZygisk log files.')
  }
}
