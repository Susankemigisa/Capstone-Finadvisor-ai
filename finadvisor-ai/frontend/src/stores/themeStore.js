import { create } from 'zustand'

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(theme)
}

export const useThemeStore = create((set) => ({
  theme: 'dark',

  init: () => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('finadvisor-theme')
    // If user has never set a preference, fall back to OS/browser setting
    const osPrefers = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    const theme = stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : osPrefers
    applyTheme(theme)
    set({ theme })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    if (typeof window !== 'undefined') {
      localStorage.setItem('finadvisor-theme', theme)
    }
    set({ theme })
  },

  toggleTheme: () => {
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      if (typeof window !== 'undefined') {
        localStorage.setItem('finadvisor-theme', next)
      }
      return { theme: next }
    })
  },
}))