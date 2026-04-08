'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import { useThemeStore } from '@/stores/themeStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
function req(path, opts = {}) {
  const token = localStorage.getItem('access_token')
  return fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers } }).then(r => r.json())
}

const FEATURES = [
  'Unlimited messages',
  'Access to all AI models (GPT-4o, Claude, Gemini)',
  'Advanced analytics',
  'Priority support',
  'Early access to new features',
  'Everything in Free, plus more',
]

const FREE_FEATURES = [
  '80 messages / 3 hours',
  'GPT-4o Mini access',
  'Basic analytics',
  'CSV & JSON export',
  'Portfolio tracking',
]

export default function BillingPage() {
  const router = useRouter()
  const { user, loading: authLoading, init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()
  const [billingStatus, setBillingStatus] = useState(null)
  const [loading, setLoading] = useState(null)

  useEffect(() => {
    initLang()
    initTheme()
    init().then(async () => {
      const { user } = useAuthStore.getState()
      if (!user) { router.replace('/login'); return }
      try { const status = await req('/billing/status'); setBillingStatus(status) }
      catch (e) { console.error(e) }
    })
  }, [])

  const handleUpgrade = async (plan) => {
    setLoading(plan)
    try {
      const res = await req(`/billing/checkout?plan=${plan}`, { method: 'POST' })
      if (res.checkout_url) window.location.href = res.checkout_url
      else throw new Error(res.detail || 'Failed to create checkout')
    } catch (e) { alert(e.message) } finally { setLoading(null) }
  }

  if (authLoading || !user) return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>Loading...</div>
      </div>
    </div>
  )

  const isPro = billingStatus?.is_pro || user?.tier === 'pro'

  // Shared card style
  const cardBase = {
    borderRadius: '14px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-surface)',
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>

        {/* Header */}
        <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400, margin: 0 }}>
            {isPro ? '◆ You\'re on Pro' : 'Upgrade to Pro'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', marginBottom: 0 }}>
            {isPro ? 'Thank you for supporting FinAdvisor AI.' : 'Unlock the full power of your financial AI advisor.'}
          </p>
        </div>

        <div style={{ padding: '32px 28px' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto' }}>

            {isPro ? (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold-dim)', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
                <div style={{ fontSize: '52px', marginBottom: '16px' }}>◆</div>
                <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '14px', letterSpacing: '0.1em', marginBottom: '8px' }}>PRO MEMBER</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>You have unlimited access to all features.</p>
              </div>
            ) : (
              <>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '36px' }}>
                  Start free. Upgrade when you need more power.
                </p>

                {/* paddingTop gives the absolute-positioned badge pills space above each card */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '36px', paddingTop: '14px' }}>

                  {/* ── Free ── */}
                  <div style={{ ...cardBase, border: '1px solid var(--border)' }}>
                    {/* invisible spacer so price row aligns with Pro cards */}
                    <div style={{ height: '14px' }} />
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '14px' }}>FREE</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '34px', fontWeight: 700, lineHeight: 1 }}>$0</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px', marginBottom: '22px' }}>Forever free</div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                      {FREE_FEATURES.map(f => (
                        <div key={f} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>○</span><span>{f}</span>
                        </div>
                      ))}
                    </div>
                    <button disabled style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', fontSize: '12px', color: 'var(--text-dim)', cursor: 'not-allowed', fontFamily: 'DM Mono, monospace' }}>
                      Current Plan
                    </button>
                  </div>

                  {/* ── Pro Monthly ── */}
                  <div style={{ ...cardBase, border: '1px solid var(--border)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '-13px', left: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>
                      🔹 PRO — MONTHLY
                    </div>
                    <div style={{ height: '14px' }} />
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '14px', opacity: 0 }}>PRO</div>
                    <div style={{ lineHeight: 1 }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '34px', fontWeight: 700 }}>$19</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>/mo</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px', marginBottom: '22px' }}>Billed monthly</div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                      {FEATURES.map(f => (
                        <div key={f} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--gold)', flexShrink: 0 }}>◆</span><span>{f}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleUpgrade('pro_monthly')} disabled={!!loading}
                      style={{ width: '100%', background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading === 'pro_monthly' ? 0.7 : 1, transition: 'all 0.15s', fontFamily: 'DM Mono, monospace' }}
                      onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = 'var(--gold)'; e.currentTarget.style.color = '#0a0c10' } }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--gold)' }}
                    >
                      {loading === 'pro_monthly' ? 'Redirecting…' : 'Upgrade Monthly →'}
                    </button>
                  </div>

                  {/* ── Pro Yearly ── */}
                  <div style={{ ...cardBase, border: '2px solid var(--gold)', position: 'relative', boxShadow: '0 0 28px rgba(201,168,76,0.1)' }}>
                    <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#0a0c10', fontSize: '10px', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>
                      ⭐ BEST VALUE — SAVE 30%
                    </div>
                    <div style={{ height: '14px' }} />
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '14px' }}>🔹 PRO — YEARLY</div>
                    <div style={{ lineHeight: 1 }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '34px', fontWeight: 700, color: 'var(--gold)' }}>$159</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>/year</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>$13/month · billed annually</div>
                    <div style={{ display: 'inline-block', marginTop: '8px', marginBottom: '22px', background: 'rgba(201,168,76,0.12)', border: '1px solid var(--gold-dim)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: 'var(--gold)', fontFamily: 'DM Mono, monospace' }}>
                      Save $69 vs monthly
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                      {FEATURES.map(f => (
                        <div key={f} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--gold)', flexShrink: 0 }}>◆</span><span>{f}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleUpgrade('pro_yearly')} disabled={!!loading}
                      style={{ width: '100%', background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading === 'pro_yearly' ? 0.7 : 1, transition: 'all 0.15s', fontFamily: 'DM Mono, monospace' }}
                    >
                      {loading === 'pro_yearly' ? 'Redirecting…' : 'Upgrade Yearly → Best Deal'}
                    </button>
                  </div>

                </div>

                {/* Trust badges */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '28px', flexWrap: 'wrap' }}>
                  {['🔒 Secure payments via Stripe', '↩ Cancel anytime', '✦ No hidden fees'].map(b => (
                    <span key={b} style={{ color: 'var(--text-dim)', fontSize: '12px', fontFamily: 'DM Mono, monospace' }}>{b}</span>
                  ))}
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}