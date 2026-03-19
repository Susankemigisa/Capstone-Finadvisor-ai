'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

export default function BillingSuccess() {
  const router = useRouter()
  const { init } = useAuthStore()

  useEffect(() => {
    // Re-fetch user to get updated tier
    init().then(() => {
      setTimeout(() => router.replace('/chat'), 3000)
    })
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px', padding: '24px' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '32px' }}>◆ FINADVISOR AI</div>
        <div style={{ fontSize: '56px', marginBottom: '20px' }}>◆</div>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontStyle: 'italic', fontWeight: 400, marginBottom: '12px', color: 'var(--gold)' }}>
          Welcome to Pro!
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>Your account has been upgraded.</p>
        <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Redirecting you to chat in a moment...</p>
      </div>
    </div>
  )
}