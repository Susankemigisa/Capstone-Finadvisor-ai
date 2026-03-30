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

      // FIX 2 (helper): process a single SSE line and return true if 'done' was handled
      const processLine = (line) => {
        if (!line.startsWith('data: ')) return false
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'token') {
            fullContent += event.content
            set({ streamingContent: fullContent })
          } else if (event.type === 'done') {
            // FIX 1: fall back to event.content / event.full_content when nothing was streamed
            // (image generation and other non-streaming responses send content on the done event)
            const finalContent = fullContent || event.content || event.full_content || ''

            // FIX 3: merge session_id update + message commit into a single set() call
            // to avoid the race-condition double-render
            set((s) => ({
              messages: [
                ...s.messages,
                {
                  // Use the real DB message id from the done event when available
                  id: event.message_id || Date.now() + 1,
                  role: 'assistant',
                  content: finalContent,
                  created_at: new Date().toISOString()
                }
              ],
              streaming: false,
              streamingContent: '',
              // Only update currentSessionId if we didn't have one yet
              ...(event.session_id && !s.currentSessionId ? { currentSessionId: event.session_id } : {})
            }))
            // Reload sessions after every completed message so sidebar stays fresh
            get().loadSessions()
            return true
          } else if (event.type === 'error') {
            set({ streaming: false, streamingContent: '', error: event.message })
            return true
          }
        } catch {}
        return false
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // FIX 2: flush any remaining data in the buffer after the stream closes.
          // Without this, the last SSE frame (often the 'done' event) is silently
          // dropped when the server doesn't send a trailing newline, leaving the
          // spinner running forever and the message never committed.
          if (buffer.trim()) processLine(buffer.trim())
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          processLine(line)
        }
      }
    } catch (e) {
      set({ streaming: false, streamingContent: '', error: e.message })
    }
  },

  clearError: () => set({ error: null }),
}))