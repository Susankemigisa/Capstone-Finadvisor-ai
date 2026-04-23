import { create } from 'zustand'
import { useMemo } from 'react'

import en from '../messages/en.json'
import fr from '../messages/fr.json'
import es from '../messages/es.json'
import pt from '../messages/pt.json'
import de from '../messages/de.json'
import sw from '../messages/sw.json'
import yo from '../messages/yo.json'
import ha from '../messages/ha.json'
import ig from '../messages/ig.json'
import am from '../messages/am.json'
import ar from '../messages/ar.json'
import zh from '../messages/zh.json'
import hi from '../messages/hi.json'
import ja from '../messages/ja.json'
import ko from '../messages/ko.json'
import ru from '../messages/ru.json'
import lg from '../messages/lg.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'pt', label: 'Português (Portuguese)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'sw', label: 'Kiswahili (Swahili)' },
  { code: 'yo', label: 'Yorùbá' },
  { code: 'ha', label: 'Hausa' },
  { code: 'ig', label: 'Igbo' },
  { code: 'am', label: 'አማርኛ (Amharic)' },
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'lg', label: 'Luganda' },
]

const TRANSLATIONS = { en, fr, es, pt, de, sw, yo, ha, ig, am, ar, zh, hi, ja, ko, ru, lg }

function flatten(obj, prefix = '') {
  return Object.entries(obj).reduce((acc, [key, val]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (Array.isArray(val)) {
      acc[fullKey] = val
    } else if (typeof val === 'object' && val !== null) {
      Object.assign(acc, flatten(val, fullKey))
    } else {
      acc[fullKey] = val
    }
    return acc
  }, {})
}

// English is always the base — other languages override on top
// This means any key missing from a language falls back to English automatically
const EN_FLAT = flatten(en)

function getMessages(lang) {
  if (lang === 'en') return EN_FLAT
  const data = TRANSLATIONS[lang] || en
  return { ...EN_FLAT, ...flatten(data) }
}

export const useLangStore = create((set, get) => ({
  lang: 'en',
  messages: getMessages('en'),

  init: async () => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('lang') || 'en'
    // Always sync store with localStorage to prevent stale state after language changes
    if (saved !== get().lang) get().setLang(saved)
  },

  setLang: (lang) => {
    const messages = getMessages(lang)
    if (typeof localStorage !== 'undefined') localStorage.setItem('lang', lang)
    set({ lang, messages })
  },
}))

// Auto-load saved language immediately on module import (synchronous, no fetch)
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('lang')
  if (saved && saved !== 'en') {
    useLangStore.setState({ lang: saved, messages: getMessages(saved) })
  }
}

// Hook that returns a stable translator function, reactive to language changes
export function useTranslate() {
  const messages = useLangStore((s) => s.messages)
  return useMemo(() => (key) => {
    const val = messages[key]
    return val !== undefined ? val : key
  }, [messages])
}