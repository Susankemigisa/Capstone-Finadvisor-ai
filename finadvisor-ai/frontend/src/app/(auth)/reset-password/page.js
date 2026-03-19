'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useLangStore, useTranslate } from '@/stores/langStore'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function ResetForm() {
  const t = useTranslate()
  const searchParams = useSearchParams()
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => { const tok = searchParams.get('token'); if (tok) setToken(tok) }, [searchParams])

  const checks = [newPassword.length >= 8, /[A-Z]/.test(newPassword), /[a-z]/.test(newPassword), /\d/.test(newPassword)]
  const strongEnough = checks.every(Boolean)
  const strengthLabels = [t('auth.passwordStrength8'), t('auth.passwordStrengthUpper'), t('auth.passwordStrengthLower'), t('auth.passwordStrengthNum')]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!strongEnough) { setError(t('auth.passwordRequirements')); return }
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API}/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, new_password: newPassword }) })
      const data = await r.json()
      if (data.success) setDone(true)
      else setError(data.detail || t('auth.resetFailed'))
    } catch { setError(t('auth.somethingWrong')) } finally { setLoading(false) }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>{t('auth.passwordUpdatedMsg')}</p>
        <Link href="/login"><button className="btn btn-primary" style={{ padding: '11px 32px' }}>{t('auth.signInArrow')}</button></Link>
      </div>
    )
  }

  return (
    <div className="surface" style={{ padding: '32px' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>{t('auth.setNewPasswordSubtitle')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {!token && (
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>{t('auth.resetToken')}</label>
            <input className="input" type="text" placeholder={t('auth.pasteToken')} value={token} onChange={e => setToken(e.target.value)} required style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px' }} />
          </div>
        )}
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>{t('auth.newPasswordLabel')}</label>
          <div style={{ position: 'relative' }}>
            <input className="input" type={showPassword ? 'text' : 'password'} placeholder={t('auth.passwordHint')} value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ paddingRight: '44px' }} autoFocus />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', fontSize: '16px', lineHeight: 1 }}>
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
          {newPassword && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                {checks.map((ok, i) => <div key={i} style={{ height: '3px', flex: 1, borderRadius: '2px', background: ok ? 'var(--green, #34d399)' : 'var(--border-bright)', transition: 'background 0.2s' }} />)}
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {checks.map((ok, i) => <span key={i} style={{ fontSize: '11px', color: ok ? 'var(--green, #34d399)' : 'var(--text-dim)' }}>{ok ? '✓' : '○'} {strengthLabels[i]}</span>)}
              </div>
            </div>
          )}
        </div>
        {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !strongEnough || !token} style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
          {loading ? t('auth.resetting') : t('auth.setNewPassword')}
        </button>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  const { init: initLang } = useLangStore()
  const t = useTranslate()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '60px 60px', opacity: 0.3, pointerEvents: 'none' }} />
      <div style={{ width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1 }} className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '12px' }}>◆ FINADVISOR AI</div>
          <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontWeight: 400, color: 'var(--text-primary)', fontStyle: 'italic' }}>{t('auth.setNewPasswordTitle')}</h1>
        </div>
        <Suspense fallback={<div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{t('common.loading')}</div>}>
          <ResetForm />
        </Suspense>
        <p style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <Link href="/login" style={{ color: 'var(--gold)', textDecoration: 'none' }}>{t('auth.backToSignIn')}</Link>
        </p>
      </div>
    </div>
  )
}
