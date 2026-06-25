import { create } from 'zustand'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('finadvisor-theme')
  if (stored === 'dark' || stored === 'light') return stored
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
    const theme = getInitialTheme()
    applyTheme(theme)
    set({ theme })

    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', (e) => {
      const stored = localStorage.getItem('finadvisor-theme')
      if (stored) return
      const next = e.matches ? 'light' : 'dark'
      applyTheme(next)
      set({ theme: next })
    })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    localStorage.setItem('finadvisor-theme', theme)
    set({ theme })
  },

  toggleTheme: () => {
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      localStorage.setItem('finadvisor-theme', next)
      return { theme: next }
    })
  },
}))
