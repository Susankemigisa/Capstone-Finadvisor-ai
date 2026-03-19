'use client'
import { useState } from 'react'

const TIPS = [
  { icon: '📈', title: 'Stock Prices', example: 'What is Apple\'s current stock price?', desc: 'Get real-time prices for any stock' },
  { icon: '₿', title: 'Crypto', example: 'How much is Bitcoin worth right now?', desc: 'Live crypto prices via CoinGecko' },
  { icon: '💼', title: 'Portfolio', example: 'Add 10 shares of TSLA at $250 to my portfolio', desc: 'Track your holdings and P&L' },
  { icon: '📰', title: 'Market News', example: 'What\'s the latest news about Tesla?', desc: 'Real-time financial news per stock' },
  { icon: '🧮', title: 'Calculations', example: 'If I invest $500/month for 20 years at 8%, how much will I have?', desc: 'Compound interest, ROI, DCA' },
  { icon: '🏦', title: 'Retirement', example: 'Help me plan retirement if I\'m 30 and want to retire at 60', desc: 'Retirement projections' },
  { icon: '📊', title: 'Charts', example: 'Create a chart showing S&P 500 vs NASDAQ this year', desc: 'AI-generated financial visuals' },
  { icon: '📄', title: 'Documents', example: 'Upload your annual report and ask: What was the net profit?', desc: 'RAG over your uploaded docs' },
  { icon: '💸', title: 'Budget', example: 'I spent $200 on groceries today', desc: 'Track expenses and income' },
  { icon: '🌍', title: 'Currency', example: 'How much is 1000 USD in Ugandan Shillings?', desc: 'Live exchange rates' },
]

export default function HelpGuide({ onExample }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-dim)', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>?</span> Help
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '20px', fontStyle: 'italic', fontWeight: 400 }}>What can I help you with? 💡</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Click any example to try it</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px', padding: '4px' }}>✕</button>
            </div>

            {/* Tips grid */}
            <div style={{ padding: '20px 24px', overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {TIPS.map((tip, i) => (
                <button key={i} onClick={() => { onExample(tip.example); setOpen(false) }}
                  style={{ textAlign: 'left', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold-dim)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>{tip.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{tip.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px' }}>{tip.desc}</div>
                  <div style={{ fontSize: '11px', color: 'var(--gold)', fontStyle: 'italic', lineHeight: 1.4 }}>&ldquo;{tip.example}&rdquo;</div>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>
              💬 You can ask in any language · 🎤 Voice input available · 📎 Upload documents for analysis
            </div>
          </div>
        </div>
      )}
    </>
  )
}