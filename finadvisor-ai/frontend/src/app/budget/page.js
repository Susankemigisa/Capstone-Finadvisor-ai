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

const CATEGORIES = {
  income: ['Salary', 'Freelance', 'Investment', 'Rental', 'Business', 'Other'],
  expense: ['Housing', 'Food', 'Transport', 'Healthcare', 'Entertainment', 'Shopping', 'Utilities', 'Education', 'Savings', 'Other']
}

function DonutSummary({ income, expenses }) {
  const total = income + expenses || 1
  const incPct = (income / total) * 100
  const expPct = (expenses / total) * 100
  const r = 50, cx = 60, cy = 60
  const toRad = d => (d * Math.PI) / 180
  const makeArc = (startPct, endPct, color) => {
    const start = startPct / 100 * 360 - 90
    const end = endPct / 100 * 360 - 90
    const x1 = cx + r * Math.cos(toRad(start))
    const y1 = cy + r * Math.sin(toRad(start))
    const x2 = cx + r * Math.cos(toRad(end))
    const y2 = cy + r * Math.sin(toRad(end))
    const large = (endPct - startPct) > 50 ? 1 : 0
    return <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`} fill={color} opacity={0.85} />
  }

  return (
    <svg width={120} height={120}>
      {makeArc(0, incPct, '#34d399')}
      {makeArc(incPct, incPct + expPct, '#f87171')}
      <circle cx={cx} cy={cy} r={30} fill="var(--bg-surface)" />
      <text x={cx} y={cx - 4} textAnchor="middle" fill="var(--text-secondary)" fontSize={9} fontFamily="DM Mono">NET</text>
      <text x={cx} y={cx + 10} textAnchor="middle" fill={income >= expenses ? '#34d399' : '#f87171'} fontSize={10} fontFamily="DM Mono" fontWeight={700}>
        {income >= expenses ? '+' : '-'}${Math.abs(income - expenses).toLocaleString()}
      </text>
    </svg>
  )
}

export default function BudgetPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState({ income: 0, expenses: 0, net: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all') // all | income | expense
  const [selectedMonth, setSelectedMonth] = useState('')
  const [form, setForm] = useState({ category: 'Salary', entry_type: 'income', amount: '', description: '', entry_date: new Date().toISOString().split('T')[0], subcategory: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async (month = '') => {
    setLoading(true)
    const qs = month ? `?month=${month}` : ''
    const data = await req(`/budget${qs}`)
    setEntries(data.entries || [])
    setSummary(data.summary || { income: 0, expenses: 0, net: 0 })
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

  const handleAdd = async () => {
    if (!form.amount || !form.category) { setError(t('budget.required') || 'Category and amount required'); return }
    setSaving(true); setError('')
    const data = await req('/budget', { method: 'POST', body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) })
    if (data.success) {
      setEntries(prev => [data.entry, ...prev])
      setSummary(prev => ({
        income: form.entry_type === 'income' ? prev.income + parseFloat(form.amount) : prev.income,
        expenses: form.entry_type === 'expense' ? prev.expenses + parseFloat(form.amount) : prev.expenses,
        net: form.entry_type === 'income' ? prev.net + parseFloat(form.amount) : prev.net - parseFloat(form.amount),
      }))
      setForm({ ...form, amount: '', description: '' })
      setShowForm(false)
    } else setError(data.detail || t('common.error') || 'Failed to add')
    setSaving(false)
  }

  const handleDelete = async (id, entry_type, amount) => {
    await req(`/budget/${id}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
    setSummary(prev => ({
      income: entry_type === 'income' ? prev.income - amount : prev.income,
      expenses: entry_type === 'expense' ? prev.expenses - amount : prev.expenses,
      net: entry_type === 'income' ? prev.net - amount : prev.net + amount,
    }))
  }

  const handleMonthChange = (month) => {
    setSelectedMonth(month)
    load(month)
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.entry_type === filter)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('budget.title')}</h1>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() =>setShowForm(!showForm)}
              style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {showForm ? t('budget.cancel') : t('budget.addEntry')}</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
          {[
            { label: t('budget.income'), value: `$${summary.income.toLocaleString()}`, color: '#34d399' },
            { label: t('budget.expenses'), value: `$${summary.expenses.toLocaleString()}`, color: '#f87171' },
            { label: t('budget.net'), value: `${summary.net >= 0 ? '+' : ''}$${summary.net.toLocaleString()}`, color: summary.net >= 0 ? '#34d399' : '#f87171' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '8px' }}>{s.label}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px', display: 'flex', justifyContent: 'center' }}>
            <DonutSummary income={summary.income} expenses={summary.expenses} />
          </div>
        </div>

        {/* Add form */}
        {showForm && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', letterSpacing: '0.05em' }}>NEW ENTRY</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>TYPE</label>
                <select value={form.entry_type} onChange={e => { setForm({ ...form, entry_type: e.target.value, category: CATEGORIES[e.target.value][0] }) }}
                  style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                  <option value="income">💰 Income</option>
                  <option value="expense">💸 Expense</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>CATEGORY</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                  {CATEGORIES[form.entry_type].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>AMOUNT *</label>
                <input className="input" type="number" step="0.01" placeholder="0.00" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>DATE</label>
                <input className="input" type="date" value={form.entry_date}
                  onChange={e => setForm({ ...form, entry_date: e.target.value })} />
              </div>
              <div style={{ gridColumn: '2 / -1' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>DESCRIPTION</label>
                <input className="input" placeholder={t('budget.notesPlaceholder')} value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            {error && <div style={{ color: 'var(--red, #f87171)', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
            <button onClick={handleAdd} disabled={saving}
              style={{ marginTop: '16px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {saving ? t('budget.saving') : t('budget.addEntryBtn')}
            </button>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {['all', 'income', 'expense'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize',
                background: filter === f ? 'var(--gold)' : 'var(--bg-surface)',
                color: filter === f ? '#000' : 'var(--text-secondary)',
                border: filter === f ? 'none' : '1px solid var(--border)' }}>
              {f === 'all' ? t('budget.all') : f === 'income' ? `💰 ${t('budget.income').charAt(0) + t('budget.income').slice(1).toLowerCase()}` : `💸 ${t('budget.expenses').charAt(0) + t('budget.expenses').slice(1).toLowerCase()}`}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Entries table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>{t('budget.loading')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💰</div>
            <div style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '6px' }}>{t('budget.empty')}</div>
            <div style={{ fontSize: '13px' }}>{t('budget.emptyHint')}</div>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 120px auto', gap: '12px', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
              {[t('budget.date'), t('budget.category'), t('budget.description'), t('budget.amount'), ''].map((h, i) => (
                <div key={i} style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{h}</div>
              ))}
            </div>
            {filtered.map((entry, i) => (
              <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 120px auto', gap: '12px', padding: '13px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace' }}>{entry.entry_date}</div>
                <div>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{entry.category}</span>
                  {entry.subcategory && <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '6px' }}>{entry.subcategory}</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.description || '—'}
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, fontSize: '14px', color: entry.entry_type === 'income' ? '#34d399' : '#f87171' }}>
                  {entry.entry_type === 'income' ? '+' : '-'}${parseFloat(entry.amount).toLocaleString()}
                </div>
                <button onClick={() => handleDelete(entry.id, entry.entry_type, parseFloat(entry.amount))}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', color: 'var(--red, #f87171)', cursor: 'pointer', fontSize: '12px' }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
