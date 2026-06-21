import { create } from 'zustand'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function req(path, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(e.detail || 'Request failed')
  }
  return res.json()
}

// ROOT CAUSE FIX — first-load redirect-to-login bug
// ----------------------------------------------------
// Render's free tier spins the backend down after ~15 min of inactivity.
// On the very first request after a cold start, the backend can take
// 10-30+ seconds to wake up. The old init() had no timeout handling and
// no retry — a single slow/failed /auth/me call during cold start would
// immediately fall through to the catch block, attempt one refresh, and
// if THAT was also slow (same cold backend), redirect to /login even
// though the user's token was perfectly valid. The second page load then
// worked because the backend was already warm.
//
// Fix: retry /auth/me up to 3 times with backoff before giving up, and
// use an extended timeout so a cold start doesn't get mistaken for an
// invalid session.
async function reqWithRetry(path, options = {}, retries = 3, timeoutMs = 20000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      const res = await fetch(`${API}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers
        }
      })
      clearTimeout(timer)
      if (res.status === 401) {
        // Genuine auth failure — don't retry, bubble up immediately
        const e = await res.json().catch(() => ({ detail: 'Unauthorized' }))
        throw Object.assign(new Error(e.detail || 'Unauthorized'), { status: 401 })
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(e.detail || 'Request failed')
      }
      return await res.json()
    } catch (err) {
      const isLastAttempt = attempt === retries - 1
      const isAuthFailure = err.status === 401
      // Don't retry genuine 401s — only retry network errors / timeouts / cold starts
      if (isAuthFailure || isLastAttempt) throw err
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1))) // 1s, 2s backoff
    }
  }
}

export const useAuthStore = create((set) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (!token) { set({ loading: false }); return }
    try {
      const user = await reqWithRetry('/auth/me')
      set({ user, loading: false })
    } catch {
      // Try refresh token before logging out
      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null
      if (refreshToken) {
        try {
          const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 20000)
          const res = await fetch(`${API}/auth/refresh`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
          })
          clearTimeout(timer)
          if (res.ok) {
            const data = await res.json()
            localStorage.setItem('access_token', data.access_token)
            localStorage.setItem('refresh_token', data.refresh_token)
            const user = await reqWithRetry('/auth/me')
            set({ user, loading: false })
            return
          }
        } catch {}
      }
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('finadvisor-chat')
      }
      set({ user: null, loading: false })
    }
  },

  login: async (email, password) => {
    const data = await req('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    // Clear any previous user's chat state before setting new session
    localStorage.removeItem('finadvisor-chat')
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ user: data.user })
    return data
  },

  register: async (email, password, full_name) => {
    const data = await req('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name })
    })
    localStorage.removeItem('finadvisor-chat')
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ user: data.user })
    return data
  },

  // Called after Supabase OAuth redirect — exchanges supabase session for our JWT
  loginWithOAuthToken: async (supabaseAccessToken, providerEmail, providerName) => {
    const data = await req('/auth/oauth', {
      method: 'POST',
      body: JSON.stringify({
        provider_token: supabaseAccessToken,
        email: providerEmail,
        full_name: providerName || '',
      })
    })
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ user: data.user })
    return data
  },

  updateProfile: async (updates) => {
    const updatedUser = await req('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
    set({ user: updatedUser })
    return updatedUser
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    // Clear persisted chat state so next user never sees previous user's chats
    localStorage.removeItem('finadvisor-chat')
    set({ user: null })
  },
}))