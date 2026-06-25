'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

const FEATURES = [
  { icon: '📈', title: 'Live Market Data', desc: 'Real-time stock, crypto, and index prices with one-click portfolio tracking.' },
  { icon: '🧠', title: 'AI Financial Advisor', desc: 'Ask anything — budgeting, tax planning, retirement goals — and get precise answers.' },
  { icon: '📊', title: 'Instant Charts', desc: 'Bar, line, and pie charts generated from your real data. No guesswork, no fake numbers.' },
  { icon: '🔒', title: 'Secure & Private', desc: 'bcrypt-hashed passwords, JWT sessions, masked account numbers. Your data stays yours.' },
  { icon: '🌍', title: '17 Languages', desc: 'English, Luganda, Swahili, French, Arabic, Hindi and more — finance for everyone.' },
  { icon: '💳', title: 'African Payments', desc: 'MTN MoMo, Airtel Money, Mono bank connections, and Flutterwave built in.' },
]

const TICKERS = ['AAPL $213.49 ▲2.1%', 'BTC $67,204 ▲1.4%', 'MSFT $421.12 ▼0.3%', 'NVDA $892.60 ▲4.7%', 'ETH $3,580 ▲0.9%', 'GOOGL $175.28 ▼1.1%']

export default function LandingPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [tickerIdx, setTickerIdx] = useState(0)

  useEffect(() => {
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (user) {
        router.replace('/chat')
      } else {
        setChecking(false)
      }
    })
  }, [])

  useEffect(() => {
    if (checking) return
    const id = setInterval(() => setTickerIdx(i => (i + 1) % TICKERS.length), 2200)
    return () => clearInterval(id)
  }, [checking])

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '13px', letterSpacing: '0.1em' }}>
          ◆ FINADVISOR AI
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base, #0a0d14)',
      color: 'var(--text-primary, #e8eaf0)',
      fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
      overflowX: 'hidden',
    }}>

      {/* ── Nav ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,13,20,0.85)', backdropFilter: 'blur(12px)',
      }}>
        <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold, #632148)', fontSize: '14px', letterSpacing: '0.12em', fontWeight: 600 }}>
          ◆ FINADVISOR AI
        </span>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: 'var(--text-secondary, #a0a8b8)',
              fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold, #632148)'; e.currentTarget.style.color = 'var(--gold, #632148)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'var(--text-secondary, #a0a8b8)' }}
          >
            Log in
          </button>
          <button
            onClick={() => router.push('/register')}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none',
              background: 'var(--gold, #632148)', color: '#0a0d14',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Get started free
          </button>
        </div>
      </nav>

      {/* ── Live ticker strip ── */}
      <div style={{
        background: 'rgba(99,33,72,0.08)', borderBottom: '1px solid rgba(99,33,72,0.15)',
        padding: '8px 32px', fontSize: '12px', fontFamily: 'DM Mono, monospace',
        color: 'var(--gold, #632148)', letterSpacing: '0.05em',
        transition: 'opacity 0.4s',
      }}>
        ◆ {TICKERS[tickerIdx]}
      </div>

      {/* ── Hero ── */}
      <section style={{ textAlign: 'center', padding: '96px 24px 80px', maxWidth: '780px', margin: '0 auto' }}>
        <div style={{
          display: 'inline-block', marginBottom: '20px', padding: '5px 14px',
          borderRadius: '20px', border: '1px solid rgba(99,33,72,0.35)',
          background: 'rgba(99,33,72,0.08)',
          fontSize: '11px', fontFamily: 'DM Mono, monospace', letterSpacing: '0.1em',
          color: 'var(--gold, #632148)',
        }}>
          POWERED BY GPT-4o · CLAUDE · GEMINI · LLAMA
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 7vw, 68px)', fontWeight: 800, lineHeight: 1.1,
          margin: '0 0 24px',
          background: 'linear-gradient(135deg, #e8eaf0 0%, #632148 60%, #e8eaf0 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Your AI financial<br />advisor, always on
        </h1>

        <p style={{
          fontSize: '17px', lineHeight: 1.7, color: 'var(--text-secondary, #a0a8b8)',
          margin: '0 auto 40px', maxWidth: '560px',
        }}>
          Ask about markets, track your portfolio, plan your budget, and get charts — all in one chat. Built for Africa, works everywhere.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push('/register')}
            style={{
              padding: '14px 32px', borderRadius: '10px', border: 'none',
              background: 'var(--gold, #632148)', color: '#0a0d14',
              fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(99,33,72,0.35)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,33,72,0.45)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(99,33,72,0.35)' }}
          >
            Start for free →
          </button>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '14px 32px', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary, #e8eaf0)',
              fontSize: '15px', cursor: 'pointer', transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
          >
            Log in
          </button>
        </div>
      </section>

      {/* ── Fake chat preview ── */}
      <section style={{ maxWidth: '680px', margin: '0 auto 96px', padding: '0 24px' }}>
        <div style={{
          borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          {/* window chrome */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28ca41', display: 'inline-block' }} />
            <span style={{ marginLeft: 8, fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Mono, monospace' }}>FinAdvisor AI · Chat</span>
          </div>
          {/* messages */}
          <div style={{ padding: '20px 20px 8px' }}>
            <BubbleUser text="Show me my portfolio allocation as a pie chart 📊" />
            <BubbleAI text="Here's your portfolio pie chart! 🥧 It shows your allocation across 5 holdings — AAPL at 38%, BTC 22%, NVDA 18%, MSFT 14%, and Cash 8%. Your tech concentration is high; I'd suggest some diversification into bonds or international ETFs." />
            <BubbleUser text="What's the current Bitcoin price?" />
            <BubbleAI text="Bitcoin (BTC) is trading at $67,204.32 ▲ 1.41% in the last 24h 🚀. Market cap is ~$1.32T. Want me to log a position to your portfolio or chart the 30-day price trend?" />
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)',
              padding: '10px 14px', fontSize: '13px',
              color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.02)',
            }}>
              Ask about stocks, crypto, your budget...
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section style={{ maxWidth: '960px', margin: '0 auto 96px', padding: '0 24px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '28px', fontWeight: 700, marginBottom: '48px' }}>
          Everything you need in one place
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              padding: '24px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.03)',
              transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,33,72,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}
            >
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>{f.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>{f.title}</div>
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary, #a0a8b8)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA footer ── */}
      <section style={{
        textAlign: 'center', padding: '80px 24px 96px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <h2 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 16px' }}>Ready to take control?</h2>
        <p style={{ color: 'var(--text-secondary, #a0a8b8)', fontSize: '15px', margin: '0 0 32px' }}>
          Free to start. No credit card required.
        </p>
        <button
          onClick={() => router.push('/register')}
          style={{
            padding: '14px 40px', borderRadius: '10px', border: 'none',
            background: 'var(--gold, #632148)', color: '#0a0d14',
            fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 24px rgba(99,33,72,0.35)',
          }}
        >
          Create your free account →
        </button>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '20px 32px', textAlign: 'center',
        fontSize: '12px', color: 'rgba(255,255,255,0.25)',
        fontFamily: 'DM Mono, monospace',
      }}>
        © {new Date().getFullYear()} FinAdvisor AI · AI, not a licensed financial advisor
      </footer>
    </div>
  )
}

function BubbleUser({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
      <div style={{
        maxWidth: '70%', padding: '10px 14px', borderRadius: '12px 12px 2px 12px',
        background: 'rgba(99,33,72,0.18)', border: '1px solid rgba(99,33,72,0.25)',
        fontSize: '13px', lineHeight: 1.5, color: '#e8eaf0',
      }}>{text}</div>
    </div>
  )
}

function BubbleAI({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
      <div style={{
        maxWidth: '80%', padding: '10px 14px', borderRadius: '12px 12px 12px 2px',
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
        fontSize: '13px', lineHeight: 1.5, color: '#c8ccd8',
      }}>{text}</div>
    </div>
  )
}