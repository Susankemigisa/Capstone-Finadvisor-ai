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
  { id: 'finances', title: 'Your financial picture', icon: '💰' },
  { id: 'done',     title: "You're all set!",        icon: '🎉' },
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

const FINANCIAL_GOALS = [
  { id: 'grow_wealth',    icon: '📈', label: 'Grow my wealth',          hint: 'Investments & portfolio' },
  { id: 'budget_better',  icon: '📊', label: 'Budget better',           hint: 'Track income & expenses' },
  { id: 'emergency_fund', icon: '🛡️', label: 'Build an emergency fund',  hint: '3–6 months of expenses' },
  { id: 'debt_free',      icon: '💳', label: 'Become debt-free',         hint: 'Pay off loans & credit' },
  { id: 'retire_early',   icon: '🏖️', label: 'Plan for retirement',      hint: 'Long-term financial freedom' },
  { id: 'business',       icon: '🚀', label: 'Fund my business',         hint: 'Capital & cash flow' },
]

const INCOME_RANGES = [
  { id: 'under_1m',   label: 'Under UGX 1M / month' },
  { id: '1m_3m',      label: 'UGX 1M – 3M / month' },
  { id: '3m_10m',     label: 'UGX 3M – 10M / month' },
  { id: 'over_10m',   label: 'Over UGX 10M / month' },
  { id: 'prefer_not', label: 'Prefer not to say' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [preferredName, setPreferredName] = useState(user?.full_name?.split(' ')[0] || '')
  const [currency, setCurrency] = useState('UGX')
  const [selectedGoals, setSelectedGoals] = useState([])
  const [incomeRange, setIncomeRange] = useState('')

  const toggleGoal = (id) => {
    setSelectedGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }

  const handleProfileSave = async () => {
    setSaving(true)
    await req('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ preferred_name: preferredName, preferred_currency: currency })
    })
    setSaving(false)
    setStep(2)
  }

  const handleFinancesSave = async () => {
    setSaving(true)
    await req('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ financial_goals: selectedGoals, income_range: incomeRange || 'prefer_not' })
    }).catch(() => {})
    setSaving(false)
    setStep(3)
  }

  const handleDone = async () => {
    const { updateProfile } = useAuthStore.getState()
    await updateProfile({ onboarding_complete: true })
    router.push('/chat')
  }

  const name = preferredName || user?.full_name?.split(' ')[0] || 'there'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ width: i === step ? '24px' : '8px', height: '8px', borderRadius: '4px', background: i <= step ? 'var(--gold)' : 'var(--border)', transition: 'all 0.3s ease' }} />
          ))}
        </div>

        {step === 0 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>◆</div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontStyle: 'italic', fontWeight: 400, marginBottom: '12px', color: 'var(--gold)' }}>
              Welcome to FinAdvisor
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.7, margin: '0 auto 32px', maxWidth: '380px' }}>
              Your AI-powered financial advisor. Ask anything about your money, track your portfolio, manage your budget, and get personalised guidance — all in one place.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px', textAlign: 'left', maxWidth: '320px', margin: '0 auto 32px' }}>
              {[
                { icon: '💬', text: 'Ask anything about your finances in plain language' },
                { icon: '📈', text: 'Track stocks, crypto, and your investment portfolio' },
                { icon: '📊', text: 'Budget tracking, insights, and financial health score' },
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

        {step === 1 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px' }}>
            <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400, marginBottom: '6px' }}>Tell us about you</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '28px' }}>Just two quick things so FinAdvisor can personalise your experience</p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>WHAT SHOULD WE CALL YOU?</label>
              <input className="input" placeholder="Your first name or nickname" value={preferredName}
                onChange={e => setPreferredName(e.target.value)} autoFocus style={{ fontSize: '16px', padding: '12px 16px' }} />
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

        {step === 2 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px' }}>
            <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400, marginBottom: '6px' }}>
              What matters most to you, {name}?
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
              Select all that apply — your AI advisor will tailor its advice to your priorities.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
              {FINANCIAL_GOALS.map((g) => {
                const selected = selectedGoals.includes(g.id)
                return (
                  <button key={g.id} onClick={() => toggleGoal(g.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '10px', border: `2px solid ${selected ? 'var(--gold)' : 'var(--border)'}`, background: selected ? 'rgba(201,168,76,0.1)' : 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                    <span style={{ fontSize: '22px', flexShrink: 0 }}>{g.icon}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{g.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{g.hint}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', display: 'block', marginBottom: '10px' }}>
                MONTHLY INCOME RANGE <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {INCOME_RANGES.map(r => (
                  <button key={r.id} onClick={() => setIncomeRange(r.id)}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: `2px solid ${incomeRange === r.id ? 'var(--gold)' : 'var(--border)'}`, background: incomeRange === r.id ? 'rgba(201,168,76,0.1)' : 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: 'var(--text-primary)', transition: 'all 0.15s' }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleFinancesSave} disabled={saving}
              style={{ width: '100%', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '10px' }}>
              {saving ? 'Saving...' : 'Continue →'}
            </button>
            <button onClick={() => setStep(3)}
              style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '12px', cursor: 'pointer', padding: '6px' }}>
              Skip for now
            </button>
          </div>
        )}

        {step === 3 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontStyle: 'italic', fontWeight: 400, marginBottom: '12px', color: 'var(--gold)' }}>
              {"You're all set, "}{name}!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.7, marginBottom: '32px' }}>
              Your AI financial advisor is ready. Here are some things to try first:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px', textAlign: 'left' }}>
              {[
                { icon: '💬', text: 'Ask FinAdvisor anything — "Analyse my spending" or "What stocks should I watch?"', href: '/chat' },
                { icon: '📊', text: 'Set up your budget to track income and expenses automatically', href: '/budget' },
                { icon: '🔗', text: 'Connect your MTN MoMo or bank for real-time transaction tracking', href: '/connections' },
                { icon: '📈', text: 'Add stocks or crypto to your portfolio and track performance', href: '/portfolio' },
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