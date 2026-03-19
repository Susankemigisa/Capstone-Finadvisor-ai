'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

export default function OAuthCallbackPage() {
  const router = useRouter()
  const { loginWithOAuthToken } = useAuthStore()
  const [status, setStatus] = useState('Completing sign in...')
  const [error, setError] = useState(null)

  useEffect(() => {
    const handle = async () => {
      try {
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const query = new URLSearchParams(window.location.search)

        const accessToken = params.get('access_token') || query.get('access_token')
        const errorMsg = params.get('error_description') || query.get('error_description') || params.get('error') || query.get('error')

        if (errorMsg) {
          // User cancelled — redirect back to login quietly
          if (errorMsg.includes('access_denied') || errorMsg.includes('cancelled') || errorMsg.includes('canceled')) {
            router.replace('/login')
            return
          }
          throw new Error(errorMsg)
        }
        if (!accessToken) throw new Error('No access token in callback URL')

        // Skip Supabase verification — send token directly to our backend
        // Our backend verifies it with Supabase internally
        setStatus('Setting up your account...')

        // Extract basic info from the JWT payload without verifying signature
        // (our backend does the real verification)
        let email = ''
        let fullName = ''
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]))
          email = payload.email || ''
          fullName = payload.user_metadata?.full_name || payload.user_metadata?.name || ''
        } catch {
          // payload parsing failed — backend will get it from Supabase
        }

        await loginWithOAuthToken(accessToken, email, fullName)

        setStatus('Welcome! Redirecting...')
        setTimeout(() => router.replace('/chat'), 400)

      } catch (e) {
        console.error('OAuth callback error:', e)
        setError(e.message)
      }
    }

    handle()
  }, [router, loginWithOAuthToken])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px', padding: '24px' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '24px' }}>◆ FINADVISOR AI</div>
        {!error ? (
          <>
            <div style={{ width: '40px', height: '40px', border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{status}</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '32px', marginBottom: '16px', color: 'var(--red)' }}>✕</div>
            <p style={{ color: 'var(--red)', fontSize: '13px', marginBottom: '20px' }}>{error}</p>
            <button onClick={() => router.replace('/login')}
              style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '10px 24px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  )
}