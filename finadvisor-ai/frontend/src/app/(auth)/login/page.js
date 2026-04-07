'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { useLangStore, useTranslate } from '@/stores/langStore'

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

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuthStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      setOauthLoading(null)
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [])
  

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(form.email, form.password)
      router.push('/chat')
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '60px 60px', opacity: 0.3, pointerEvents: 'none' }} />
      <div style={{ width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1 }} className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '12px' }}>◆ FINADVISOR AI</div>
          <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontWeight: 400, color: 'var(--text-primary)', fontStyle: 'italic' }}>{t('auth.welcomeBack')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>{t('auth.signInSubtitle')}</p>
        </div>
        <div className="surface" style={{ padding: '32px' }}>
          {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: 'var(--red)', marginBottom: '20px' }}>{error}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            <button onClick={() => handleOAuth('google')} disabled={!!oauthLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '11px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', cursor: oauthLoading ? 'not-allowed' : 'pointer', fontSize: '13px', color: 'var(--text-primary)', transition: 'all 0.15s', opacity: oauthLoading === 'github' ? 0.5 : 1 }}
              onMouseEnter={e => { if (!oauthLoading) e.currentTarget.style.borderColor = 'var(--gold-dim)' }}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              {oauthLoading === 'google' ? <div style={{ width: '18px', height: '18px', border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <GoogleIcon />}
              {t('auth.continueGoogle')}
            </button>
            <button onClick={() => handleOAuth('github')} disabled={!!oauthLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '11px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', cursor: oauthLoading ? 'not-allowed' : 'pointer', fontSize: '13px', color: 'var(--text-primary)', transition: 'all 0.15s', opacity: oauthLoading === 'google' ? 0.5 : 1 }}
              onMouseEnter={e => { if (!oauthLoading) e.currentTarget.style.borderColor = 'var(--gold-dim)' }}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              {oauthLoading === 'github' ? <div style={{ width: '18px', height: '18px', border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <GitHubIcon />}
              {t('auth.continueGithub')}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>{t('auth.or')}</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>{t('auth.emailAddress')}</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required autoComplete="email" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{t('auth.passwordLabel')}</label>
                <Link href="/forgot-password" style={{ fontSize: '12px', color: 'var(--gold)', textDecoration: 'none', opacity: 0.85 }}>{t('auth.forgotPassword')}</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" required autoComplete="current-password" style={{ paddingRight: '44px' }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', fontSize: '16px', lineHeight: 1 }}>
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <button onClick={handleSubmit} disabled={loading} style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s', marginTop: '4px' }}>
              {loading ? t('auth.signingIn') : t('auth.signInArrow')}
            </button>
          </div>
          <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {t('auth.noAccount')}{' '}<Link href="/register" style={{ color: 'var(--gold)', textDecoration: 'none' }}>{t('auth.createOne')}</Link>
          </p>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
