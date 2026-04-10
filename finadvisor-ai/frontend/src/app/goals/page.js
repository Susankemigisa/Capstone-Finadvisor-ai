'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path, opts = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers }
  }).then(r => r.json())
}

const GOAL_ICONS = {
  savings: '🏦', investment: '📈', debt_payoff: '💳',
  emergency_fund: '🛡️', retirement: '🌴', custom: '⭐'
}
const GOAL_COLORS = {
  savings: '#4a9eff', investment: '#c9a84c', debt_payoff: '#f87171',
  emergency_fund: '#34d399', retirement: '#a78bfa', custom: '#fb923c'
}

// Simple confetti burst using canvas
function Confetti({ active }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (!active || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      r: Math.random() * 8 + 4,
      d: Math.random() * 80 + 20,
      color: ['#c9a84c','#34d399','#4a9eff','#f87171','#a78bfa','#fb923c'][Math.floor(Math.random() * 6)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: 0,
      tiltSpeed: Math.random() * 0.1 + 0.05,
    }))
    let angle = 0, frame
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      angle += 0.01
      pieces.forEach(p => {
        p.tiltAngle += p.tiltSpeed
        p.y += (Math.cos(angle + p.d) + 2) * 1.5
        p.x += Math.sin(angle) * 1.5
        p.tilt = Math.sin(p.tiltAngle) * 12
        ctx.beginPath()
        ctx.lineWidth = p.r / 2
        ctx.strokeStyle = p.color
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y)
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4)
        ctx.stroke()
      })
      if (pieces.some(p => p.y < canvas.height + 20)) frame = requestAnimationFrame(draw)
    }
    draw()
    const timeout = setTimeout(() => cancelAnimationFrame(frame), 4000)
    return () => { cancelAnimationFrame(frame); clearTimeout(timeout) }
  }, [active])

  if (!active) return null
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }} />
}

