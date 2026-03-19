'use client'
// Plugins page removed from UI — all tools are enabled by default.
// This redirect handles any bookmarked /plugins URLs gracefully.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PluginsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/settings') }, [])
  return null
}
