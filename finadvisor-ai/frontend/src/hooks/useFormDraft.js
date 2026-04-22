/**
 * useFormDraft — persists form state to localStorage so refreshing
 * the page doesn't wipe what the user was typing.
 *
 * Usage:
 *   const [form, setForm, clearDraft] = useFormDraft('budget-entry', {
 *     category: 'Salary', amount: '', description: ''
 *   })
 *
 * The draft is automatically cleared when you call clearDraft().
 * Call clearDraft() after a successful form submission.
 */
import { useState, useEffect, useCallback, useRef } from 'react'

export function useFormDraft(key, defaultValues) {
  const storageKey = `finadvisor-draft-${key}`

  // Stable ref so callbacks never need defaultValues in their dep array.
  // defaultValues is typically an object literal — a new reference every
  // render — so putting it directly in a dep array causes infinite loops.
  const defaultValuesRef = useRef(defaultValues)
  useEffect(() => {
    defaultValuesRef.current = defaultValues
  })

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

  // Call this after a successful submission to wipe the draft.
  // Reads defaultValues from the ref at call-time rather than capturing
  // it in the closure, so [storageKey] is the genuine dep array —
  // no eslint suppression needed.
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey) } catch {}
    setFormState(defaultValuesRef.current)
  }, [storageKey])

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

  // Keep a ref in sync after every render so setValue can read the latest
  // value without listing it as a dependency (which would recreate the
  // callback on every state change).
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  })

  const setValue = useCallback((next) => {
    const val = typeof next === 'function' ? next(valueRef.current) : next
    try { localStorage.setItem(storageKey, JSON.stringify(val)) } catch {}
    setValueState(val)
  }, [storageKey])

  return [value, setValue]
}