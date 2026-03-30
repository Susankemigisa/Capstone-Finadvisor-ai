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
  // CS-1 FIX: store the AbortController so any in-flight stream can be cancelled
  _abortController: null,

  loadSessions: async () => {
    try {
      const d = await req('/chat/sessions')
      const sessions = (d.sessions || []).filter(s => (s.message_count || 0) > 0)
      set({ sessions })
    } catch {}
  },

  // CS-2 FIX: cancel any in-flight stream before switching session
  selectSession: async (id) => {
    const { _abortController, streaming } = get()
    if (streaming && _abortController) {
      _abortController.abort()
      set({ streaming: false, streamingContent: '', _abortController: null })
    }
    set({ currentSessionId: id, messages: [], loading: true })
    try {
      const d = await req(`/chat/sessions/${id}/messages`)
      set({ messages: d.messages || [], loading: false })
    } catch { set({ loading: false }) }
  },

  // CS-2 FIX: cancel any in-flight stream before starting a new session
  newSession: () => {
    const { _abortController, streaming } = get()
    if (streaming && _abortController) {
      _abortController.abort()
    }
    set({ currentSessionId: null, messages: [], streaming: false, streamingContent: '', _abortController: null })
  },

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
    // CS-6 FIX: read currentSessionId from live store at call time — never rely on a stale closure
    const sessionIdAtStart = get().currentSessionId
    const userMsg = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() }
    set((s) => ({ messages: [...s.messages, userMsg], streaming: true, streamingContent: '', error: null }))
    const token = getToken()
    let fullContent = ''

    // CS-1 FIX: create an AbortController and stash it so selectSession/newSession can kill us
    const abortController = new AbortController()
    set({ _abortController: abortController })

    try {
      const res = await fetch(`${API}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: content, ...(sessionIdAtStart ? { session_id: sessionIdAtStart } : {}), stream: true }),
        signal: abortController.signal,   // CS-1 FIX: attach abort signal to the fetch
      })

      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json().catch(() => ({}))
          const detail = data.detail || ''
          if (detail.startsWith('rate_limit:')) {
            const [, mins, wh, wl] = detail.split(':')
            set({ streaming: false, error: `rate_limit:${mins}:${wh}:${wl}`, _abortController: null })
          } else {
            set({ streaming: false, error: 'rate_limit:180:3:10', _abortController: null })
          }
        } else {
          set({ streaming: false, error: 'Request failed', _abortController: null })
        }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // CS-3 + CS-4 + CS-5 FIX: single unified line processor
      const processLine = (line) => {
        if (!line.startsWith('data: ')) return
        try {
          const event = JSON.parse(line.slice(6))

          if (event.type === 'token') {
            fullContent += event.content
            set({ streamingContent: fullContent })

          } else if (event.type === 'done') {
            // CS-3 FIX: images/files are not streamed token-by-token — content arrives on the
            // done event itself. Fall back to event.content / event.full_content when fullContent
            // is empty so image/file responses are never silently discarded.
            const finalContent = fullContent || event.content || event.full_content || ''

            // CS-5 FIX: one atomic set() for session_id + message commit — no double render
            // CS-6 FIX: read s.currentSessionId from live state, not the stale closure value
            set((s) => ({
              messages: [
                ...s.messages,
                {
                  id: event.message_id || Date.now() + 1,
                  role: 'assistant',
                  content: finalContent,
                  created_at: new Date().toISOString(),
                }
              ],
              streaming: false,
              streamingContent: '',
              _abortController: null,
              // Only update session if the store still has no session (user didn't switch away)
              ...(event.session_id && !s.currentSessionId ? { currentSessionId: event.session_id } : {}),
            }))
            get().loadSessions()

          } else if (event.type === 'error') {
            set({ streaming: false, streamingContent: '', error: event.message, _abortController: null })
          }
        } catch {}
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // CS-4 FIX: flush any leftover bytes in the buffer after stream closes.
          // Without this, the last SSE frame (usually the done event) is dropped when
          // the server sends no trailing newline — leaving the spinner running forever.
          if (buffer.trim()) processLine(buffer.trim())
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) processLine(line)
      }

    } catch (e) {
      // AbortError is intentional (user switched session or started new chat) — don't show error
      if (e.name === 'AbortError') {
        set({ streaming: false, streamingContent: '', _abortController: null })
      } else {
        set({ streaming: false, streamingContent: '', error: e.message, _abortController: null })
      }
    }
  },

  clearError: () => set({ error: null }),
}))