import { loadPage } from '../pageLoader.js'
import utils from '../utils.js'
import { fullScreen, toast } from '../../kernelsu.js'
import { loadPersistentConfig, savePersistentConfig } from '../../configManager.js'

export async function loadOnce() {

}

export async function loadOnceView() {
}

export async function onceViewAfterUpdate() {
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
    })
  }
}
