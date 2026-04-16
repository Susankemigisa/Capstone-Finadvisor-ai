'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'
import PageShell from '@/components/layout/PageShell'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatInput from '@/components/chat/ChatInput'
import HelpGuide from '@/components/chat/HelpGuide'

function getGreeting(t) {
  const hour = new Date().getHours()
  const day  = new Date().getDay()
  const DAY_KEYS = ['chat.greetSunday','chat.greetMonday','chat.greetTuesday','chat.greetWednesday','chat.greetThursday','chat.greetFriday','chat.greetSaturday']
  if (hour >= 5  && hour < 10) return t(DAY_KEYS[day])
  if (hour >= 0  && hour < 5)  return t('chat.greetMidnight')
  if (hour >= 10 && hour < 12) return t('chat.greetMidMorning')
  if (hour === 12)              return t('chat.greetMidday')
  if (hour >= 13 && hour < 17) return t('chat.greetAfternoon')
  if (hour >= 17 && hour < 18) return t('chat.greetLateAfternoon')
  if (hour >= 18 && hour < 21) return t('chat.greetEvening')
  return t('chat.greetNight')
}

// Suggested follow-up questions based on what the AI just said
function getSuggestions(lastContent) {
  if (!lastContent) return []
  const content = lastContent.toLowerCase()
  if (content.includes('stock') || content.includes('price') || content.includes('aapl') || content.includes('msft'))
    return ['Show me a chart of that', 'What\'s the news on this stock?', 'Add this to my watchlist']
  if (content.includes('portfolio'))
    return ['Show my portfolio chart', 'What\'s my biggest holding?', 'Suggest how to rebalance']
  if (content.includes('budget') || content.includes('expense') || content.includes('spent'))
    return ['Show my spending chart', 'How can I reduce expenses?', 'What\'s my savings rate?']
  if (content.includes('bitcoin') || content.includes('crypto') || content.includes('btc'))
    return ['Show a price chart', 'What\'s the latest crypto news?', 'Compare BTC vs ETH']
  if (content.includes('saving') || content.includes('goal'))
    return ['Create a savings chart', 'Export this as PDF', 'Set up an auto-save rule']
  if (content.includes('chart') || content.includes('graph') || content.includes('visual'))
    return ['Export this as PDF', 'Show as a different chart type', 'Add more data to this']
  if (content.includes('retirement') || content.includes('invest'))
    return ['Create a projection chart', 'What\'s the risk level?', 'Export this as a PDF report']
  return ['Export this as PDF', 'Create a chart of this', 'Tell me more']
}

function SuggestedQuestions({ content, onSend, disabled }) {
  const [dismissed, setDismissed] = useState(false)
  const suggestions = getSuggestions(content)
  if (!suggestions.length || dismissed) return null
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '0 0 12px 38px' }}>
      {suggestions.map(s => (
        <button key={s} onClick={() => { onSend(s); setDismissed(true) }} disabled={disabled}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '20px', padding: '6px 14px', fontSize: '12px', color: 'var(--text-secondary)', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
          onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--text-primary)' }}}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
          {s}
        </button>
      ))}
      <button onClick={() => setDismissed(true)}
        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '11px', padding: '6px 4px' }}>
        ✕
      </button>
    </div>
  )
}

