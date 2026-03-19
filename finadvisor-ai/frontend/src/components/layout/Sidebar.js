'use client'
import React from 'react'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useLangStore, useTranslate } from '@/stores/langStore'

function SessionItem({ session, active, onSelect, onDelete }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', borderRadius: '6px', background: active || hovered ? 'var(--bg-elevated)' : 'transparent', marginBottom: '1px', transition: 'background 0.1s' }}>
      <div onClick={onSelect} style={{ flex: 1, padding: '6px 8px', cursor: 'pointer', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        · {session.title || 'New Chat'}
      </div>
      {hovered && (
        <button onClick={(e) => { e.stopPropagation(); onDelete() }}
          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px 7px', fontSize: '11px', flexShrink: 0, opacity: 0.7 }}>✕</button>
      )}
    </div>
  )
}

export default function Sidebar({ mobileOpen, onMobileClose }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const { sessions, currentSessionId, selectSession, newSession, deleteSession, loadSessions } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const t = useTranslate()
  const { init: initLang } = useLangStore()
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    initLang()
    loadSessions()
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { if (isMobile && onMobileClose) onMobileClose() }, [pathname])

  useEffect(() => {
    if (pathname !== "/chat") { const timer = setTimeout(() => setSearchQuery(""), 0); return () => clearTimeout(timer); }
  }, [pathname])

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const q = searchQuery.toLowerCase()
    return sessions.filter(s => (s.title || 'New Chat').toLowerCase().includes(q))
  }, [sessions, searchQuery])

  const displayedSessions = useMemo(() => {
    if (searchQuery.trim()) return filteredSessions
    return sessions.slice(0, 12)
  }, [filteredSessions, sessions, searchQuery])

  // CHANGE 1: Removed /plugins from nav. Renamed group labels to plain English.
  // MAIN → no label (it's the top section, no heading needed)
  // TOOLS → More
  const NAV_GROUPS = [
    {
      label: '',
      items: [
        { href: '/chat',      icon: '◈', label: t('nav.chat') },
        { href: '/portfolio', icon: '◎', label: t('nav.portfolio') },
        { href: '/analytics', icon: '◉', label: t('nav.analytics') },
      ]
    },
    {
      label: 'Finance',
      items: [
        { href: '/watchlist', icon: '👁',  label: t('nav.watchlist') },
        { href: '/goals',     icon: '🎯', label: t('nav.goals') },
        { href: '/budget',    icon: '💰', label: t('nav.budget') },
        { href: '/tax',       icon: '🧾', label: t('nav.tax') },
      ]
    },
    {
      label: 'More',
      items: [
        { href: '/alerts',    icon: '🔔', label: t('nav.alerts') },
        { href: '/export',    icon: '⬇',  label: t('nav.export') },
        { href: '/history',   icon: '🕘', label: t('nav.history') || 'Chat History' },
      ]
    },
    {
      label: 'Account',
      items: [
        { href: '/settings',  icon: '⚙',  label: t('nav.settings') },
        { href: '/billing',   icon: '◆',  label: user?.tier === 'pro' ? 'Pro ✓' : t('nav.upgrade') },
      ]
    }
  ]

  const sidebarContent = (
    <aside style={{
      width: isMobile ? '260px' : collapsed ? '56px' : '220px',
      height: '100%',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', minHeight: '56px' }}>
        {(!collapsed || isMobile) && <div style={{ flex: 1 }}><div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '10px', letterSpacing: '0.12em' }}>◆ FINADVISOR</div></div>}
        {isMobile ? (
          <button onClick={onMobileClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px', fontSize: '18px' }}>✕</button>
        ) : (
          <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px', fontSize: '14px', flexShrink: 0 }}>
            {collapsed ? '›' : '‹'}
          </button>
        )}
      </div>

      {/* Nav groups */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: '4px' }}>
            {/* Only render group label if it has text */}
            {group.label && (!collapsed || isMobile) && (
              <div style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.1em', padding: '8px 10px 4px', textTransform: 'uppercase' }}>
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: 'var(--radius)', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', background: active ? 'var(--bg-elevated)' : 'transparent', borderLeft: active ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: '1px', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ fontSize: '14px', flexShrink: 0 }}>{item.icon}</span>
                    {(!collapsed || isMobile) && <span style={{ fontSize: '12px', fontWeight: 500 }}>{item.label}</span>}
                  </div>
                </Link>
              )
            })}
            {gi < NAV_GROUPS.length - 1 && (!collapsed || isMobile) && (
              <div style={{ height: '1px', background: 'var(--border)', margin: '6px 4px' }} />
            )}
          </div>
        ))}

        {/* Chat sessions — only on /chat */}
        {pathname === '/chat' && (!collapsed || isMobile) && (
          <div style={{ padding: '4px 0 6px' }}>
            <button onClick={() => { newSession(); setSearchQuery(''); if (isMobile && onMobileClose) onMobileClose() }}
              style={{ width: '100%', background: 'transparent', border: '1px dashed var(--border)', borderRadius: '6px', color: 'var(--text-dim)', padding: '7px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', marginBottom: '8px' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}>
              {t('nav.newChat')}
            </button>

            {sessions.length > 0 && (
              <div style={{ position: 'relative', marginBottom: '6px' }}>
                <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-dim)', pointerEvents: 'none' }}>🔍</span>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                  placeholder={t('nav.searchChats') || 'Search chats...'}
                  style={{ width: '100%', background: searchFocused ? 'var(--bg-elevated)' : 'var(--bg-base)', border: `1px solid ${searchFocused ? 'var(--gold-dim)' : 'var(--border)'}`, borderRadius: '6px', padding: '6px 28px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', transition: 'all 0.15s' }} />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '11px', padding: 0 }}>✕</button>
                )}
              </div>
            )}

            {sessions.length > 0 && (
              <div>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em', padding: '4px 8px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{searchQuery ? `${filteredSessions.length} result${filteredSessions.length !== 1 ? 's' : ''}` : t('nav.recent')}</span>
                  <Link href="/history" style={{ color: 'var(--gold)', fontSize: '9px', textDecoration: 'none', letterSpacing: '0.06em', opacity: 0.8 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.8'}>
                    {t('nav.viewAll') || 'View all'} →
                  </Link>
                </div>
                {displayedSessions.length === 0 && searchQuery ? (
                  <div style={{ padding: '16px 8px', fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center' }}>
                    {t('nav.noResults') || 'No chats found'}
                  </div>
                ) : (
                  displayedSessions.map(s => (
                    <SessionItem key={s.id} session={s} active={s.id === currentSessionId}
                      onSelect={() => { selectSession(s.id); if (isMobile && onMobileClose) onMobileClose() }}
                      onDelete={() => deleteSession(s.id)} />
                  ))
                )}
                {!searchQuery && sessions.length > 12 && (
                  <Link href="/history" style={{ textDecoration: 'none', display: 'block', marginTop: '4px' }}>
                    <div style={{ width: '100%', padding: '6px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--gold)', fontSize: '11px', cursor: 'pointer', textAlign: 'center', letterSpacing: '0.04em' }}>
                      {t('nav.showAll') || 'View all'} {sessions.length} →
                    </div>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* User footer */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        {(!collapsed || isMobile) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>
              {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name || user?.email?.split('@')[0]}</div>
              <div style={{ fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{user?.tier || 'FREE'}</div>
            </div>
            <button onClick={() => { logout(); router.push('/login') }}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '11px', padding: '4px', flexShrink: 0 }}
              title={t('nav.logOut')}>⏻</button>
          </div>
        ) : (
          <button onClick={() => { logout(); router.push('/login') }}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', width: '100%', textAlign: 'center', fontSize: '14px', padding: '4px' }} title={t('nav.logOut')}>⏻</button>
        )}
      </div>
    </aside>
  )

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <>
            <div onClick={onMobileClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
            <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 50, display: 'flex' }}>
              {sidebarContent}
            </div>
          </>
        )}
      </>
    )
  }

  return sidebarContent
}
