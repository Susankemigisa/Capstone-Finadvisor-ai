'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

const FEATURES = [
  { icon: '📈', title: 'Live Market Data', desc: 'Real-time stocks, crypto, and index prices with one-click portfolio tracking.' },
  { icon: '🧠', title: 'AI Financial Advisor', desc: 'Ask anything — budgeting, tax planning, retirement goals — in your language.' },
  { icon: '📊', title: 'Instant Charts', desc: 'Bar, line, and pie charts generated from your real data, instantly.' },
  { icon: '🔒', title: 'Secure & Private', desc: 'bcrypt passwords, JWT sessions, masked account numbers. Your data stays yours.' },
  { icon: '🌍', title: '17 Languages', desc: 'Luganda, Swahili, Yoruba, Amharic, French, Arabic and more.' },
  { icon: '💳', title: 'African Payments', desc: 'MTN MoMo, Airtel Money, Flutterwave and Mono bank connections built in.' },
]

const TICKERS = ['AAPL $213.49 ▲2.1%', 'BTC $67,204 ▲1.4%', 'MSFT $421.12 ▼0.3%', 'NVDA $892.60 ▲4.7%', 'ETH $3,580 ▲0.9%']

export default function LandingPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [tickerIdx, setTickerIdx] = useState(0)

  useEffect(() => {
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (user) router.replace('/chat')
      else setChecking(false)
    })
  }, [])

  useEffect(() => {
    if (checking) return
    const id = setInterval(() => setTickerIdx(i => (i + 1) % TICKERS.length), 2200)
    return () => clearInterval(id)
  }, [checking])

  if (checking) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg-base)' }}>
        <div style={{ fontFamily:'DM Mono, monospace', color:'var(--gold-light)', fontSize:'13px', letterSpacing:'0.1em' }}>◆ FINADVISOR AI</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-base)', color:'var(--text-primary)', fontFamily:'DM Sans, system-ui, sans-serif', overflowX:'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 32px', position:'sticky', top:0, zIndex:50, background:'#02304a', borderBottom:'2px solid #632148' }}>
        <span style={{ fontFamily:'DM Mono, monospace', color:'#8a2f63', fontSize:'14px', letterSpacing:'0.12em', fontWeight:600 }}>◆ FINADVISOR AI</span>
        <div style={{ display:'flex', gap:'12px' }}>
          <button onClick={() => router.push('/login')} style={{ padding:'8px 20px', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'#FFFCFC', fontSize:'13px', cursor:'pointer' }}>Log in</button>
          <button onClick={() => router.push('/register')} style={{ padding:'8px 20px', borderRadius:'8px', border:'none', background:'#632148', color:'#FFFCFC', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>Get started free</button>
        </div>
      </nav>

      {/* ── Ticker ── */}
      <div style={{ background:'#021526', borderBottom:'1px solid rgba(99,33,72,0.25)', padding:'8px 32px', fontSize:'12px', fontFamily:'DM Mono, monospace', color:'#8a2f63', letterSpacing:'0.05em' }}>
        ◆ {TICKERS[tickerIdx]}
      </div>

      {/* ── HERO — split layout: text left, video right ── */}
      <section style={{ display:'flex', alignItems:'center', minHeight:'90vh', maxWidth:'1200px', margin:'0 auto', padding:'0 32px', gap:'48px' }}>

        {/* Left: headline + CTA */}
        <div style={{ flex:1, paddingRight:'16px' }}>
          <div style={{ display:'inline-block', marginBottom:'20px', padding:'5px 14px', borderRadius:'20px', border:'1px solid var(--border-bright)', background:'var(--bg-elevated)', fontSize:'11px', fontFamily:'DM Mono, monospace', letterSpacing:'0.1em', color:'var(--text-primary)' }}>
            POWERED BY GPT-4o · CLAUDE · GEMINI · GROQ · LLAMA
          </div>

          <h1 style={{ fontSize:'clamp(32px, 5vw, 60px)', fontWeight:800, lineHeight:1.1, margin:'0 0 24px', color:'var(--text-primary)', fontFamily:'Cambria, Georgia, serif' }}>
            Your AI financial<br />advisor,<br />always on.
          </h1>

          <p style={{ fontSize:'17px', lineHeight:1.7, color:'var(--text-secondary)', margin:'0 0 36px', maxWidth:'480px' }}>
            Ask about markets, track your portfolio, plan your budget, and get charts — all in one chat. Built for Africa, works everywhere.
          </p>

          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'32px' }}>
            <button onClick={() => router.push('/register')} style={{ padding:'14px 32px', borderRadius:'10px', border:'none', background:'#632148', color:'#FFFCFC', fontSize:'15px', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 24px rgba(99,33,72,0.35)', transition:'transform 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.transform='translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform='translateY(0)'}>
              Start for free →
            </button>
            <button onClick={() => router.push('/login')} style={{ padding:'14px 32px', borderRadius:'10px', border:'1px solid var(--border)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:'15px', cursor:'pointer' }}>
              Log in
            </button>
          </div>

          {/* Trust badges */}
          <div style={{ display:'flex', gap:'20px', flexWrap:'wrap' }}>
            {['12 real users', 'Live on Vercel', '5 AI models', '17 languages'].map(badge => (
              <div key={badge} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'var(--text-secondary)', fontFamily:'DM Mono, monospace' }}>
                <span style={{ color:'#2ecc8a' }}>✓</span> {badge}
              </div>
            ))}
          </div>
        </div>

        {/* Right: video in phone frame */}
        <div style={{ flex:'0 0 auto', display:'flex', justifyContent:'center', alignItems:'center' }}>
          {/* Phone frame wrapper */}
          <div style={{ position:'relative', width:'260px' }}>
            {/* Glow effect behind phone */}
            <div style={{ position:'absolute', inset:'-30px', borderRadius:'50%', background:'radial-gradient(circle, rgba(99,33,72,0.3) 0%, transparent 70%)', zIndex:0 }} />
            <div style={{ position:'absolute', inset:'-20px', borderRadius:'50%', background:'radial-gradient(circle, rgba(3,62,91,0.4) 0%, transparent 70%)', zIndex:0 }} />

            {/* Phone shell */}
            <div style={{ position:'relative', zIndex:1, background:'#040B14', borderRadius:'36px', padding:'10px', boxShadow:'0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)', border:'2px solid rgba(255,255,255,0.06)' }}>
              {/* Notch */}
              <div style={{ position:'absolute', top:'10px', left:'50%', transform:'translateX(-50%)', width:'60px', height:'20px', background:'#040B14', borderRadius:'0 0 12px 12px', zIndex:3 }} />
              {/* Screen */}
              <div style={{ borderRadius:'28px', overflow:'hidden', aspectRatio:'9/16', background:'#021526' }}>
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                >
                  <source src="/hero.mp4" type="video/mp4" />
                </video>
              </div>
              {/* Home bar */}
              <div style={{ margin:'8px auto 2px', width:'80px', height:'4px', background:'rgba(255,255,255,0.15)', borderRadius:'2px' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section style={{ maxWidth:'1000px', margin:'0 auto 96px', padding:'0 32px' }}>
        <h2 style={{ textAlign:'center', fontSize:'28px', fontWeight:700, marginBottom:'48px', color:'var(--text-primary)', fontFamily:'Cambria, Georgia, serif' }}>
          Everything you need in one place
        </h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:'20px' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding:'24px', borderRadius:'12px', border:'1px solid var(--border)', background:'var(--bg-surface)', transition:'border-color 0.2s, transform 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(99,33,72,0.4)'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)' }}>
              <div style={{ fontSize:'28px', marginBottom:'12px' }}>{f.icon}</div>
              <div style={{ fontSize:'15px', fontWeight:700, marginBottom:'6px', color:'var(--text-primary)' }}>{f.title}</div>
              <div style={{ fontSize:'13px', lineHeight:1.6, color:'var(--text-secondary)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section style={{ textAlign:'center', padding:'80px 24px 96px', background:'#02304a', borderTop:'2px solid #632148' }}>
        <h2 style={{ fontSize:'32px', fontWeight:800, margin:'0 0 16px', color:'#FFFCFC', fontFamily:'Cambria, Georgia, serif' }}>Ready to take control?</h2>
        <p style={{ color:'#c8b0be', fontSize:'15px', margin:'0 0 32px' }}>Free to start. No credit card required.</p>
        <button onClick={() => router.push('/register')} style={{ padding:'14px 40px', borderRadius:'10px', border:'none', background:'#632148', color:'#FFFCFC', fontSize:'15px', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 24px rgba(99,33,72,0.5)' }}>
          Create your free account →
        </button>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background:'#021526', borderTop:'1px solid rgba(255,255,255,0.06)', padding:'20px 32px', textAlign:'center', fontSize:'12px', color:'#7ab0c0', fontFamily:'DM Mono, monospace' }}>
        © {new Date().getFullYear()} FinAdvisor AI · AI, not a licensed financial advisor
      </footer>
    </div>
  )
}
