'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { useTranslate } from '@/stores/langStore'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── 6-digit code input (one box per digit) ────────────────────────────────────
function CodeInput({ value, onChange }) {
  const refs = useRef([])
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6)

  const handleKey = (e, idx) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = digits.map((d, i) => (i === idx ? '' : d)).join('')
      onChange(next)
      if (idx > 0) refs.current[idx - 1]?.focus()
      return
    }
    if (e.key === 'ArrowLeft' && idx > 0) { refs.current[idx - 1]?.focus(); return }
    if (e.key === 'ArrowRight' && idx < 5) { refs.current[idx + 1]?.focus(); return }
  }

  const handleChange = (e, idx) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1)
    if (!char) return
    const next = digits.map((d, i) => (i === idx ? char : d)).join('')
    onChange(next)
    if (idx < 5) refs.current[idx + 1]?.focus()
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(pasted.padEnd(6, '').slice(0, 6))
    refs.current[Math.min(pasted.length, 5)]?.focus()
  }

  return (
    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '8px 0' }}>
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={el => refs.current[idx] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => handleChange(e, idx)}
          onKeyDown={e => handleKey(e, idx)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          style={{
            width: '48px', height: '56px', textAlign: 'center',
            fontSize: '24px', fontFamily: 'DM Mono, monospace', fontWeight: 700,
            background: digit ? 'rgba(201,168,76,0.08)' : 'var(--bg-base)',
            border: `2px solid ${digit ? 'var(--gold)' : 'var(--border)'}`,
            borderRadius: '10px', color: 'var(--text-primary)',
            outline: 'none', transition: 'all 0.15s', cursor: 'text',
            caretColor: 'var(--gold)',
          }}
        />
      ))}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const BG = {
  minHeight: '100vh', background: 'var(--bg-base)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
}
const GRID_OVERLAY = {
  position: 'fixed', inset: 0,
  backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
  backgroundSize: '60px 60px', opacity: 0.3, pointerEvents: 'none',
}
const CARD = { padding: '36px', borderRadius: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }
const BTN_PRIMARY = {
  width: '100%', justifyContent: 'center', padding: '12px',
  background: 'var(--gold)', color: '#0a0c10', border: 'none',
  borderRadius: '10px', fontSize: '14px', fontWeight: 700,
  cursor: 'pointer', transition: 'opacity 0.15s',
}
const ERR_BOX = {
  background: 'rgba(248,113,113,0.08)', border: '1px solid #f87171',
  borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#f87171',
}

