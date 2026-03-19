import { create } from 'zustand'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('access_token') : null }

async function req(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  })
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail || 'Failed') }
  return res.json()
}

export const useChatStore = create((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  loading: false,
  streaming: false,
  streamingContent: '',
  error: null,

  loadSessions: async () => {
    try {
      const d = await req('/chat/sessions')
      // Only show sessions that have at least 1 message — hides blank "New Chat" duplicates
      const sessions = (d.sessions || []).filter(s => (s.message_count || 0) > 0)
      set({ sessions })
    } catch {}
  },

  selectSession: async (id) => {
    set({ currentSessionId: id, messages: [], loading: true })
    try {
      const d = await req(`/chat/sessions/${id}/messages`)
      set({ messages: d.messages || [], loading: false })
    } catch { set({ loading: false }) }
  },

  // Just clear the UI — don't create a session in the DB
  newSession: () => set({ currentSessionId: null, messages: [] }),

  deleteSession: async (id) => {
    try {
      await req(`/chat/sessions/${id}`, { method: 'DELETE' })
      set((s) => ({
        sessions: s.sessions.filter((x) => x.id !== id),
        ...(s.currentSessionId === id ? { currentSessionId: null, messages: [] } : {})
      }))
    } catch {}
  },

  sendMessage: async (content) => {
    const { currentSessionId } = get()
    const userMsg = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() }
    set((s) => ({ messages: [...s.messages, userMsg], streaming: true, streamingContent: '', error: null }))
    const token = getToken()
    let fullContent = ''

    try {
      const res = await fetch(`${API}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: content, ...(currentSessionId ? { session_id: currentSessionId } : {}), stream: true })
      })

      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json().catch(() => ({}))
          const detail = data.detail || ''
          if (detail.startsWith('rate_limit:')) {
            const [, mins, wh, wl] = detail.split(':')
            set({ streaming: false, error: `rate_limit:${mins}:${wh}:${wl}` })
          } else {
            set({ streaming: false, error: 'rate_limit:180:3:10' })
          }
        } else {
          set({ streaming: false, error: 'Request failed' })
        }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'token') {
                fullContent += event.content
                set({ streamingContent: fullContent })
              } else if (event.type === 'done') {
                if (event.session_id && !currentSessionId) {
                  set({ currentSessionId: event.session_id })
                }
                set((s) => ({
                  messages: [...s.messages, { id: Date.now() + 1, role: 'assistant', content: fullContent, created_at: new Date().toISOString() }],
                  streaming: false,
                  streamingContent: ''
                }))
                // Reload sessions after every completed message so sidebar stays fresh
                get().loadSessions()
              } else if (event.type === 'error') {
                set({ streaming: false, streamingContent: '', error: event.message })
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      set({ streaming: false, streamingContent: '', error: e.message })
    }
  },

  clearError: () => set({ error: null }),
}))