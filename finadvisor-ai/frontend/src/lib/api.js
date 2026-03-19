const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// Auth
export const api = {
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  refresh: (token) => request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: token }) }),
  me: () => request('/auth/me'),
  updateMe: (data) => request('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),

  // Chat
  getSessions: () => request('/chat/sessions'),
  createSession: (data = {}) => request('/chat/sessions', { method: 'POST', body: JSON.stringify(data) }),
  getMessages: (sessionId) => request(`/chat/sessions/${sessionId}/messages`),
  deleteSession: (sessionId) => request(`/chat/sessions/${sessionId}`, { method: 'DELETE' }),
  sendMessage: (data) => request('/chat/send', { method: 'POST', body: JSON.stringify({ ...data, stream: false }) }),

  // Portfolio
  getPortfolio: () => request('/portfolio'),
  addPosition: (data) => request('/portfolio', { method: 'POST', body: JSON.stringify(data) }),
  removePosition: (id) => request(`/portfolio/${id}`, { method: 'DELETE' }),

  // Health
  health: () => request('/health'),
}

// SSE streaming
export function streamMessage(data, onChunk, onDone, onError) {
  const token = getToken()
  const controller = new AbortController()

  fetch(`${API_URL}/chat/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...data, stream: true }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Stream failed' }))
      onError(err.detail || 'Stream failed')
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
            if (event.type === 'token') onChunk(event.content)
            else if (event.type === 'done') onDone(event)
            else if (event.type === 'error') onError(event.message)
          } catch (e) {}
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') onError(err.message)
  })

  return () => controller.abort()
}