# Run this from: D:\financial_advisory_agent\finadvisor-ai\frontend
# Command: powershell -ExecutionPolicy Bypass -File setup_frontend.ps1

Write-Host "Creating folders..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "src\app\login" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\register" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\chat" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\portfolio" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\analytics" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\dashboard" | Out-Null
New-Item -ItemType Directory -Force -Path "src\components\chat" | Out-Null
New-Item -ItemType Directory -Force -Path "src\components\layout" | Out-Null
New-Item -ItemType Directory -Force -Path "src\stores" | Out-Null

Write-Host "Writing src\app\globals.css..." -ForegroundColor Yellow
Set-Content "src\app\globals.css" @'
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;
:root {
  --bg-base: #0a0c10;
  --bg-surface: #0f1117;
  --bg-elevated: #161b24;
  --bg-hover: #1c2333;
  --border: #1e2736;
  --border-bright: #2a3548;
  --gold: #c9a84c;
  --gold-light: #e8c97a;
  --gold-dim: #8a6f2e;
  --text-primary: #e8eaf0;
  --text-secondary: #8892a4;
  --text-dim: #4a5568;
  --green: #2ecc8a;
  --green-dim: #1a4a35;
  --red: #e05252;
  --red-dim: #4a1e1e;
  --blue: #4a9eff;
  --radius: 6px;
  --radius-lg: 10px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { color-scheme: dark; }
body { background-color: var(--bg-base); color: var(--text-primary); font-family: 'DM Sans', sans-serif; font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }
::selection { background: var(--gold-dim); color: var(--text-primary); }
.surface { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.surface-elevated { background: var(--bg-elevated); border: 1px solid var(--border-bright); border-radius: var(--radius-lg); }
.ticker { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; letter-spacing: 0.05em; background: var(--bg-elevated); border: 1px solid var(--border-bright); border-radius: 4px; padding: 2px 6px; color: var(--gold-light); }
.positive { color: var(--green); }
.negative { color: var(--red); }
@keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
.shimmer { background: linear-gradient(90deg, var(--bg-elevated) 0%, var(--bg-hover) 50%, var(--bg-elevated) 100%); background-size: 200% auto; animation: shimmer 1.5s ease infinite; border-radius: 4px; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.fade-in { animation: fadeIn 0.25s ease forwards; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.typing-cursor::after { content: '▊'; font-size: 0.8em; margin-left: 2px; animation: blink 1s ease infinite; color: var(--gold); }
.prose-chat { line-height: 1.75; }
.prose-chat p { margin-bottom: 0.75rem; }
.prose-chat p:last-child { margin-bottom: 0; }
.prose-chat strong { color: var(--text-primary); font-weight: 600; }
.prose-chat code { font-family: 'DM Mono', monospace; font-size: 0.85em; background: var(--bg-elevated); border: 1px solid var(--border-bright); border-radius: 3px; padding: 1px 5px; color: var(--gold-light); }
.prose-chat pre { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; overflow-x: auto; margin: 0.75rem 0; }
.prose-chat pre code { background: none; border: none; padding: 0; font-size: 0.85em; color: var(--text-primary); }
.prose-chat ul, .prose-chat ol { padding-left: 1.25rem; margin-bottom: 0.75rem; }
.prose-chat li { margin-bottom: 0.25rem; }
.prose-chat h1, .prose-chat h2, .prose-chat h3 { font-weight: 600; color: var(--text-primary); margin: 1rem 0 0.5rem; }
.prose-chat h1 { font-size: 1.2rem; }
.prose-chat h2 { font-size: 1.05rem; }
.prose-chat h3 { font-size: 0.95rem; color: var(--gold-light); }
.prose-chat table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-family: 'DM Mono', monospace; font-size: 0.85em; }
.prose-chat th { border-bottom: 1px solid var(--border-bright); padding: 6px 12px; text-align: left; color: var(--text-secondary); font-weight: 500; }
.prose-chat td { border-bottom: 1px solid var(--border); padding: 6px 12px; }
.prose-chat a { color: var(--blue); }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: var(--radius); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; border: none; text-decoration: none; font-family: 'DM Sans', sans-serif; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--gold); color: #0a0c10; font-weight: 600; }
.btn-primary:hover:not(:disabled) { background: var(--gold-light); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(201,168,76,0.25); }
.btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }
.btn-ghost:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
.input { width: 100%; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; color: var(--text-primary); font-size: 14px; font-family: 'DM Sans', sans-serif; transition: border-color 0.15s ease; outline: none; }
.input::placeholder { color: var(--text-dim); }
.input:focus { border-color: var(--gold-dim); box-shadow: 0 0 0 3px rgba(201,168,76,0.08); }
'@

Write-Host "Writing src\app\layout.js..." -ForegroundColor Yellow
Set-Content "src\app\layout.js" @'
import './globals.css'
export const metadata = { title: 'FinAdvisor AI', description: 'AI-powered financial advisory' }
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
'@

Write-Host "Writing src\app\page.js..." -ForegroundColor Yellow
Set-Content "src\app\page.js" @'
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
      <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '13px', letterSpacing: '0.1em' }}>◆ FINADVISOR AI</div>
    </div>
  )
}
'@

