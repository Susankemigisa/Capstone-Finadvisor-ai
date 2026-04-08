'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

export default function BillingSuccess() {
  const router = useRouter()
  const { init } = useAuthStore()
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    init().then(() => {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            router.replace('/chat')
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
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
        <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '24px' }}>
          Redirecting in {countdown}…
        </p>
        <button
          onClick={() => router.replace('/chat')}
          style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '10px 28px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}>
          Go to Chat →
        </button>
      </div>
    </div>
  )
}