/**
 * useFormDraft — persists form state to localStorage so refreshing
 * the page doesn't wipe what the user was typing.
 *
 * Usage:
 *   const [form, setForm] = useFormDraft('budget-entry', {
 *     category: 'Salary', amount: '', description: ''
 *   })
 *
 * The draft is automatically cleared when you call clearDraft().
 * Call clearDraft() after a successful form submission.
 */
import { useState, useEffect, useCallback } from 'react'

export function useFormDraft(key, defaultValues) {
  const storageKey = `finadvisor-draft-${key}`

  const [form, setFormState] = useState(() => {
    if (typeof window === 'undefined') return defaultValues
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return { ...defaultValues, ...JSON.parse(saved) }
    } catch {}
    return defaultValues
  })

  // Persist every change to localStorage
  const setForm = useCallback((update) => {
    setFormState(prev => {
      const next = typeof update === 'function' ? update(prev) : update
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
      return next
    })
  }, [storageKey])

  // Call this after a successful submission to wipe the draft
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey) } catch {}
    setFormState(defaultValues)
  }, [storageKey])  // eslint-disable-line

  return [form, setForm, clearDraft]
}

/**
 * useUIDraft — persists a single UI value (filter, selected tab, etc.)
 *
 * Usage:
 *   const [filter, setFilter] = useUIDraft('budget-filter', 'all')
 */
export function useUIDraft(key, defaultValue) {
  const storageKey = `finadvisor-ui-${key}`

  const [value, setValueState] = useState(() => {
    if (typeof window === 'undefined') return defaultValue
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) return JSON.parse(saved)
    } catch {}
    return defaultValue
  })

  const setValue = useCallback((next) => {
    const val = typeof next === 'function' ? next(value) : next
    try { localStorage.setItem(storageKey, JSON.stringify(val)) } catch {}
    setValueState(val)
  }, [storageKey, value])

  return [value, setValue]
}