Write-Host "Writing src\app\login\page.js..." -ForegroundColor Yellow
Set-Content "src\app\login\page.js" @'
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await login(form.email, form.password); router.push('/chat') }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '60px 60px', opacity: 0.3, pointerEvents: 'none' }} />
      <div style={{ width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1 }} className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '12px' }}>◆ FINADVISOR AI</div>
          <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontWeight: 400, color: 'var(--text-primary)', fontStyle: 'italic' }}>Welcome back</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>Sign in to your financial command center</p>
        </div>
        <div className="surface" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>EMAIL ADDRESS</label>
              <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>PASSWORD</label>
              <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          No account? <Link href="/register" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Create one</Link>
        </p>
      </div>
    </div>
  )
}
'@

Write-Host "Writing src\app\register\page.js..." -ForegroundColor Yellow
Set-Content "src\app\register\page.js" @'
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuthStore()
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await register(form.email, form.password, form.full_name); router.push('/chat') }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  const checks = [form.password.length >= 8, /[A-Z]/.test(form.password), /[a-z]/.test(form.password), /\d/.test(form.password)]
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '60px 60px', opacity: 0.3, pointerEvents: 'none' }} />
      <div style={{ width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1 }} className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px', letterSpacing: '0.15em', marginBottom: '12px' }}>◆ FINADVISOR AI</div>
          <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '28px', fontWeight: 400, color: 'var(--text-primary)', fontStyle: 'italic' }}>Start your journey</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>Your AI financial advisor, always on</p>
        </div>
        <div className="surface" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>FULL NAME</label>
              <input className="input" type="text" placeholder="Susan Kemigisa" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoFocus />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>EMAIL ADDRESS</label>
              <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>PASSWORD</label>
              <input className="input" type="password" placeholder="8+ chars, uppercase, number" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              {form.password && <div style={{ marginTop: '6px', display: 'flex', gap: '4px' }}>{checks.map((ok, i) => <div key={i} style={{ height: '3px', flex: 1, borderRadius: '2px', background: ok ? 'var(--green)' : 'var(--border-bright)', transition: 'background 0.2s' }} />)}</div>}
            </div>
            {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading || !checks.every(Boolean)} style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
              {loading ? 'Creating account...' : 'Create Account →'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Already have an account? <Link href="/login" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
'@

Write-Host "Writing src\stores\authStore.js..." -ForegroundColor Yellow
Set-Content "src\stores\authStore.js" @'
import { create } from 'zustand'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
async function req(path, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } })
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail || 'Request failed') }
  return res.json()
}
export const useAuthStore = create((set) => ({
  user: null, loading: true,
  init: async () => {
    const token = localStorage.getItem('access_token')
    if (!token) { set({ loading: false }); return }
    try { const user = await req('/auth/me'); set({ user, loading: false }) }
    catch { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); set({ user: null, loading: false }) }
  },
  login: async (email, password) => {
    const data = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ user: data.user }); return data
  },
  register: async (email, password, full_name) => {
    const data = await req('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name }) })
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ user: data.user }); return data
  },
  logout: () => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); set({ user: null }) },
}))
'@

