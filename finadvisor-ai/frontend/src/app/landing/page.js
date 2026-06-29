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
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold-light)', fontSize: '13px', letterSpacing: '0.1em' }}>
          ◆ FINADVISOR AI
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--text-primary, var(--text-primary))',
      fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
      overflowX: 'hidden',
    }}>

      {/* ── Nav ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 32px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold-light)', fontSize: '14px', letterSpacing: '0.12em', fontWeight: 600 }}>
          ◆ FINADVISOR AI
        </span>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-primary)',
              fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          >
            Log in
          </button>
          <button
            onClick={() => router.push('/register')}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none',
              background: 'var(--gold)', color: 'var(--text-primary)',
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
        background: 'var(--bg-elevated)', borderBottom: '1px solid rgba(99,33,72,0.15)',
        padding: '8px 32px', fontSize: '12px', fontFamily: 'DM Mono, monospace',
        color: 'var(--gold)', letterSpacing: '0.05em',
        transition: 'opacity 0.4s',
      }}>
        ◆ {TICKERS[tickerIdx]}
      </div>

      {/* ── Hero — split layout: text left, video in phone right ── */}
      <section style={{
        display: 'flex', alignItems: 'center', minHeight: '88vh',
        maxWidth: '1200px', margin: '0 auto', padding: '48px 32px', gap: '48px',
        flexWrap: 'wrap',
      }}>
        {/* Left: headline + CTA */}
        <div style={{ flex: '1 1 340px', minWidth: '280px' }}>
          <div style={{
            display: 'inline-block', marginBottom: '20px', padding: '5px 14px',
            borderRadius: '20px', border: '1px solid var(--border-bright)',
            background: 'var(--bg-elevated)',
            fontSize: '11px', fontFamily: 'DM Mono, monospace', letterSpacing: '0.1em',
            color: 'var(--text-primary)',
          }}>
            POWERED BY GPT-4o · CLAUDE · GEMINI · GROQ · LLAMA
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 60px)', fontWeight: 800, lineHeight: 1.1,
            margin: '0 0 24px', color: 'var(--text-primary)',
            fontFamily: 'Cambria, Georgia, serif',
          }}>
            Your AI financial<br />advisor,<br />always on.
          </h1>

          <p style={{
            fontSize: '17px', lineHeight: 1.7, color: 'var(--text-secondary)',
            margin: '0 0 36px', maxWidth: '480px',
          }}>
            Ask about markets, track your portfolio, plan your budget, and get charts — all in one chat. Built for Africa, works everywhere.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px' }}>
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
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: '15px', cursor: 'pointer',
              }}
            >
              Log in
            </button>
          </div>

          {/* Trust badges */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {['12 real users', 'Live on Vercel', '5 AI models', '17 languages'].map(badge => (
              <div key={badge} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace' }}>
                <span style={{ color: '#2ecc8a' }}>✓</span> {badge}
              </div>
            ))}
          </div>
        </div>

        {/* Right: video inside phone frame */}
        <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            {/* Glow behind phone */}
            <div style={{ position: 'absolute', inset: '-40px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,33,72,0.25) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', inset: '-30px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(3,62,91,0.35) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none' }} />
            {/* Phone shell */}
            <div style={{
              position: 'relative', zIndex: 1,
              background: '#040B14', borderRadius: '38px', padding: '10px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.07)',
              border: '2px solid rgba(255,255,255,0.05)',
            }}>
              {/* Notch */}
              <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', width: '60px', height: '18px', background: '#040B14', borderRadius: '0 0 12px 12px', zIndex: 3 }} />
              {/* Screen with video */}
              <div style={{ borderRadius: '30px', overflow: 'hidden', aspectRatio: '9/16', background: '#021526', position: 'relative' }}>
                <img
                  src="/hero.png"
                  alt="FinAdvisor AI dashboard"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                />
              </div>
              {/* Home bar */}
              <div style={{ margin: '8px auto 2px', width: '80px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Fake chat preview ── */}
      <section style={{ maxWidth: '680px', margin: '0 auto 96px', padding: '0 24px' }}>
        <div style={{
          borderRadius: '16px', border: '1px solid var(--border)',
          background: 'var(--bg-elevated)', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          {/* window chrome */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28ca41', display: 'inline-block' }} />
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>FinAdvisor AI · Chat</span>
          </div>
          {/* messages */}
          <div style={{ padding: '20px 20px 8px' }}>
            <BubbleUser text="Show me my portfolio allocation as a pie chart 📊" />
            <BubbleAI text="Here's your portfolio pie chart! 🥧 It shows your allocation across 5 holdings — AAPL at 38%, BTC 22%, NVDA 18%, MSFT 14%, and Cash 8%. Your tech concentration is high; I'd suggest some diversification into bonds or international ETFs." />
            <BubbleUser text="What's the current Bitcoin price?" />
            <BubbleAI text="Bitcoin (BTC) is trading at $67,204.32 ▲ 1.41% in the last 24h 🚀. Market cap is ~$1.32T. Want me to log a position to your portfolio or chart the 30-day price trend?" />
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{
              borderRadius: '8px', border: '1px solid var(--border)',
              padding: '10px 14px', fontSize: '13px',
              color: 'var(--text-dim)', background: 'var(--bg-elevated)',
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
              border: '1px solid var(--border)',
              background: 'var(--bg-main)',
              transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,33,72,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>{f.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>{f.title}</div>
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA footer ── */}
      <section style={{
        textAlign: 'center', padding: '80px 24px 96px',
        borderTop: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 16px' }}>Ready to take control?</h2>
        <p style={{ color: 'var(--text-primary)', fontSize: '15px', margin: '0 0 32px' }}>
          Free to start. No credit card required.
        </p>
        <button
          onClick={() => router.push('/register')}
          style={{
            padding: '14px 40px', borderRadius: '10px', border: 'none',
            background: 'var(--gold)', color: 'var(--text-primary)',
            fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 24px rgba(99,33,72,0.35)',
          }}
        >
          Create your free account →
        </button>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '20px 32px', textAlign: 'center',
        fontSize: '12px', color: 'var(--text-dim)',
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
        background: 'var(--gold-dim)', border: '1px solid var(--gold)',
        fontSize: '13px', lineHeight: 1.5, color: 'var(--text-primary)',
      }}>{text}</div>
    </div>
  )
}

function BubbleAI({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
      <div style={{
        maxWidth: '80%', padding: '10px 14px', borderRadius: '12px 12px 12px 2px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        fontSize: '13px', lineHeight: 1.5, color: 'var(--text-primary)',
      }}>{text}</div>
    </div>
  )
}