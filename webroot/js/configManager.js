import { exec } from './kernelsu.js'

const CONFIG_FILE = '/data/adb/rezygisk/config.json'
const DEBUG_FLAG_REZYGISK = '/data/adb/rezygisk/debug_logging'
const DEBUG_FLAG_MODULE = '/data/adb/modules/rezygisk/debug_logging'
const LOG_FILE = '/data/adb/rezygisk/rezygisk.log'
const LOG_FILE_FALLBACK = '/data/adb/modules/rezygisk/rezygisk.log'
const ERROR_LOG = '/data/adb/rezygisk/webui_error.log'

export const defaultConfig = {
  theme: 'system',
  language: 'en_US',
  disableFullscreen: false,
  enableSystemFont: false,
  debugLogging: false
}

let cachedConfig = { ...defaultConfig }

export async function loadPersistentConfig() {
  try {
    const res = await exec(`/system/bin/cat ${CONFIG_FILE}`)
    if (res && res.errno === 0 && res.stdout) {
      const diskConfig = JSON.parse(res.stdout.trim())
      cachedConfig = { ...defaultConfig, ...diskConfig }
    } else {
      const sys_theme = localStorage.getItem('/ReZygisk/theme') || 'system'
      const language = localStorage.getItem('/TreatWheel/language') || 'en_US'
      const webui_config = JSON.parse(localStorage.getItem('/ReZygisk/webui_config') || '{}')
      
      const debugCheck = await exec(`/system/bin/test -f ${DEBUG_FLAG_REZYGISK} || /system/bin/test -f ${DEBUG_FLAG_MODULE}`)
      const debugLogging = (debugCheck && debugCheck.errno === 0)

      cachedConfig = {
        theme: sys_theme,
        language: language,
        disableFullscreen: !!webui_config.disableFullscreen,
        enableSystemFont: !!webui_config.enableSystemFont,
        debugLogging: debugLogging
      }
      await savePersistentConfig(cachedConfig)
    }
  } catch (e) {
    console.error('Failed to load persistent config from disk:', e)
  }

  localStorage.setItem('/ReZygisk/theme', cachedConfig.theme)
  localStorage.setItem('/TreatWheel/language', cachedConfig.language)
  localStorage.setItem('/ReZygisk/webui_config', JSON.stringify({
    disableFullscreen: cachedConfig.disableFullscreen,
    enableSystemFont: cachedConfig.enableSystemFont
  }))

  return cachedConfig
}

export async function savePersistentConfig(partialConfig) {
  cachedConfig = { ...cachedConfig, ...partialConfig }

  if (partialConfig.theme !== undefined) {
    localStorage.setItem('/ReZygisk/theme', cachedConfig.theme)
  }
  if (partialConfig.language !== undefined) {
    localStorage.setItem('/TreatWheel/language', cachedConfig.language)
  }
  if (partialConfig.disableFullscreen !== undefined || partialConfig.enableSystemFont !== undefined) {
    localStorage.setItem('/ReZygisk/webui_config', JSON.stringify({
      disableFullscreen: cachedConfig.disableFullscreen,
      enableSystemFont: cachedConfig.enableSystemFont
    }))
  }

  if (partialConfig.debugLogging !== undefined) {
    if (cachedConfig.debugLogging) {
      await exec(`/system/bin/mkdir -p /data/adb/rezygisk && /system/bin/touch ${DEBUG_FLAG_REZYGISK} ${DEBUG_FLAG_MODULE} 2>/dev/null || true`).catch(() => {})
    } else {
      await exec(`/system/bin/rm -f ${DEBUG_FLAG_REZYGISK} ${DEBUG_FLAG_MODULE} ${LOG_FILE_FALLBACK} ${ERROR_LOG} 2>/dev/null; if [ -f ${LOG_FILE} ]; then : > ${LOG_FILE}; fi`).catch(() => {})
    }
  }

  try {
    const jsonStr = JSON.stringify(cachedConfig, null, 2).replace(/'/g, "'\\''")
    await exec(`/system/bin/mkdir -p /data/adb/rezygisk && echo '${jsonStr}' > ${CONFIG_FILE}`).catch(() => {})
  } catch (e) {
    console.error('Failed to write persistent config to disk:', e)
  }

  return cachedConfig
}

export function getCachedConfig() {
  return cachedConfig
}
