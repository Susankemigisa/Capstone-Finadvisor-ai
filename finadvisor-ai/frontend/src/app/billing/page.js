'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path, opts = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers }
  }).then(r => r.json())
}

function fmt(n) {
  return new Intl.NumberFormat('en-UG').format(n)
}

const PROVIDERS = [
  { id: 'mtn',    name: 'MTN MoMo',     color: '#FFCC00', textColor: '#000', icon: '📱', prefix: '077 / 078 / 076 / 079' },
  { id: 'airtel', name: 'Airtel Money',  color: '#FF0000', textColor: '#fff', icon: '📡', prefix: '070 / 075 / 074' },
]

export default function BillingPage() {
  const router = useRouter()
  const { user, loading: authLoading, init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const [billingStatus, setBillingStatus] = useState(null)
  const [plans, setPlans] = useState({})
  const [interval, setInterval_] = useState('monthly')
  const [step, setStep] = useState('plans')   // plans | pay | polling | success | error
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [initiating, setInitiating] = useState(false)
  const [referenceId, setReferenceId] = useState(null)
  const [pollCount, setPollCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    initTheme()
    init().then(async () => {
      const { user } = useAuthStore.getState()
      if (!user) { router.replace('/login'); return }
      const [status, plansData] = await Promise.all([req('/billing/status'), req('/billing/plans')])
      setBillingStatus(status)
      setPlans(plansData.plans || {})
    })
    return () => clearInterval(pollRef.current)
  }, [])

  const selectedPlan = interval === 'monthly' ? plans['pro_monthly'] : plans['pro_yearly']
  const planKey = interval === 'monthly' ? 'pro_monthly' : 'pro_yearly'

  const validatePhone = (p) => {
    const clean = p.replace(/\s/g, '')
    if (!clean) return 'Phone number is required'
    if (!/^(0|\+256|256)?[1-9]\d{8}$/.test(clean)) return 'Enter a valid Ugandan phone number'
    if (selectedProvider?.id === 'mtn' && !/^(0|\+256|256)?(77|78|76|79)/.test(clean)) return 'MTN numbers start with 077, 078, 079 or 076'
    if (selectedProvider?.id === 'airtel' && !/^(0|\+256|256)?(70|75|74)/.test(clean)) return 'Airtel numbers start with 070, 074 or 075'
    return ''
  }

  const handleInitiate = async () => {
    const err = validatePhone(phone)
    if (err) { setPhoneError(err); return }
    setPhoneError('')
    setInitiating(true)
    try {
      const data = await req('/billing/initiate', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey, provider: selectedProvider.id, phone_number: phone })
      })
      if (data.reference_id) {
        setReferenceId(data.reference_id)
        setStep('polling')
        startPolling(data.reference_id)
      } else {
        setErrorMsg(data.detail || 'Failed to initiate payment. Please try again.')
        setStep('error')
      }
    } catch (e) {
      setErrorMsg('Could not reach the payment server. Please try again.')
      setStep('error')
    }
    setInitiating(false)
  }

  const startPolling = (ref) => {
    let count = 0
    pollRef.current = setInterval(async () => {
      count++
      setPollCount(count)
      if (count > 40) { // 2 minutes max
        clearInterval(pollRef.current)
        setErrorMsg('Payment timed out. Please try again.')
        setStep('error')
        return
      }
      try {
        const data = await req(`/billing/poll/${ref}`)
        if (data.status === 'successful') {
          clearInterval(pollRef.current)
          setStep('success')
          setBillingStatus({ is_pro: true, tier: 'pro', plan: data.plan })
          // Update auth store so header shows Pro immediately
          const { updateProfile } = useAuthStore.getState()
          await updateProfile({ tier: 'pro' }).catch(() => {})
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current)
          setErrorMsg(data.reason || 'Payment was declined or cancelled. Please try again.')
          setStep('error')
        }
      } catch {}
    }, 3000)
  }

  const isPro = billingStatus?.is_pro || user?.tier === 'pro'

  if (authLoading || !user) return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading...</div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ paddingBottom: '16px' }}>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>
              {isPro ? 'Your Subscription' : 'Upgrade to Pro'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
              Pay with MTN MoMo or Airtel Money — no card needed
            </p>
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: '640px' }}>

          {/* ── Already Pro ── */}
          {isPro && (
            <div style={{ background: 'var(--bg-surface)', border: '2px solid var(--gold)', borderRadius: '16px', padding: '32px', textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>◆</div>
              <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '14px', letterSpacing: '0.1em', marginBottom: '8px' }}>PRO MEMBER</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                Plan: <strong style={{ color: 'var(--text-primary)' }}>{billingStatus?.plan === 'pro_yearly' ? 'Pro Yearly' : 'Pro Monthly'}</strong>
                {' · '}Provider: <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{billingStatus?.provider || '—'}</strong>
              </div>
              {billingStatus?.expires_at && (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
                  Renews: {new Date(billingStatus.expires_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
              <button onClick={async () => { if (!confirm('Cancel your Pro subscription?')) return; await req('/billing/cancel', { method: 'POST' }); setBillingStatus({ is_pro: false, tier: 'free' }) }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 20px', color: '#f87171', fontSize: '12px', cursor: 'pointer' }}>
                Cancel subscription
              </button>
            </div>
          )}

          {/* ── Plans ── */}
          {!isPro && step === 'plans' && (
            <>
              {/* Interval toggle */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px', display: 'flex', gap: '4px' }}>
                  {['monthly', 'yearly'].map(i => (
                    <button key={i} onClick={() => setInterval_(i)}
                      style={{ padding: '8px 20px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: interval === i ? 'var(--gold)' : 'transparent', color: interval === i ? '#000' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                      {i === 'yearly' ? 'Yearly (save 20%)' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plan cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
                {/* Free */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Free</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>UGX 0</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Forever free</div>
                  {['10 messages / 3 hours', 'Basic AI model', 'Portfolio tracking', 'Budget & goals'].map(f => (
                    <div key={f} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--text-dim)' }}>○</span> {f}
                    </div>
                  ))}
                  <button disabled style={{ width: '100%', marginTop: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'not-allowed' }}>
                    Current plan
                  </button>
                </div>

                {/* Pro */}
                <div style={{ background: 'var(--bg-surface)', border: '2px solid var(--gold)', borderRadius: '14px', padding: '24px', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#000', fontSize: '10px', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                    MOST POPULAR
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gold-light)', marginBottom: '8px' }}>Pro</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '28px', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>
                    UGX {selectedPlan ? fmt(selectedPlan.amount_ugx) : '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                    per {selectedPlan?.interval_label || 'month'}
                  </div>
                  {(selectedPlan?.features || []).map(f => (
                    <div key={f} style={{ fontSize: '12px', marginBottom: '8px', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--gold)' }}>◆</span> {f}
                    </div>
                  ))}
                  <button onClick={() => setStep('pay')}
                    style={{ width: '100%', marginTop: '16px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    Upgrade with MoMo →
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', color: 'var(--text-dim)', fontSize: '12px' }}>
                {['No card needed', 'Pay with MoMo or Airtel', 'Cancel anytime'].map(b => <span key={b}>{b}</span>)}
              </div>
            </>
          )}

          {/* ── Payment step ── */}
          {!isPro && step === 'pay' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px' }}>
              <button onClick={() => { setStep('plans'); setSelectedProvider(null); setPhone(''); setPhoneError('') }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', marginBottom: '20px', padding: 0 }}>
                ← Back
              </button>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Paying: <strong style={{ color: 'var(--gold)' }}>UGX {selectedPlan ? fmt(selectedPlan.amount_ugx) : '—'}</strong>
                {' '}for <strong style={{ color: 'var(--text-primary)' }}>{selectedPlan?.name}</strong>
              </div>

              {/* Provider selection */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', display: 'block', marginBottom: '10px' }}>SELECT YOUR NETWORK</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {PROVIDERS.map(p => (
                    <button key={p.id} onClick={() => { setSelectedProvider(p); setPhone(''); setPhoneError('') }}
                      style={{ padding: '16px', borderRadius: '12px', border: `2px solid ${selectedProvider?.id === p.id ? p.color : 'var(--border)'}`, background: selectedProvider?.id === p.id ? p.color + '18' : 'var(--bg-elevated)', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <div style={{ fontSize: '24px', marginBottom: '6px' }}>{p.icon}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>{p.prefix}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone number */}
              {selectedProvider && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                    YOUR {selectedProvider.name.toUpperCase()} NUMBER
                  </label>
                  <input
                    type="tel"
                    placeholder={selectedProvider.id === 'mtn' ? '0771234567' : '0701234567'}
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setPhoneError('') }}
                    className="input"
                    style={{ fontSize: '16px', letterSpacing: '0.05em' }}
                    autoFocus
                  />
                  {phoneError && <div style={{ color: '#f87171', fontSize: '12px', marginTop: '6px' }}>{phoneError}</div>}
                </div>
              )}

              {/* How it works */}
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text-primary)' }}>How it works:</strong>
                <br />1. Click Pay — we send a prompt to your phone
                <br />2. You'll see "FinAdvisor Pro" on your {selectedProvider?.name || 'MoMo'} screen
                <br />3. Enter your MoMo PIN to approve
                <br />4. Your account upgrades instantly ✓
              </div>

              <button
                onClick={handleInitiate}
                disabled={!selectedProvider || !phone || initiating}
                style={{ width: '100%', background: selectedProvider ? (selectedProvider.color) : 'var(--bg-elevated)', color: selectedProvider ? selectedProvider.textColor : 'var(--text-dim)', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: (!selectedProvider || !phone || initiating) ? 'not-allowed' : 'pointer', opacity: (!selectedProvider || !phone) ? 0.5 : 1, transition: 'all 0.15s' }}>
                {initiating ? 'Sending payment request...' : `Pay UGX ${selectedPlan ? fmt(selectedPlan.amount_ugx) : ''} →`}
              </button>
            </div>
          )}

          {/* ── Polling / waiting ── */}
          {step === 'polling' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Processing payment…
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.7 }}>
                {selectedProvider?.id === 'mtn' ? (
                  <>
                    Your <strong style={{ color: 'var(--text-primary)' }}>MTN MoMo</strong> payment of{' '}
                    <strong style={{ color: 'var(--gold)' }}>UGX {selectedPlan ? fmt(selectedPlan.amount_ugx) : ''}</strong> is being processed.
                    <br />If a PIN prompt appears on your phone, enter your MoMo PIN to approve.
                  </>
                ) : (
                  <>
                    Check your phone for an <strong style={{ color: 'var(--text-primary)' }}>Airtel Money</strong> payment request for{' '}
                    <strong style={{ color: 'var(--gold)' }}>UGX {selectedPlan ? fmt(selectedPlan.amount_ugx) : ''}</strong>.
                    <br />Enter your PIN to approve.
                  </>
                )}
              </div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                Checking status… ({Math.ceil((40 - pollCount) * 3)}s remaining)
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '20px' }}>
                Reference: <span style={{ fontFamily: 'DM Mono, monospace' }}>{referenceId?.slice(0, 8)}…</span>
              </div>
              <button onClick={() => { clearInterval(pollRef.current); setStep('plans') }}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '12px', cursor: 'pointer' }}>
                Cancel and go back
              </button>
            </div>
          )}

          {/* ── Success ── */}
          {step === 'success' && (
            <div style={{ background: 'var(--bg-surface)', border: '2px solid #34d399', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#34d399', marginBottom: '8px' }}>You're now on Pro!</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
                Payment confirmed. All Pro features are now unlocked.
              </div>
              <button onClick={() => router.push('/chat')}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '10px', padding: '12px 28px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                Start using Pro →
              </button>
            </div>
          )}

          {/* ── Error ── */}
          {step === 'error' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid #f87171', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>❌</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#f87171', marginBottom: '8px' }}>Payment failed</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>{errorMsg}</div>
              <button onClick={() => { setStep('pay'); setErrorMsg('') }}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}