Write-Host "Writing src\stores\chatStore.js..." -ForegroundColor Yellow
Set-Content "src\stores\chatStore.js" @'
import { create } from 'zustand'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('access_token') : null }
async function req(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } })
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail || 'Failed') }
  return res.json()
}
export const useChatStore = create((set, get) => ({
  sessions: [], currentSessionId: null, messages: [], loading: false, streaming: false, streamingContent: '', error: null,
  loadSessions: async () => { try { const d = await req('/chat/sessions'); set({ sessions: d.sessions || [] }) } catch {} },
  selectSession: async (id) => {
    set({ currentSessionId: id, messages: [], loading: true })
    try { const d = await req(`/chat/sessions/${id}/messages`); set({ messages: d.messages || [], loading: false }) }
    catch { set({ loading: false }) }
  },
  newSession: () => set({ currentSessionId: null, messages: [] }),
  deleteSession: async (id) => {
    await req(`/chat/sessions/${id}`, { method: 'DELETE' })
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id), ...(s.currentSessionId === id ? { currentSessionId: null, messages: [] } : {}) }))
  },
  sendMessage: async (content) => {
    const { currentSessionId } = get()
    const userMsg = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() }
    set((s) => ({ messages: [...s.messages, userMsg], streaming: true, streamingContent: '', error: null }))
    const token = getToken()
    let fullContent = ''
    try {
      const res = await fetch(`${API}/chat/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ message: content, session_id: currentSessionId, stream: true }) })
      if (!res.ok) { set({ streaming: false, error: 'Request failed' }); return }
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'token') { fullContent += event.content; set({ streamingContent: fullContent }) }
              else if (event.type === 'done') {
                if (event.session_id && !currentSessionId) { set({ currentSessionId: event.session_id }); get().loadSessions() }
                set((s) => ({ messages: [...s.messages, { id: Date.now() + 1, role: 'assistant', content: fullContent, created_at: new Date().toISOString() }], streaming: false, streamingContent: '' }))
              } else if (event.type === 'error') { set({ streaming: false, streamingContent: '', error: event.message }) }
            } catch {}
          }
        }
      }
    } catch (e) { set({ streaming: false, streamingContent: '', error: e.message }) }
  },
}))
'@

Write-Host "Writing src\components\layout\Sidebar.js..." -ForegroundColor Yellow
Set-Content "src\components\layout\Sidebar.js" @'
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
const navItems = [{ href: '/chat', icon: '◈', label: 'Chat' }, { href: '/portfolio', icon: '◎', label: 'Portfolio' }, { href: '/analytics', icon: '◉', label: 'Analytics' }]
export default function Sidebar() {
  const pathname = usePathname(); const router = useRouter()
  const { user, logout } = useAuthStore()
  const { sessions, currentSessionId, selectSession, newSession, loadSessions } = useChatStore()
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { loadSessions() }, [])
  return (
    <aside style={{ width: collapsed ? '56px' : '240px', minHeight: '100vh', background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', minHeight: '56px' }}>
        {!collapsed && <div style={{ flex: 1 }}><div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '10px', letterSpacing: '0.12em' }}>◆ FINADVISOR</div></div>}
        <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px', fontSize: '14px', flexShrink: 0 }}>{collapsed ? '›' : '‹'}</button>
      </div>
      <nav style={{ padding: '8px' }}>
        {navItems.map((item) => { const active = pathname === item.href; return (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: 'var(--radius)', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', background: active ? 'var(--bg-elevated)' : 'transparent', borderLeft: active ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: '2px', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '15px', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ fontSize: '13px', fontWeight: 500 }}>{item.label}</span>}
            </div>
          </Link>
        )})}
      </nav>
      {!collapsed && pathname === '/chat' && (
        <div style={{ padding: '0 8px 8px' }}>
          <button onClick={() => { newSession(); router.push('/chat') }} style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', padding: '7px', fontFamily: 'DM Sans, sans-serif' }}>+ New Chat</button>
        </div>
      )}
      {!collapsed && sessions.length > 0 && (
        <div style={{ flex: 1, overflow: 'hidden auto', padding: '0 8px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em', padding: '6px 6px 4px', textTransform: 'uppercase' }}>Recent</div>
          {sessions.slice(0, 20).map((s) => (
            <div key={s.id} onClick={() => { selectSession(s.id); router.push('/chat') }} style={{ padding: '6px 8px', borderRadius: 'var(--radius)', cursor: 'pointer', color: currentSessionId === s.id ? 'var(--text-primary)' : 'var(--text-secondary)', background: currentSessionId === s.id ? 'var(--bg-elevated)' : 'transparent', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '1px' }}>· {s.title || 'New Chat'}</div>
          ))}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--gold-light)', fontWeight: 600, flexShrink: 0 }}>{user?.full_name?.charAt(0) || '?'}</div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name}</div>
              <div style={{ fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase' }}>{user?.tier || 'free'}</div>
            </div>
            <button onClick={() => { logout(); router.push('/login') }} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px', padding: '4px' }}>⎋</button>
          </div>
        ) : (
          <button onClick={() => { logout(); router.push('/login') }} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '6px', fontSize: '14px' }}>⎋</button>
        )}
      </div>
    </aside>
  )
}
'@

Write-Host "Writing src\components\chat\MessageBubble.js..." -ForegroundColor Yellow
Set-Content "src\components\chat\MessageBubble.js" @'
'use client'
import { useMemo } from 'react'
function renderMarkdown(text) {
  if (!text) return ''
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[•\-] (.+)$/gm, '<li>$1</li>').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')
  return '<p>' + html + '</p>'
}
export default function MessageBubble({ message, isStreaming = false }) {
  const isUser = message.role === 'user'
  const html = useMemo(() => renderMarkdown(message.content || ''), [message.content])
  return (
    <div className="fade-in" style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '16px', paddingLeft: isUser ? '48px' : '0', paddingRight: isUser ? '0' : '48px' }}>
      {!isUser && <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold-dim), var(--bg-elevated))', border: '1px solid var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--gold)', flexShrink: 0, marginRight: '10px', marginTop: '2px' }}>◆</div>}
      <div style={{ maxWidth: '100%', flex: 1 }}>
        <div style={{ background: isUser ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${isUser ? 'var(--border-bright)' : 'var(--border)'}`, borderRadius: isUser ? '10px 10px 2px 10px' : '2px 10px 10px 10px', padding: '12px 16px' }}>
          {isUser ? <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message.content}</p> : <div className={`prose-chat${isStreaming ? ' typing-cursor' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
        {!isStreaming && message.created_at && <div style={{ marginTop: '4px' }}><span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>}
      </div>
    </div>
  )
}
'@

Write-Host "Writing src\components\chat\ChatInput.js..." -ForegroundColor Yellow
Set-Content "src\components\chat\ChatInput.js" @'
'use client'
import { useState, useRef, useEffect } from 'react'
export default function ChatInput({ onSend, disabled, placeholder = 'Ask about stocks, crypto, budgeting...' }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)
  useEffect(() => { if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = Math.min(ref.current.scrollHeight, 160) + 'px' } }, [value])
  const handleSend = () => { const t = value.trim(); if (!t || disabled) return; onSend(t); setValue('') }
  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: '10px', padding: '8px 8px 8px 14px' }}>
        <textarea ref={ref} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} placeholder={placeholder} rows={1} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6, maxHeight: '160px', overflow: 'auto' }} />
        <button onClick={handleSend} disabled={disabled || !value.trim()} style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: value.trim() && !disabled ? 'var(--gold)' : 'var(--border)', color: value.trim() && !disabled ? '#0a0c10' : 'var(--text-dim)', cursor: value.trim() && !disabled ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0, fontWeight: 700 }}>↑</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>⏎ send · ⇧⏎ newline</span>
        {disabled && <span style={{ fontSize: '10px', color: 'var(--gold)', fontFamily: 'DM Mono, monospace' }}>thinking...</span>}
      </div>
    </div>
  )
}
'@

Write-Host "Writing src\app\chat\page.js..." -ForegroundColor Yellow
Set-Content "src\app\chat\page.js" @'
'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import Sidebar from '@/components/layout/Sidebar'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatInput from '@/components/chat/ChatInput'
const PROMPTS = ["What is Apple's current stock price?","How is Bitcoin performing today?","Give me a market overview","How does compound interest work?","Help me create a budget plan","What is a good emergency fund size?"]
export default function ChatPage() {
  const router = useRouter()
  const { user, loading, init } = useAuthStore()
  const { messages, streaming, streamingContent, loadSessions, sendMessage } = useChatStore()
  const bottomRef = useRef(null)
  useEffect(() => { init().then(() => { const { user } = useAuthStore.getState(); if (!user) router.replace('/login'); else loadSessions() }) }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingContent])
  if (loading || !user) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}><div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>Loading...</div></div>
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-surface)' }}>
          <span style={{ color: 'var(--gold)' }}>◈</span>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Chat</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {messages.length === 0 && !streaming && (
            <div style={{ maxWidth: '560px', margin: '40px auto', textAlign: 'center' }} className="fade-in">
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: '26px', fontStyle: 'italic', marginBottom: '8px' }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.full_name?.split(' ')[0] || 'there'}</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '32px' }}>Your AI financial advisor is ready.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'left' }}>
                {PROMPTS.map((p) => <button key={p} onClick={() => sendMessage(p)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>{p}</button>)}
              </div>
            </div>
          )}
          {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
          {streaming && streamingContent && <MessageBubble message={{ role: 'assistant', content: streamingContent }} isStreaming={true} />}
          {streaming && !streamingContent && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}><div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' }}>◆</div><div style={{ display: 'flex', gap: '4px' }}>{[0,1,2].map((i) => <div key={i} className="shimmer" style={{ width: '6px', height: '6px', borderRadius: '50%' }} />)}</div></div>}
          <div ref={bottomRef} />
        </div>
        <ChatInput onSend={sendMessage} disabled={streaming} />
      </div>
    </div>
  )
}
'@

Write-Host "Writing src\app\portfolio\page.js..." -ForegroundColor Yellow
Set-Content "src\app\portfolio\page.js" @'
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import Sidebar from '@/components/layout/Sidebar'
export default function PortfolioPage() {
  const router = useRouter()
  const { user, loading, init } = useAuthStore()
  const { loadSessions, sendMessage } = useChatStore()
  useEffect(() => { init().then(() => { const { user } = useAuthStore.getState(); if (!user) router.replace('/login'); else loadSessions() }) }, [])
  if (loading || !user) return null
  const actions = [{ label: 'Show my portfolio', icon: '◎' },{ label: 'Calculate my portfolio allocation', icon: '◉' },{ label: 'What is my total P&L?', icon: '▲' },{ label: 'Add AAPL 10 shares at $274', icon: '+' }]
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400, marginBottom: '4px' }}>Portfolio</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>Track your investments and analyze performance</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {actions.map((a) => <button key={a.label} onClick={() => { sendMessage(a.label); router.push('/chat') }} style={{ padding: '16px', textAlign: 'left', cursor: 'pointer', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', transition: 'all 0.15s' }}><div style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--gold)' }}>{a.icon}</div><div style={{ fontSize: '13px' }}>{a.label}</div></button>)}
        </div>
      </div>
    </div>
  )
}
'@

Write-Host "Writing src\app\analytics\page.js..." -ForegroundColor Yellow
Set-Content "src\app\analytics\page.js" @'
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import Sidebar from '@/components/layout/Sidebar'
export default function AnalyticsPage() {
  const router = useRouter()
  const { user, loading, init } = useAuthStore()
  const { loadSessions, sendMessage } = useChatStore()
  useEffect(() => { init().then(() => { const { user } = useAuthStore.getState(); if (!user) router.replace('/login'); else loadSessions() }) }, [])
  if (loading || !user) return null
  const analyses = [
    { title: 'Market Overview', prompt: 'Give me a full market overview right now', icon: '◉', desc: 'S&P 500, NASDAQ, DOW, VIX, Gold, Oil' },
    { title: 'Retirement Projection', prompt: 'I am 28, have $15,000 saved, contribute $500/month. When can I retire with $1M?', icon: '◎', desc: 'Project your retirement savings' },
    { title: 'Debt Payoff Plan', prompt: 'I have $8,000 credit card debt at 20% interest paying $300/month. How long to pay off?', icon: '▼', desc: 'Calculate your payoff timeline' },
    { title: 'Emergency Fund', prompt: 'My monthly expenses are $2,500. How much should I have in an emergency fund?', icon: '◈', desc: 'Calculate your safety net' },
    { title: 'Budget Analysis', prompt: 'Show me my budget summary for this month', icon: '▤', desc: 'Income vs expenses breakdown' },
    { title: 'Capital Gains Tax', prompt: 'I bought 100 shares of AAPL at $150 and sold at $274 after 14 months. What is my capital gains tax?', icon: '$', desc: 'Long-term vs short-term rates' },
  ]
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400, marginBottom: '4px' }}>Analytics</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>AI-powered financial analysis at your fingertips</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {analyses.map((item) => <button key={item.title} onClick={() => { sendMessage(item.prompt); router.push('/chat') }} style={{ padding: '20px', textAlign: 'left', cursor: 'pointer', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', transition: 'all 0.15s' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}><span style={{ fontSize: '22px', color: 'var(--gold)' }}>{item.icon}</span><span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>RUN →</span></div><div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>{item.title}</div><div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.desc}</div></button>)}
        </div>
      </div>
    </div>
  )
}
'@

Write-Host "Writing tailwind.config.mjs..." -ForegroundColor Yellow
Set-Content "tailwind.config.mjs" @'
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },
  plugins: [],
}
'@

Write-Host "Installing zustand..." -ForegroundColor Cyan
npm install zustand

Write-Host ""
Write-Host "Done! Now run: npm run dev" -ForegroundColor Green
