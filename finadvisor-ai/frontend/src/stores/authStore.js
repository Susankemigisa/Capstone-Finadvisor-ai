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

export const useAuthStore = create((set) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (!token) { set({ loading: false }); return }
    try {
      const user = await req('/auth/me')
      set({ user, loading: false })
    } catch {
      // Try refresh token before logging out
      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null
      if (refreshToken) {
        try {
          const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
          const res = await fetch(`${API}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
          })
          if (res.ok) {
            const data = await res.json()
            localStorage.setItem('access_token', data.access_token)
            localStorage.setItem('refresh_token', data.refresh_token)
            const user = await req('/auth/me')
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