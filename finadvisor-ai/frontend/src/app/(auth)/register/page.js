'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { useTranslate } from '@/stores/langStore'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"/>
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuthStore()
  const t = useTranslate()
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const data = await register(form.email, form.password, form.full_name)
      const user = data?.user || useAuthStore.getState().user
      if (user?.onboarding_complete) {
        router.push('/chat')
      } else {
        router.push('/onboarding')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider) => {
    setError(''); setOauthLoading(provider)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: provider === 'google' ? { prompt: 'select_account consent', access_type: 'offline' } : {}
        }
      })
      if (error) throw error
    } catch (err) {
      setError(err.message)
      setOauthLoading(null)
    }
  }

  const checks = [
    form.password.length >= 8,
    /[A-Z]/.test(form.password),
    /[a-z]/.test(form.password),
    /\d/.test(form.password)
  ]
  const strength = checks.every(Boolean)
  const strengthLabels = [t('auth.passwordStrength8'), t('auth.passwordStrengthUpper'), t('auth.passwordStrengthLower'), t('auth.passwordStrengthNum')]

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      overflow: 'hidden',
    }}>
      {/* Full-page background image */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'url(/auth-hero.png?v=2)',
        backgroundSize: 'cover',
        backgroundPosition: '50% 20%',
        zIndex: 0,
      }} />

      {/* Gradient fade: clear on left, dark on right */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(2,21,38,0.1) 0%, rgba(2,21,38,0.55) 45%, rgba(2,21,38,0.95) 70%, #021526 100%)',
        zIndex: 1,
      }} />

      {/* Top left logo */}
      <div style={{ position: 'absolute', top: '32px', left: '48px', zIndex: 2 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: '#FFFCFC', fontSize: '14px', letterSpacing: '0.15em', fontWeight: 600 }}>
          ◆ FINADVISOR AI
        </div>
      </div>

      {/* Bottom left tag */}
      <div style={{ position: 'absolute', bottom: '32px', left: '48px', zIndex: 2 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: '#FFFCFC', fontSize: '11px', letterSpacing: '0.1em', opacity: 0.6 }}>
          Free to start · No credit card required
        </div>
      </div>

      {/* Form floats on the right */}
      <div style={{
        position: 'relative', zIndex: 2,
        width: '100%', maxWidth: '420px',
        padding: '48px 48px 48px 0',
        marginRight: '80px',
        overflowY: 'auto',
        maxHeight: '100vh',
      }} className="fade-in">

        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '32px', fontWeight: 400, fontStyle: 'italic', color: '#FFFCFC', marginBottom: '8px' }}>
            {t('auth.createAccount')}
          </h1>
          <p style={{ color: '#c8b0be', fontSize: '13px' }}>{t('auth.startJourney')}</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(224,82,82,0.15)', border: '1px solid #e05252', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#e05252', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {/* OAuth */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          <button onClick={() => handleOAuth('google')} disabled={!!oauthLoading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '12px', background: 'rgba(3,62,91,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: oauthLoading ? 'not-allowed' : 'pointer', fontSize: '13px', color: '#FFFCFC', transition: 'all 0.15s', backdropFilter: 'blur(8px)', opacity: oauthLoading === 'github' ? 0.5 : 1 }}
            onMouseEnter={e => { if (!oauthLoading) e.currentTarget.style.background = 'rgba(99,33,72,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(3,62,91,0.7)' }}>
            {oauthLoading === 'google' ? <div style={{ width: '18px', height: '18px', border: '2px solid #632148', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <GoogleIcon />}
            {t('auth.continueGoogle')}
          </button>
          <button onClick={() => handleOAuth('github')} disabled={!!oauthLoading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '12px', background: 'rgba(3,62,91,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: oauthLoading ? 'not-allowed' : 'pointer', fontSize: '13px', color: '#FFFCFC', transition: 'all 0.15s', backdropFilter: 'blur(8px)', opacity: oauthLoading === 'google' ? 0.5 : 1 }}
            onMouseEnter={e => { if (!oauthLoading) e.currentTarget.style.background = 'rgba(99,33,72,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(3,62,91,0.7)' }}>
            {oauthLoading === 'github' ? <div style={{ width: '18px', height: '18px', border: '2px solid #632148', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <GitHubIcon />}
            {t('auth.continueGithub')}
          </button>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: '11px', color: '#7ab0c0', letterSpacing: '0.05em' }}>{t('auth.or')}</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#FFFCFC', marginBottom: '6px', letterSpacing: '0.05em' }}>{t('auth.fullNameLabel')}</label>
            <input className="input" type="text" placeholder="Susan Kemigisa" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#FFFCFC', marginBottom: '6px', letterSpacing: '0.05em' }}>{t('auth.emailAddress')}</label>
            <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#FFFCFC', marginBottom: '6px', letterSpacing: '0.05em' }}>{t('auth.passwordLabel')}</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPassword ? 'text' : 'password'} placeholder={t('auth.passwordHint')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required style={{ paddingRight: '44px' }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#FFFCFC', padding: '4px', fontSize: '16px', lineHeight: 1 }}>
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            {form.password && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  {checks.map((ok, i) => <div key={i} style={{ height: '3px', flex: 1, borderRadius: '2px', background: ok ? '#34d399' : 'rgba(255,255,255,0.15)', transition: 'background 0.2s' }} />)}
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {checks.map((ok, i) => (
                    <span key={i} style={{ fontSize: '11px', color: ok ? '#34d399' : '#7ab0c0' }}>
                      {ok ? '✓' : '○'} {strengthLabels[i]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={handleSubmit} disabled={loading || !strength}
            style={{ background: '#632148', color: '#FFFCFC', border: 'none', borderRadius: '8px', padding: '13px', fontSize: '14px', fontWeight: 700, cursor: (loading || !strength) ? 'not-allowed' : 'pointer', opacity: (loading || !strength) ? 0.6 : 1, transition: 'all 0.15s', marginTop: '4px', boxShadow: '0 4px 20px rgba(99,33,72,0.4)' }}
            onMouseEnter={e => { if (!loading && strength) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(99,33,72,0.55)' } }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,33,72,0.4)' }}>
            {loading ? t('auth.creatingAccount') : t('auth.createAccountArrow')}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: '#c8b0be' }}>
          {t('auth.alreadyHave')}{' '}
          <Link href="/login" style={{ color: '#FFFCFC', textDecoration: 'none', fontWeight: 600 }}>{t('auth.signInLink')}</Link>
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}