export default function ForgotPasswordPage() {
  const t = useTranslate()
  const [step, setStep] = useState('request') // request | check-email | enter-code | reset | done
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const checks = [
    newPassword.length >= 8,
    /[A-Z]/.test(newPassword),
    /[a-z]/.test(newPassword),
    /\d/.test(newPassword),
  ]
  const strongEnough = checks.every(Boolean)
  const strengthLabels = [
    t('auth.passwordStrength8'),
    t('auth.passwordStrengthUpper'),
    t('auth.passwordStrengthLower'),
    t('auth.passwordStrengthNum'),
  ]

  // Step 1 — send email
  const handleRequest = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await r.json()
      // Always go to check-email — never expose token in UI
      setStep('check-email')
    } catch { setError(t('auth.somethingWrong')) }
    setLoading(false)
  }

  // Step 2 — verify code & reset password
  const handleReset = async (e) => {
    e.preventDefault()
    if (code.replace(/\s/g, '').length < 6) { setError('Please enter the full 6-digit code'); return }
    if (!strongEnough) { setError(t('auth.passwordRequirements')); return }
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code.trim(), new_password: newPassword }),
      })
      const data = await r.json()
      if (data.success) setStep('done')
      else setError(data.detail || t('auth.resetFailed'))
    } catch { setError(t('auth.somethingWrong')) }
    setLoading(false)
  }

  return (
    <div style={BG}>
      <div style={GRID_OVERLAY} />
      <div style={{ width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '10px' }}>
            ◆ FINADVISOR AI
          </div>
          <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontWeight: 400, color: 'var(--text-primary)', fontStyle: 'italic', margin: 0 }}>
            {step === 'done' ? t('auth.passwordUpdated') : t('auth.resetPassword')}
          </h1>
        </div>

        {/* ── Step 1: Enter email ── */}
        {step === 'request' && (
          <div style={CARD}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.6 }}>
              {t('auth.resetSubtitle')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  {t('auth.emailAddress')}
                </label>
                <input
                  className="input" type="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus
                />
              </div>
              {error && <div style={ERR_BOX}>{error}</div>}
              <button style={BTN_PRIMARY} onClick={handleRequest} disabled={loading || !email.trim()}>
                {loading ? t('auth.sending') : t('auth.sendResetLink')}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Check inbox ── */}
        {step === 'check-email' && (
          <div style={{ ...CARD, textAlign: 'center' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>📬</div>
            <p style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
              {t('auth.checkInbox')}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6, marginBottom: '28px' }}>
              We sent a <strong style={{ color: 'var(--text-primary)' }}>6-digit code</strong> to <strong style={{ color: 'var(--gold)' }}>{email}</strong>. 
              Copy it from your email and enter it below.
            </p>
            <button style={{ ...BTN_PRIMARY, marginBottom: '16px' }} onClick={() => setStep('enter-code')}>
              Enter Code →
            </button>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: 0 }}>
              Didn&apos;t get it?{' '}
              <button onClick={() => setStep('request')} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '12px', padding: 0 }}>
                Try again
              </button>
            </p>
          </div>
        )}

        {/* ── Step 3: Enter 6-digit code + new password ── */}
        {step === 'enter-code' && (
          <div style={CARD}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.6 }}>
              Enter the <strong style={{ color: 'var(--text-primary)' }}>6-digit code</strong> from your email, then choose a new password.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Code boxes */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', letterSpacing: '0.05em', textAlign: 'center' }}>
                  RESET CODE FROM EMAIL
                </label>
                <CodeInput value={code} onChange={setCode} />
                <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-dim)', marginTop: '8px' }}>
                  Expires in 10 minutes · Check spam folder too
                </p>
              </div>

              {/* New password */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  {t('auth.newPasswordLabel')}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.passwordHint')}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{ paddingRight: '44px' }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', fontSize: '16px', lineHeight: 1 }}>
                    {showPassword ? '🙈' : '👁'}
                  </button>
                </div>
                {newPassword && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                      {checks.map((ok, i) => (
                        <div key={i} style={{ height: '3px', flex: 1, borderRadius: '2px', background: ok ? '#34d399' : 'var(--border)', transition: 'background 0.2s' }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {checks.map((ok, i) => (
                        <span key={i} style={{ fontSize: '11px', color: ok ? '#34d399' : 'var(--text-dim)' }}>
                          {ok ? '✓' : '○'} {strengthLabels[i]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && <div style={ERR_BOX}>{error}</div>}

              <button
                style={{ ...BTN_PRIMARY, opacity: loading || !strongEnough || code.length < 6 ? 0.5 : 1 }}
                onClick={handleReset}
                disabled={loading || !strongEnough || code.length < 6}
              >
                {loading ? t('auth.resetting') : t('auth.setNewPassword')}
              </button>

              <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                Wrong email?{' '}
                <button onClick={() => setStep('request')} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '12px', padding: 0 }}>
                  Start over
                </button>
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 'done' && (
          <div style={{ ...CARD, textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '28px' }}>
              {t('auth.passwordUpdatedMsg')}
            </p>
            <Link href="/login">
              <button style={BTN_PRIMARY}>{t('auth.signInArrow')}</button>
            </Link>
          </div>
        )}

        {step !== 'done' && (
          <p style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            {t('auth.rememberedIt')}{' '}
            <Link href="/login" style={{ color: 'var(--gold)', textDecoration: 'none' }}>{t('auth.signInLink')}</Link>
          </p>
        )}
      </div>
    </div>
  )
}