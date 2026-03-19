import { create } from 'zustand'

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(theme)
}

export const useThemeStore = create((set) => ({
  theme: 'dark',

  init: () => {
    const saved = localStorage.getItem('theme') || 'dark'
    applyTheme(saved)
    set({ theme: saved })
  },

  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    applyTheme(theme)
    set({ theme })
  },
}))