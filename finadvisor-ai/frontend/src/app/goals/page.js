'use client'
import { useState, useEffect } from 'react'
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

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ background: 'var(--bg-base)', borderRadius: '4px', height: '6px', overflow: 'hidden', marginTop: '8px' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
    </div>
  )
}

function GoalCard({ goal, onUpdate, onDelete }) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(goal.current_amount || 0)
  const [saving, setSaving] = useState(false)
  const pct = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0
  const color = GOAL_COLORS[goal.goal_type] || '#c9a84c'
  const icon = GOAL_ICONS[goal.goal_type] || '⭐'

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(goal.id, parseFloat(amount))
    setEditing(false)
    setSaving(false)
  }

  const daysLeft = goal.target_date
    ? Math.ceil((new Date(goal.target_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid var(--border)`, borderRadius: '12px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
      {/* Color accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: color }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>{goal.goal_name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize', marginTop: '2px' }}>
              {goal.goal_type.replace('_', ' ')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setEditing(!editing)}
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
            Update
          </button>
          <button onClick={() => onDelete(goal.id)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', color: 'var(--red, #f87171)', cursor: 'pointer', fontSize: '12px' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)', fontWeight: 600 }}>
            ${(goal.current_amount || 0).toLocaleString()}
          </span> of ${goal.target_amount.toLocaleString()}
        </span>
        <span style={{ fontFamily: 'DM Mono, monospace', color, fontWeight: 700 }}>{pct.toFixed(1)}%</span>
      </div>
      <ProgressBar value={goal.current_amount || 0} max={goal.target_amount} color={color} />

      {/* Meta */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {daysLeft !== null && (
          <span>{daysLeft > 0 ? `${daysLeft} ${t('goals.daysLeft')}` : daysLeft === 0 ? t('goals.dueToday') : `${Math.abs(daysLeft)} ${t('goals.daysOverdue')}`}</span>
        )}
        {goal.is_completed && <span style={{ color: 'var(--green, #34d399)', fontWeight: 600 }}>{t('goals.goalCompleted')}</span>}
        {goal.notes && <span style={{ fontStyle: 'italic', color: 'var(--text-dim)' }}>{goal.notes}</span>}
      </div>

      {/* Inline edit */}
      {editing && (
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('goals.currentAmount')}</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'DM Mono, monospace', outline: 'none' }} />
          <button onClick={handleSave} disabled={saving}
            style={{ background: color, color: '#000', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {saving ? t('goals.saving') : t('goals.save')}
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

  const load = async () => {
    setLoading(true)
    const data = await req('/goals')
    setGoals(data.goals || [])
    setLoading(false)
  }

  useEffect(() => {
    initLang()
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else load()
    })
  }, [])

  const handleCreate = async () => {
    if (!form.goal_name || !form.target_amount) { setError(t('goals.nameRequired') || 'Name and target amount required'); return }
    setSaving(true); setError('')
    const data = await req('/goals', {
      method: 'POST',
      body: JSON.stringify({ ...form, target_amount: parseFloat(form.target_amount) })
    })
    if (data.success) {
      setGoals(prev => [...prev, data.goal])
      setForm({ goal_name: '', goal_type: 'savings', target_amount: '', target_date: '', notes: '' })
      setShowForm(false)
    } else setError(data.detail || t('common.error') || 'Failed to create')
    setSaving(false)
  }

  const handleUpdate = async (goalId, amount) => {
    const data = await req(`/goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ current_amount: amount })
    })
    if (data.success) setGoals(prev => prev.map(g => g.id === goalId ? data.goal : g))
  }

  const handleDelete = async (goalId) => {
    await req(`/goals/${goalId}`, { method: 'DELETE' })
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0)
  const totalSaved = goals.reduce((s, g) => s + (g.current_amount || 0), 0)
  const completed = goals.filter(g => g.is_completed).length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('goals.title')}</h1>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() =>setShowForm(!showForm)}
            style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {showForm ? t('goals.cancel') : t('goals.newGoal')}</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
        {/* Summary stats */}
        {goals.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: t('goals.totalGoals'), value: goals.length, sub: `${completed} ${t('goals.completed')}` },
              { label: t('goals.totalTarget'), value: `$${totalTarget.toLocaleString()}`, color: 'var(--gold)' },
              { label: t('goals.totalSaved'), value: `$${totalSaved.toLocaleString()}`, color: 'var(--green, #34d399)' },
              { label: t('goals.progress'), value: `${totalTarget > 0 ? ((totalSaved / totalTarget) * 100).toFixed(1) : 0}%`, color: '#4a9eff' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '8px' }}>{s.label}</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '22px', fontWeight: 700, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* New goal form */}
        {showForm && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', letterSpacing: '0.05em' }}>NEW FINANCIAL GOAL</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>GOAL NAME *</label>
                <input className="input" placeholder={t('goals.namePlaceholder')} value={form.goal_name}
                  onChange={e => setForm({ ...form, goal_name: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('goals.goalType')}</label>
                <select value={form.goal_type} onChange={e => setForm({ ...form, goal_type: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                  {Object.entries(GOAL_ICONS).map(([k, v]) => (
                    <option key={k} value={k}>{v} {k.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>TARGET AMOUNT *</label>
                <input className="input" type="number" placeholder="10000" value={form.target_amount}
                  onChange={e => setForm({ ...form, target_amount: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('goals.targetDate')}</label>
                <input className="input" type="date" value={form.target_date}
                  onChange={e => setForm({ ...form, target_date: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('goals.notes')}</label>
                <input className="input" placeholder={t('goals.notesPlaceholder')} value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            {error && <div style={{ color: 'var(--red, #f87171)', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
            <button onClick={handleCreate} disabled={saving}
              style={{ marginTop: '16px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Creating...' : 'Create Goal'}
            </button>
          </div>
        )}

        {/* Goals grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>{t('goals.loading')}</div>
        ) : goals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎯</div>
            <div style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '6px' }}>{t('goals.empty')}</div>
            <div style={{ fontSize: '13px' }}>{t('goals.emptyHint')}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
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
