import { create } from 'zustand'

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(theme)
}

export const useThemeStore = create((set) => ({
  theme: 'dark',

  init: () => {
    const theme = getSystemTheme()
    applyTheme(theme)
    set({ theme })

    // Listen for OS-level changes (e.g. user switches system to dark at night)
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', (e) => {
      const next = e.matches ? 'light' : 'dark'
      applyTheme(next)
      set({ theme: next })
    })
  },

  // Keep setTheme for any internal usage but it now just syncs state
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
}))
