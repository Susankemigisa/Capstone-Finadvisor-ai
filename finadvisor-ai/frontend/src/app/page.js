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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#021526' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: '#FFFCFC', fontSize: '13px', letterSpacing: '0.1em' }}>
          ◆ FINADVISOR AI
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#021526',
      color: '#FFFCFC',
      fontFamily: 'DM Sans, Inter, system-ui, sans-serif',
      overflowX: 'hidden',
    }}>

      {/* ── Nav — glassmorphism ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 32px',
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(2,21,38,0.45)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{
          fontFamily: 'DM Mono, monospace',
          color: '#FFFCFC',
          fontSize: '14px', letterSpacing: '0.12em', fontWeight: 600,
        }}>
          ◆ FINADVISOR AI
        </span>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '8px 20px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#FFFCFC',
              fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,33,72,0.4)'; e.currentTarget.style.borderColor = 'rgba(99,33,72,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
          >
            Log in
          </button>
          <button
            onClick={() => router.push('/register')}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none',
              background: '#632148', color: '#FFFCFC',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Get started free
          </button>
        </div>
      </nav>

      {/* ── Ticker strip — glass ── */}
      <div style={{
        background: 'rgba(3,62,91,0.35)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '8px 32px',
        fontSize: '12px', fontFamily: 'DM Mono, monospace',
        color: '#FFFCFC',
        letterSpacing: '0.05em',
      }}>
        ◆ {TICKERS[tickerIdx]}
      </div>

      {/* ── Hero — split screen: video left, text right ── */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        height: 'calc(100vh - 97px)',
      }}>

        {/* Left: Video */}
        <div style={{ position: 'relative', overflow: 'hidden', background: '#021526' }}>
          <video
            autoPlay
            muted
            loop
            playsInline
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
            }}
          >
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, transparent 55%, #021526 100%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, #021526 0%, transparent 15%)',
            pointerEvents: 'none',
          }} />
        </div>

        {/* Right: Text + CTA */}
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '64px 56px 64px 48px',
          background: '#021526',
        }}>
          <div style={{
            display: 'inline-block', marginBottom: '24px', padding: '5px 14px',
            borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(3,62,91,0.5)',
            backdropFilter: 'blur(8px)',
            alignSelf: 'flex-start',
            fontSize: '11px', fontFamily: 'DM Mono, monospace', letterSpacing: '0.1em',
            color: '#FFFCFC',
          }}>
            POWERED BY GPT-4o · CLAUDE · GEMINI · GROQ · LLAMA
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 3.5vw, 58px)', fontWeight: 800, lineHeight: 1.1,
            margin: '0 0 24px', color: '#FFFCFC',
            fontFamily: 'Cambria, Georgia, serif',
          }}>
            Your AI financial<br />advisor,<br />always on.
          </h1>

          <p style={{
            fontSize: '17px', lineHeight: 1.7, color: '#c8b0be',
            margin: '0 0 40px', maxWidth: '420px',
          }}>
            Ask about markets, track your portfolio, plan your budget, and get charts — all in one chat. Built for Africa, works everywhere.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '36px' }}>
            <button
              onClick={() => router.push('/register')}
              style={{
                padding: '14px 32px', borderRadius: '10px', border: 'none',
                background: '#632148', color: '#FFFCFC',
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
                background: 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(8px)',
                color: '#FFFCFC', fontSize: '15px', cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,33,72,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            >
              Log in
            </button>
          </div>

          {/* Trust badges */}
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {['12 real users', 'Live on Vercel', '5 AI models', '17 languages'].map(badge => (
              <div key={badge} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#c8b0be', fontFamily: 'DM Mono, monospace' }}>
                <span style={{ color: '#2ecc8a' }}>✓</span> {badge}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section style={{ maxWidth: '960px', margin: '0 auto', padding: '72px 24px 80px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 700, marginBottom: '40px', color: '#FFFCFC' }}>
          Everything you need in one place
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              padding: '20px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(3,62,91,0.3)',
              backdropFilter: 'blur(8px)',
              transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,33,72,0.5)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}
            >
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>{f.icon}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px', color: '#FFFCFC' }}>{f.title}</div>
              <div style={{ fontSize: '12px', lineHeight: 1.6, color: '#c8b0be' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '20px 32px', textAlign: 'center',
        fontSize: '12px', color: '#7ab0c0',
        fontFamily: 'DM Mono, monospace',
      }}>
        © {new Date().getFullYear()} FinAdvisor AI · AI, not a licensed financial advisor
      </footer>
    </div>
  )
}