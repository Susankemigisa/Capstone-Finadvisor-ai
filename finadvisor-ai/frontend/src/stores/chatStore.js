import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

export const useChatStore = create(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      messages: [],
      loading: false,
      streaming: false,
      streamingContent: '',
      error: null,
      _abortController: null,

      loadSessions: async () => {
        try {
          const d = await req('/chat/sessions')
          const sessions = (d.sessions || []).filter(s => (s.message_count || 0) > 0)
          set({ sessions })
        } catch {}
      },

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
        const sessionIdAtStart = get().currentSessionId
        const userMsg = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() }
        set((s) => ({ messages: [...s.messages, userMsg], streaming: true, streamingContent: '', error: null }))
        const token = getToken()
        let fullContent = ''

        const abortController = new AbortController()
        set({ _abortController: abortController })

        try {
          const res = await fetch(`${API}/chat/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ message: content, ...(sessionIdAtStart ? { session_id: sessionIdAtStart } : {}), stream: true }),
            signal: abortController.signal,
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

          const processLine = (line) => {
            if (line.startsWith(':')) return
            if (!line.startsWith('data: ')) return
            try {
              const event = JSON.parse(line.slice(6))

              if (event.type === 'token') {
                fullContent += event.content
                set({ streamingContent: fullContent })

              } else if (event.type === 'binary') {
                fullContent += event.content
                set({ streamingContent: '__BINARY_LOADING__' })

              } else if (event.type === 'done') {
                const finalContent = fullContent || event.content || event.full_content || ''
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
              if (buffer.trim()) processLine(buffer.trim())
              break
            }
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop()
            for (const line of lines) processLine(line)
          }

        } catch (e) {
          if (e.name === 'AbortError') {
            set({ streaming: false, streamingContent: '', _abortController: null })
          } else {
            set({ streaming: false, streamingContent: '', error: e.message, _abortController: null })
          }
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'finadvisor-chat',        // localStorage key
      partialize: (state) => ({
        // Only persist what's safe and useful across refreshes.
        // Never persist streaming state, abort controllers, or errors.
        currentSessionId: state.currentSessionId,
        messages:         state.messages,
        sessions:         state.sessions,
      }),
      // On rehydrate, clear any stale streaming/error state
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.streaming        = false
          state.streamingContent = ''
          state.error            = null
          state._abortController = null
          state.loading          = false
        }
      },
    }
  )
)