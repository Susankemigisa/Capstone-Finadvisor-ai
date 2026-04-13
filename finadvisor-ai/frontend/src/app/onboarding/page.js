'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path, opts = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers }
  }).then(r => r.json())
}

const STEPS = [
  { id: 'welcome',  title: 'Welcome to FinAdvisor', icon: '👋' },
  { id: 'profile',  title: 'Tell us about you',     icon: '👤' },
  { id: 'goal',     title: 'Your first savings goal', icon: '🎯' },
  { id: 'done',     title: 'You\'re all set!',        icon: '🎉' },
]

const CURRENCIES = [
  { code: 'UGX', name: 'Ugandan Shilling', flag: '🇺🇬' },
  { code: 'KES', name: 'Kenyan Shilling',  flag: '🇰🇪' },
  { code: 'USD', name: 'US Dollar',        flag: '🇺🇸' },
  { code: 'GBP', name: 'British Pound',    flag: '🇬🇧' },
  { code: 'EUR', name: 'Euro',             flag: '🇪🇺' },
  { code: 'NGN', name: 'Nigerian Naira',   flag: '🇳🇬' },
  { code: 'GHS', name: 'Ghanaian Cedi',    flag: '🇬🇭' },
  { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦' },
]

const GOAL_PRESETS = [
  { name: 'Emergency Fund',   icon: '🛡️', type: 'emergency_fund', hint: '3–6 months of expenses', amount: '' },
  { name: 'Holiday Trip',     icon: '✈️', type: 'savings',         hint: 'Save for your dream trip', amount: '' },
  { name: 'New Gadget',       icon: '📱', type: 'custom',          hint: 'Phone, laptop, etc', amount: '' },
  { name: 'House Deposit',    icon: '🏠', type: 'savings',         hint: 'Save for a home', amount: '' },
  { name: 'School Fees',      icon: '🎓', type: 'savings',         hint: 'Education costs', amount: '' },
  { name: 'Start a Business', icon: '🚀', type: 'custom',          hint: 'Business capital', amount: '' },
  { name: 'Custom Goal',      icon: '⭐', type: 'custom',          hint: 'Your own goal', amount: '' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Step 1 — profile
  const [preferredName, setPreferredName] = useState(user?.full_name?.split(' ')[0] || '')
  const [currency, setCurrency] = useState('UGX')

  // Step 2 — goal
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [goalName, setGoalName] = useState('')
  const [goalAmount, setGoalAmount] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [skipGoal, setSkipGoal] = useState(false)

  const handleProfileSave = async () => {
    setSaving(true)
    await req('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ preferred_name: preferredName, preferred_currency: currency })
    })
    setSaving(false)
    setStep(2)
  }

  const handleGoalSave = async () => {
    if (skipGoal) { setStep(3); return }
    const name = selectedPreset?.name === 'Custom Goal' ? goalName : (selectedPreset?.name || goalName)
    if (!name || !goalAmount) { setStep(3); return }
    setSaving(true)
    await req('/goals', {
      method: 'POST',
      body: JSON.stringify({
        goal_name: name,
        goal_type: selectedPreset?.type || 'custom',
        target_amount: parseFloat(goalAmount),
        target_date: goalDate || null,
      })
    })
    // Also create a matching savings pocket
    await req('/savings/pockets', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: selectedPreset?.hint || '',
        target_amount: parseFloat(goalAmount),
        currency,
        icon: selectedPreset?.icon || '💰',
        target_date: goalDate || null,
      })
    })
    setSaving(false)
    setStep(3)
  }

  const handleDone = async () => {
    // Mark onboarding complete using the auth store so the in-memory user
    // object is updated immediately — without this the chat page still sees
    // onboarding_complete=false and bounces the user back here on every visit
    const { updateProfile } = useAuthStore.getState()
    await updateProfile({ onboarding_complete: true })
    router.push('/chat')
  }

  const name = preferredName || user?.full_name?.split(' ')[0] || 'there'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ width: i === step ? '24px' : '8px', height: '8px', borderRadius: '4px', background: i <= step ? 'var(--gold)' : 'var(--border)', transition: 'all 0.3s ease' }} />
          ))}
        </div>

        {/* Step 0 — Welcome */}
        {step === 0 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>◆</div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontStyle: 'italic', fontWeight: 400, marginBottom: '12px', color: 'var(--gold)' }}>
              Welcome to FinAdvisor
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.7, marginBottom: '32px', maxWidth: '380px', margin: '0 auto 32px' }}>
              Your AI-powered financial advisor. We'll help you track your money, save automatically, and reach your financial goals — one step at a time.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px', textAlign: 'left', maxWidth: '320px', margin: '0 auto 32px' }}>
              {[
                { icon: '💬', text: 'Ask anything about your finances in plain language' },
                { icon: '⚡', text: 'Auto-save rules that work the moment money arrives' },
                { icon: '📊', text: 'Charts, reports, and insights updated in real time' },
                { icon: '🏦', text: 'Connect your bank or MTN MoMo for automatic tracking' },
              ].map(({ icon, text }) => (
                <div key={text} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingTop: '2px' }}>{text}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(1)}
              style={{ width: '100%', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
              Get started →
            </button>
            <button onClick={() => router.push('/chat')}
              style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '12px', marginTop: '12px', cursor: 'pointer', padding: '8px' }}>
              Skip setup, go straight to chat
            </button>
          </div>
        )}

        {/* Step 1 — Profile */}
        {step === 1 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px' }}>
            <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400, marginBottom: '6px' }}>Tell us about you</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '28px' }}>Just two quick things so FinAdvisor can personalise your experience</p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>WHAT SHOULD WE CALL YOU?</label>
              <input
                className="input"
                placeholder="Your first name or nickname"
                value={preferredName}
                onChange={e => setPreferredName(e.target.value)}
                autoFocus
                style={{ fontSize: '16px', padding: '12px 16px' }}
              />
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>YOUR MAIN CURRENCY</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {CURRENCIES.map(c => (
                  <button key={c.code} onClick={() => setCurrency(c.code)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: `2px solid ${currency === c.code ? 'var(--gold)' : 'var(--border)'}`, background: currency === c.code ? 'rgba(201,168,76,0.1)' : 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                    <span style={{ fontSize: '20px' }}>{c.flag}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.code}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{c.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleProfileSave} disabled={saving}
              style={{ width: '100%', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Continue →'}
            </button>
          </div>
        )}

        {/* Step 2 — First Goal */}
        {step === 2 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px' }}>
            <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400, marginBottom: '6px' }}>
              What are you saving for, {name}?
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
              Pick one to start — you can add more later. This creates both a goal and a savings pocket.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
              {GOAL_PRESETS.map((p, i) => (
                <button key={i} onClick={() => { setSelectedPreset(p); setGoalName(p.name !== 'Custom Goal' ? p.name : '') }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '10px', border: `2px solid ${selectedPreset?.name === p.name ? 'var(--gold)' : 'var(--border)'}`, background: selectedPreset?.name === p.name ? 'rgba(201,168,76,0.1)' : 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: '22px' }}>{p.icon}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{p.hint}</div>
                  </div>
                </button>
              ))}
            </div>

            {selectedPreset && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px', padding: '16px', background: 'var(--bg-elevated)', borderRadius: '12px' }}>
                {selectedPreset.name === 'Custom Goal' && (
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>GOAL NAME</label>
                    <input className="input" placeholder="What are you saving for?" value={goalName} onChange={e => setGoalName(e.target.value)} autoFocus />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>TARGET AMOUNT ({currency})</label>
                  <input className="input" type="number" placeholder="e.g. 5000000" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>TARGET DATE <span style={{ color: 'var(--text-dim)' }}>(optional)</span></label>
                  <input className="input" type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)} />
                </div>
              </div>
            )}

            <button onClick={handleGoalSave} disabled={saving}
              style={{ width: '100%', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '10px' }}>
              {saving ? 'Creating...' : selectedPreset ? 'Create goal & pocket →' : 'Continue →'}
            </button>
            <button onClick={() => { setSkipGoal(true); setStep(3) }}
              style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '12px', cursor: 'pointer', padding: '6px' }}>
              Skip for now, I'll add goals later
            </button>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontStyle: 'italic', fontWeight: 400, marginBottom: '12px', color: 'var(--gold)' }}>
              You're all set, {name}!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.7, marginBottom: '32px' }}>
              Your account is ready. Here are some things to try first:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px', textAlign: 'left' }}>
              {[
                { icon: '💬', text: 'Ask FinAdvisor anything — "What\'s my savings rate?" or "Create a chart of my spending"', href: '/chat' },
                { icon: '🔗', text: 'Connect your MTN MoMo or bank so savings rules run automatically', href: '/connections' },
                { icon: '⚡', text: 'Create a rule to save 20% of every payment automatically', href: '/rules' },
                { icon: '🏦', text: 'View your savings pockets and track your progress', href: '/savings' },
              ].map(({ icon, text, href }) => (
                <a key={href} href={href}
                  style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', background: 'var(--bg-elevated)', borderRadius: '10px', border: '1px solid var(--border)', textDecoration: 'none', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold-dim)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingTop: '1px', lineHeight: 1.5 }}>{text}</span>
                </a>
              ))}
            </div>
            <button onClick={handleDone}
              style={{ width: '100%', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
              Go to FinAdvisor →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}