import { create } from 'zustand'

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(theme)
}

export const useThemeStore = create((set) => ({
  theme: 'dark',

  init: () => {
    // Read what the blocking script already applied — don't re-detect OS
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('finadvisor-theme')
    const theme = stored === 'light' ? 'light' : 'dark'
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
