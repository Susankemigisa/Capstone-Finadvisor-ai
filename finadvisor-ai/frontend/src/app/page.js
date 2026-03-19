'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

export default function Home() {
  const router = useRouter()
  const { init } = useAuthStore()

  useEffect(() => {
    init().then(() => {
      const { user } = useAuthStore.getState()
      router.replace(user ? '/chat' : '/login')
    })
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '13px', letterSpacing: '0.1em' }}>
        ◆ FINADVISOR AI
      </div>
    </div>
  )
}