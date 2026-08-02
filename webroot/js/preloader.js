import { exec, fullScreen } from './kernelsu.js'
import { setDark } from './themes/dark.js'
import { setThemeData, themeList } from './themes/main.js'
import { setLight } from './themes/light.js'
import { loadPage } from './pages/pageLoader.js'

/* INFO: This sets the default theme to system if not set */
let sys_theme = localStorage.getItem('/ReZygisk/theme')
if (!sys_theme) sys_theme = setThemeData('system')
themeList[sys_theme](true)

const ConfigState = JSON.parse(localStorage.getItem('/ReZygisk/webui_config') || '{}')

if (!ConfigState.disableFullscreen) fullScreen(true)

if (ConfigState.enableSystemFont) {
  const headTag = document.getElementsByTagName('head')[0]
  const styleTag = document.createElement('style')
  styleTag.id = 'font-tag'
  headTag.appendChild(styleTag)
  styleTag.innerHTML = `
    :root {
      --font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif
    }`
}

/* INFO: This code are meant to load the link with any card have credit-link attribute inside it */
document.addEventListener('click', async (event) => {
  const getLink = event.target.getAttribute('credit-link')
  if (!getLink || typeof getLink !== 'string') return;

  var safeLink = getLink.replace(/[^a-zA-Z0-9._~:\/?#\[\]@!$&'()*+,;=-]/g, '')
  if (!safeLink) return

  const ptrace64Cmd = await exec("am start -a android.intent.action.VIEW -d https://" + safeLink).catch(() => {
    return window.open("https://" + safeLink, "_blank", 'toolbar=0,location=0,menubar=0')
  })

  if (ptrace64Cmd.errno !== 0) return window.open("https://" + safeLink, "_blank", 'toolbar=0,location=0,menubar=0')
}, false)

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (sys_theme !== 'system') return

  const newColorScheme = event.matches ? 'dark' : 'light'
  if (newColorScheme === 'dark') setDark()
  else if (newColorScheme === 'light') setLight()
})