function GoalCard({ goal, onUpdate, onDelete }) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(goal.current_amount || 0)
  const [saving, setSaving] = useState(false)
  const pct = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0
  const reached = pct >= 100
  const color = GOAL_COLORS[goal.goal_type] || '#c9a84c'
  const icon = GOAL_ICONS[goal.goal_type] || '⭐'
  const daysLeft = goal.target_date ? Math.ceil((new Date(goal.target_date) - new Date()) / 86400000) : null

  const handleSave = async () => {
    setSaving(true)
    const wasReached = pct >= 100
    const willReach = goal.target_amount > 0 && parseFloat(amount) >= goal.target_amount
    await onUpdate(goal.id, parseFloat(amount), willReach && !wasReached)
    setEditing(false); setSaving(false)
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: `2px solid ${reached ? '#34d399' : 'var(--border)'}`, borderRadius: '14px', padding: '20px', position: 'relative', overflow: 'hidden', transition: 'border-color 0.3s' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: color }} />

      {reached && (
        <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#34d399', color: '#000', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>
          🎉 REACHED!
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '26px' }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{goal.goal_name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize', marginTop: '2px' }}>{(goal.goal_type || '').replace('_', ' ')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setEditing(!editing)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
            Update
          </button>
          <button onClick={() => onDelete(goal.id)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 9px', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}>
            ✕
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)', fontWeight: 700 }}>
            {(goal.current_amount || 0).toLocaleString()}
          </span> / {goal.target_amount.toLocaleString()}
        </span>
        <span style={{ fontFamily: 'DM Mono, monospace', color, fontWeight: 700 }}>{pct.toFixed(1)}%</span>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-base)', borderRadius: '4px', height: '7px', overflow: 'hidden', marginBottom: '12px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: reached ? '#34d399' : color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
      </div>

      <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {daysLeft !== null && (
          <span>{daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? '📅 Due today' : `${Math.abs(daysLeft)} days overdue`}</span>
        )}
        {goal.notes && <span style={{ fontStyle: 'italic', color: 'var(--text-dim)' }}>{goal.notes}</span>}
      </div>

      {editing && (
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Current amount</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '7px 10px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'DM Mono, monospace', outline: 'none' }} />
          <button onClick={handleSave} disabled={saving}
            style={{ background: color, color: '#000', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {saving ? '...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function GoalsPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ goal_name: '', goal_type: 'savings', target_amount: '', target_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showConfetti, setShowConfetti] = useState(false)

  const load = async () => {
    setLoading(true)
    const data = await req('/goals')
    setGoals(data.goals || [])
    setLoading(false)
  }

  useEffect(() => {
    initLang(); initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else load()
    })
  }, [])

  const handleCreate = async () => {
    if (!form.goal_name || !form.target_amount) { setError('Name and target amount required'); return }
    setSaving(true); setError('')
    const data = await req('/goals', {
      method: 'POST',
      body: JSON.stringify({ ...form, target_amount: parseFloat(form.target_amount) })
    })
    if (data.success) {
      setGoals(prev => [...prev, data.goal])
      setForm({ goal_name: '', goal_type: 'savings', target_amount: '', target_date: '', notes: '' })
      setShowForm(false)
    } else setError(data.detail || 'Failed to create')
    setSaving(false)
  }

  const handleUpdate = async (goalId, amount, justReached) => {
    const data = await req(`/goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ current_amount: amount })
    })
    if (data.success) {
      setGoals(prev => prev.map(g => g.id === goalId ? data.goal : g))
      if (justReached) {
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 4500)
      }
    }
  }

  const handleDelete = async (goalId) => {
    await req(`/goals/${goalId}`, { method: 'DELETE' })
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0)
  const totalSaved  = goals.reduce((s, g) => s + (g.current_amount || 0), 0)
  const completed   = goals.filter(g => g.is_completed || (g.target_amount > 0 && g.current_amount >= g.target_amount)).length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Confetti active={showConfetti} />
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('goals.title')}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Track progress towards your financial goals</p>
            </div>
            <button onClick={() => setShowForm(!showForm)}
              style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {showForm ? 'Cancel' : '+ New Goal'}
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {goals.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {[
                { label: 'TOTAL GOALS', value: goals.length, sub: `${completed} completed` },
                { label: 'TARGET',  value: totalTarget.toLocaleString(), color: 'var(--gold)' },
                { label: 'SAVED',   value: totalSaved.toLocaleString(),  color: '#34d399' },
                { label: 'OVERALL', value: `${totalTarget > 0 ? ((totalSaved / totalTarget) * 100).toFixed(1) : 0}%`, color: '#4a9eff' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '20px', fontWeight: 700, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>{s.sub}</div>}
                </div>
              ))}
            </div>
          )}

          {showForm && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold-dim)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '16px' }}>NEW FINANCIAL GOAL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>GOAL NAME *</label>
                  <input className="input" placeholder="e.g. Emergency Fund, Holiday, New Car" value={form.goal_name} onChange={e => setForm({ ...form, goal_name: e.target.value })} autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>TYPE</label>
                  <select value={form.goal_type} onChange={e => setForm({ ...form, goal_type: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                    {Object.entries(GOAL_ICONS).map(([k, v]) => <option key={k} value={k}>{v} {k.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>TARGET AMOUNT *</label>
                  <input className="input" type="number" placeholder="e.g. 5000000" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>TARGET DATE <span style={{ color: 'var(--text-dim)' }}>(optional)</span></label>
                  <input className="input" type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>NOTES <span style={{ color: 'var(--text-dim)' }}>(optional)</span></label>
                  <input className="input" placeholder="Why is this goal important to you?" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              {error && <div style={{ color: '#f87171', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
              <button onClick={handleCreate} disabled={saving}
                style={{ marginTop: '16px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {saving ? 'Creating...' : 'Create Goal'}
              </button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>Loading goals...</div>
          ) : goals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '70px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎯</div>
              <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No goals yet</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '360px', margin: '0 auto 24px', lineHeight: 1.6 }}>
                Goals give your savings a purpose. Whether it's an emergency fund, a holiday, or a new business — set a target and watch your progress grow.
              </div>
              <button onClick={() => setShowForm(true)}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '12px 28px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Set your first goal
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {goals.map(goal => (
                <GoalCard key={goal.id} goal={goal} onUpdate={handleUpdate} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}