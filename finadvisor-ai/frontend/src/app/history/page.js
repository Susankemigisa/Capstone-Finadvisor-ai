'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path, opts = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers }
  }).then(r => r.json())
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: days > 365 ? 'numeric' : undefined })
}

function groupByDate(sessions) {
  const groups = {}
  const now = new Date()

  sessions.forEach(s => {
    const d = new Date(s.created_at || s.updated_at || now)
    const diff = Math.floor((now - d) / 86400000)
    let label
    if (diff === 0) label = 'Today'
    else if (diff === 1) label = 'Yesterday'
    else if (diff < 7) label = 'This Week'
    else if (diff < 30) label = 'This Month'
    else if (diff < 365) label = 'Older'
    else label = String(d.getFullYear())

    if (!groups[label]) groups[label] = []
    groups[label].push(s)
  })

  // Return in logical order
  const order = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']
  const sorted = []
  order.forEach(label => { if (groups[label]) sorted.push([label, groups[label]]) })
  // Any year groups at the end
  Object.entries(groups).forEach(([label, items]) => {
    if (!order.includes(label)) sorted.push([label, items])
  })
  return sorted
}

export default function HistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading, init } = useAuthStore()
  const { sessions, currentSessionId, selectSession, deleteSession, loadSessions } = useChatStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()

  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initLang()
    initTheme()
    init().then(async () => {
      const { user } = useAuthStore.getState()
      if (!user) { router.replace('/login'); return }
      await loadSessions()
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter(s => (s.title || 'New Chat').toLowerCase().includes(q))
  }, [sessions, search])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  const handleOpen = (sessionId) => {
    selectSession(sessionId)
    router.push('/chat')
  }

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation()
    setDeleting(sessionId)
    await deleteSession(sessionId)
    setDeleting(null)
  }

  if (authLoading || loading) return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>{t('common.loading')}</div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>

        {/* Sticky header */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px', gap: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400, marginBottom: '4px' }}>
                {t('nav.history') || 'Chat History'} 🕘
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                {sessions.length} {sessions.length === 1 ? 'conversation' : 'conversations'} total
                {search && filtered.length !== sessions.length && ` · ${filtered.length} matching`}
              </p>
            </div>

            {/* Search bar */}
            <div style={{ position: 'relative', width: '260px', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--text-dim)', pointerEvents: 'none' }}>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={t('nav.searchChats') || 'Search conversations...'}
                style={{
                  width: '100%',
                  background: searchFocused ? 'var(--bg-elevated)' : 'var(--bg-base)',
                  border: `1px solid ${searchFocused ? 'var(--gold-dim)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  padding: '8px 32px 8px 32px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '12px', padding: 0 }}>✕</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: '860px' }}>

          {sessions.length === 0 ? (
            /* Empty state */
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
              <div style={{ fontSize: '18px', color: 'var(--text-primary)', fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', marginBottom: '8px' }}>{t('common.empty')}</div>
              <div style={{ fontSize: '13px', marginBottom: '24px' }}>Start a chat to see your history here</div>
              <button onClick={() => router.push('/chat')}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Start Chatting →
              </button>
            </div>
          ) : filtered.length === 0 ? (
            /* No search results */
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
              <div style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>No results for &quot;{search}&quot;</div>
              <div style={{ fontSize: '13px' }}>{t('nav.noResults')}</div>
            </div>
          ) : (
            /* Grouped sessions */
            grouped.map(([label, groupSessions]) => (
              <div key={label} style={{ marginBottom: '32px' }}>
                {/* Group label */}
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>{label}</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                  <span style={{ fontWeight: 400 }}>{groupSessions.length}</span>
                </div>

                {/* Session cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {groupSessions.map(s => {
                    const isActive = s.id === currentSessionId
                    const isDeleting = deleting === s.id
                    return (
                      <div key={s.id}
                        onClick={() => handleOpen(s.id)}
                        style={{
                          background: isActive ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                          border: `1px solid ${isActive ? 'var(--gold-dim)' : 'var(--border)'}`,
                          borderLeft: isActive ? '3px solid var(--gold)' : '3px solid transparent',
                          borderRadius: '10px',
                          padding: '14px 16px',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          opacity: isDeleting ? 0.4 : 1,
                        }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border)' } }}>

                        {/* Chat icon */}
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: isActive ? 'rgba(201,168,76,0.15)' : 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                          ◈
                        </div>

                        {/* Title and meta */}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: isActive ? 'var(--gold)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
                            {s.title || 'New Chat'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{formatDate(s.updated_at || s.created_at)}</span>
                            {s.message_count > 0 && (
                              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                · {s.message_count} message{s.message_count !== 1 ? 's' : ''}
                              </span>
                            )}
                            {isActive && (
                              <span style={{ fontSize: '10px', color: 'var(--gold)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em' }}>ACTIVE</span>
                            )}
                          </div>
                        </div>

                        {/* Open + Delete actions */}
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleOpen(s.id)}
                            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--gold)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
                            Open →
                          </button>
                          <button
                            onClick={e => handleDelete(e, s.id)}
                            disabled={isDeleting}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 8px', color: '#f87171', cursor: 'pointer', fontSize: '12px', opacity: isDeleting ? 0.5 : 0.7, transition: 'opacity 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}