export default function ChatPage() {
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const t = useTranslate()
  const { user, loading, init } = useAuthStore()
  const { messages, streaming, streamingContent, loadSessions, sendMessage, error, clearError } = useChatStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const bottomRef = useRef(null)
  const isBusy = streaming || !!(error && error.startsWith('rate_limit:'))

  useEffect(() => {
    initTheme()
    initLang()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) {
        router.replace('/login')
        return
      }
      // Redirect to onboarding if not completed
      if (!user.onboarding_complete) {
        router.replace('/onboarding')
        return
      }
      loadSessions()
      const pending = localStorage.getItem('pending_prompt')
      if (pending) { localStorage.removeItem('pending_prompt'); setTimeout(() => sendMessage(pending), 500) }
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  useEffect(() => {
    if (error && error.startsWith('rate_limit:')) {
      const mins = parseInt(error.split(':')[1])
      const initialSeconds = mins * 60
      let seconds = initialSeconds
      const timer = setInterval(() => {
        seconds -= 1
        setCountdown(seconds <= 0 ? null : seconds)
        if (seconds <= 0) { clearInterval(timer); useChatStore.setState({ error: null }) }
      }, 1000)
      const initTimer = setTimeout(() => setCountdown(initialSeconds), 0)
      return () => { clearInterval(timer); clearTimeout(initTimer) }
    }
  }, [error])

  const handleRegenerate = () => {
    const userMessages = messages.filter(m => m.role === 'user')
    if (userMessages.length > 0) sendMessage(userMessages[userMessages.length - 1].content)
  }

  if (loading || !user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>Loading...</div>
    </div>
  )

  const greeting = getGreeting(t)
  const displayName = user?.preferred_name || user?.full_name?.split(' ')[0] || 'there'
  const promptList = t('chat.prompts')

  // Find last AI message for suggestions
  const lastAI = [...messages].reverse().find(m => m.role === 'assistant')

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-main)' }}>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-surface)' }}>
          {/* Hamburger — only visible on mobile */}
          <button onClick={() => setMobileMenuOpen(true)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', width: '34px', height: '34px', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', flexShrink: 0, display: 'none' }}
            className="mobile-menu-btn">
            <span style={{ display: 'block', width: '15px', height: '2px', background: 'var(--text-secondary)', borderRadius: '1px' }} />
            <span style={{ display: 'block', width: '15px', height: '2px', background: 'var(--text-secondary)', borderRadius: '1px' }} />
            <span style={{ display: 'block', width: '15px', height: '2px', background: 'var(--text-secondary)', borderRadius: '1px' }} />
          </button>
          <span style={{ color: 'var(--gold)' }}>◈</span>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{t('nav.chat')}</span>
        </div>
        <style>{`.mobile-menu-btn { display: none !important; } @media (max-width: 767px) { .mobile-menu-btn { display: flex !important; } }`}</style>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {messages.length === 0 && !streaming && (
            <div style={{ maxWidth: '560px', margin: '40px auto', textAlign: 'center' }} className="fade-in">
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: '26px', fontStyle: 'italic', marginBottom: '8px' }}>
                {greeting}, {displayName}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '32px' }}>{t('chat.aiReady')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'left' }}>
                {Array.isArray(promptList) && promptList.map((p) => (
                  <button key={p} onClick={() => sendMessage(p)}
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'left', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLastAI = msg.role === 'assistant' && i === messages.length - 1
            return (
              <div key={msg.id || i}>
                <MessageBubble
                  message={msg}
                  onRegenerate={isLastAI && !streaming ? handleRegenerate : null}
                />
                {/* Show suggested follow-up questions after the last AI message */}
                {isLastAI && !streaming && (
                  <SuggestedQuestions
                    content={msg.content}
                    onSend={sendMessage}
                    disabled={isBusy}
                  />
                )}
              </div>
            )
          })}

          {streaming && streamingContent && (
            <MessageBubble message={{ role: 'assistant', content: streamingContent }} isStreaming={true} />
          )}
          {streaming && !streamingContent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' }}>◆</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[0,1,2].map((i) => <div key={i} className="shimmer" style={{ width: '6px', height: '6px', borderRadius: '50%' }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Rate limit banner */}
        {error && error.startsWith('rate_limit:') && (() => {
          const parts = error.split(':')
          const windowHours = parts[2] || 3
          const windowLimit = parts[3] || 10
          const totalSecs = countdown || 0
          const h = Math.floor(totalSecs / 3600)
          const m = Math.floor((totalSecs % 3600) / 60)
          const s = totalSecs % 60
          const timeStr = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
          return (
            <div style={{ margin: '0 16px 12px', padding: '16px 18px', background: 'linear-gradient(135deg, #0f0a00, #1a1200)', border: '1px solid var(--gold-dim)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>⏳</span>
                <span style={{ fontWeight: 600, color: 'var(--gold)', fontSize: '13px' }}>Message limit reached</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Free plan includes <strong style={{ color: 'var(--text-primary)' }}>{windowLimit} messages every {windowHours} hours</strong>. Refreshes in:
              </div>
              <div style={{ fontSize: '28px', fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontWeight: 700, margin: '8px 0', letterSpacing: '0.05em' }}>{timeStr}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                Want unlimited messages? <a href="/billing" style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>Upgrade to Pro →</a>
              </div>
            </div>
          )
        })()}

        <HelpGuide onExample={(example) => sendMessage(example)} disabled={isBusy} />
        <ChatInput onSend={sendMessage} disabled={isBusy} placeholder={t('chat.placeholder')} />
      </div>
    </div>
  )
}