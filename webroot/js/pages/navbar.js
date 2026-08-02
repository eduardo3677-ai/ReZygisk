import { loadPage, allPages, allMiniPages } from './pageLoader.js'

export function loadNavbar() {
  document.getElementById('nibg_home').classList.add('show')
}

export function setNavbar(page) {
  if (allMiniPages.includes(page)) {
    allPages.forEach((p) => {
      const el = document.getElementById(`n_${p}`)
      if (el) el.checked = false
    })
    const target = document.getElementById(`n_${page}`)
    if (target) target.checked = true
    return
  }

  allPages.forEach((p) => {
    const el = document.getElementById(`n_${p}`)
    if (el) el.checked = false
    const bg = document.getElementById(`nibg_${p}`)
    if (bg) bg.classList.remove('show')
    const icon = document.getElementById(`ni_${p}`)
    if (icon) icon.style.background = ''
  })

  const target = document.getElementById(`n_${page}`)
  if (target) target.checked = true
  const bg = document.getElementById(`nibg_${page}`)
  if (bg) bg.classList.add('show')
  const icon = document.getElementById(`ni_${page}`)
  if (icon) icon.style.background = `url(./assets/${page}/filled.svg)`
}

export function whichCurrentPage() {
  for (const page of allPages) {
    const el = document.getElementById(`n_${page}`)
    if (el && el.checked) return page
  }

  return null
}

document.querySelectorAll('[name=navbutton]').forEach((element) => {
  element.addEventListener('click', async (event) => {
    /* INFO: Keep radio state controlled by page loader to avoid UI desync under rapid taps. */
    event.preventDefault()

    const value = event.target.value

    /* INFO: Wait for page loader so fast clicks cannot race navbar state updates. */
    await loadPage(value)
  })
})