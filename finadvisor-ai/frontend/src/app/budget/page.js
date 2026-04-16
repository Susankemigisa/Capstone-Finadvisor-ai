'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'
import PageShell from '@/components/layout/PageShell'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path, opts = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers }
  }).then(r => r.json())
}

const CATEGORIES = {
  income:  ['Salary', 'Freelance', 'Investment', 'Rental', 'Business', 'MoMo Transfer', 'Other'],
  expense: ['Housing', 'Food', 'Transport', 'Healthcare', 'Entertainment', 'Shopping', 'Utilities', 'Education', 'Savings', 'Other']
}

const CAT_COLORS = ['#c9a84c','#4a9eff','#34d399','#f87171','#a78bfa','#fb923c','#38bdf8','#f472b6','#6ee7b7','#fbbf24']

function CategoryBar({ category, amount, total, color, pct }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
        <span style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, display: 'inline-block', flexShrink: 0 }} />
          {category}
        </span>
        <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>
          {amount.toLocaleString()} <span style={{ color: 'var(--text-dim)' }}>({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div style={{ background: 'var(--bg-base)', borderRadius: '3px', height: '5px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function Donut({ income, expenses }) {
  const total = income + expenses || 1
  const incPct = (income / total) * 100
  const r = 50, cx = 60, cy = 60
  const toRad = d => (d * Math.PI) / 180
  const makeArc = (start, end, color) => {
    const s = start / 100 * 360 - 90
    const e = end / 100 * 360 - 90
    const x1 = cx + r * Math.cos(toRad(s)), y1 = cy + r * Math.sin(toRad(s))
    const x2 = cx + r * Math.cos(toRad(e)), y2 = cy + r * Math.sin(toRad(e))
    return <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${(end - start) > 50 ? 1 : 0},1 ${x2},${y2} Z`} fill={color} opacity={0.85} />
  }
  const net = income - expenses
  return (
    <svg width={120} height={120}>
      {makeArc(0, incPct, '#34d399')}
      {makeArc(incPct, 100, '#f87171')}
      <circle cx={cx} cy={cy} r={30} fill="var(--bg-surface)" />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text-secondary)" fontSize={9} fontFamily="DM Mono">NET</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={net >= 0 ? '#34d399' : '#f87171'} fontSize={9} fontFamily="DM Mono" fontWeight={700}>
        {net >= 0 ? '+' : ''}{Math.abs(net) >= 1e6 ? `${(net/1e6).toFixed(1)}M` : Math.abs(net) >= 1e3 ? `${(net/1e3).toFixed(0)}K` : net.toFixed(0)}
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
  const [filter, setFilter] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [form, setForm] = useState({ category: 'Salary', entry_type: 'income', amount: '', description: '', entry_date: new Date().toISOString().split('T')[0], subcategory: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async (month) => {
    setLoading(true)
    const data = await req(`/budget${month ? `?month=${month}` : ''}`)
    setEntries(data.entries || [])
    setSummary(data.summary || { income: 0, expenses: 0, net: 0 })
    setLoading(false)
  }

  useEffect(() => {
    initLang(); initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else load(selectedMonth)
    })
  }, [])

  const handleAdd = async () => {
    if (!form.amount || !form.category) { setError('Category and amount required'); return }
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
    } else setError(data.detail || 'Failed to add')
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

  // Category breakdown
  const expEntries = entries.filter(e => e.entry_type === 'expense')
  const byCat = {}
  expEntries.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + parseFloat(e.amount) })
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
  const totalExp = summary.expenses || 1

  const filtered = filter === 'all' ? entries : entries.filter(e => e.entry_type === filter)

  // Month picker — last 12 months
  const months = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    months.push(d.toISOString().slice(0, 7))
  }

  const savingsRate = summary.income > 0 ? ((summary.income - summary.expenses) / summary.income * 100) : 0

  return (
    <PageShell title="Budget">
      <>
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('budget.title')}</h1>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); load(e.target.value) }}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                {months.map(m => (
                  <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-UG', { month: 'long', year: 'numeric' })}</option>
                ))}
              </select>
              <button onClick={() => setShowForm(!showForm)}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {showForm ? 'Cancel' : '+ Add Entry'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {/* Summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '14px', marginBottom: '24px', alignItems: 'center' }}>
            {[
              { label: 'INCOME', value: summary.income, color: '#34d399' },
              { label: 'EXPENSES', value: summary.expenses, color: '#f87171' },
              { label: 'NET', value: summary.net, color: summary.net >= 0 ? '#34d399' : '#f87171' },
              { label: 'SAVINGS RATE', value: `${Math.max(savingsRate, 0).toFixed(1)}%`, raw: true, color: savingsRate >= 20 ? '#34d399' : savingsRate >= 10 ? '#c9a84c' : '#f87171' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>{s.label}</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '20px', fontWeight: 700, color: s.color }}>
                  {s.raw ? s.value : (s.value >= 0 ? '' : '-') + (Math.abs(s.value) >= 1e6 ? `${(Math.abs(s.value)/1e6).toFixed(1)}M` : Math.abs(s.value).toLocaleString())}
                </div>
              </div>
            ))}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '6px', display: 'flex', justifyContent: 'center' }}>
              <Donut income={summary.income} expenses={summary.expenses} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {/* Spending by category */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '16px' }}>SPENDING BY CATEGORY</div>
              {sortedCats.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: '13px' }}>No expenses logged this month</div>
              ) : sortedCats.slice(0, 7).map(([cat, amt], i) => (
                <CategoryBar key={cat} category={cat} amount={amt} total={totalExp} color={CAT_COLORS[i % CAT_COLORS.length]} pct={(amt / totalExp) * 100} />
              ))}
            </div>

            {/* Quick insights */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '16px' }}>THIS MONTH AT A GLANCE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Transactions logged', value: entries.length, icon: '📝' },
                  { label: 'Largest expense', value: expEntries.length > 0 ? expEntries.reduce((m, e) => parseFloat(e.amount) > parseFloat(m.amount) ? e : m, expEntries[0])?.category : '—', icon: '💸' },
                  { label: 'Biggest category', value: sortedCats[0]?.[0] || '—', icon: '📊' },
                  { label: 'Daily average spend', value: summary.expenses > 0 ? `${(summary.expenses / 30).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—', icon: '📅' },
                ].map(({ label, value, icon }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{icon}</span>{label}
                    </span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add form */}
          {showForm && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold-dim)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px', letterSpacing: '0.08em' }}>NEW ENTRY</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>TYPE</label>
                  <select value={form.entry_type} onChange={e => setForm({ ...form, entry_type: e.target.value, category: CATEGORIES[e.target.value][0] })}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                    <option value="income">💰 Income</option>
                    <option value="expense">💸 Expense</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>CATEGORY</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                    {CATEGORIES[form.entry_type].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>AMOUNT *</label>
                  <input className="input" type="number" placeholder="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>DATE</label>
                  <input className="input" type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} />
                </div>
                <div style={{ gridColumn: '2 / -1' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>DESCRIPTION</label>
                  <input className="input" placeholder="What was this for?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              {error && <div style={{ color: '#f87171', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
              <button onClick={handleAdd} disabled={saving}
                style={{ marginTop: '16px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {saving ? 'Adding...' : 'Add Entry'}
              </button>
            </div>
          )}

          {/* Filter tabs + entries table */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'center' }}>
            {['all', 'income', 'expense'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '6px 16px', borderRadius: '20px', border: filter === f ? 'none' : '1px solid var(--border)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize', background: filter === f ? 'var(--gold)' : 'var(--bg-surface)', color: filter === f ? '#000' : 'var(--text-secondary)' }}>
                {f === 'income' ? '💰 Income' : f === 'expense' ? '💸 Expenses' : 'All'}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-dim)' }}>{filtered.length} entries</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>💰</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>No entries this month</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Start logging your income and expenses to see insights</div>
              <button onClick={() => setShowForm(true)}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Add your first entry
              </button>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 110px 32px', gap: '12px', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                {['DATE', 'CATEGORY', 'DESCRIPTION', 'AMOUNT', ''].map((h, i) => (
                  <div key={i} style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{h}</div>
                ))}
              </div>
              {filtered.map((entry, i) => (
                <div key={entry.id}
                  style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 110px 32px', gap: '12px', padding: '12px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{entry.entry_date}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{entry.category}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.description || '—'}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, fontSize: '13px', color: entry.entry_type === 'income' ? '#34d399' : '#f87171' }}>
                    {entry.entry_type === 'income' ? '+' : '-'}{parseFloat(entry.amount).toLocaleString()}
                  </div>
                  <button onClick={() => handleDelete(entry.id, entry.entry_type, parseFloat(entry.amount))}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px', padding: '2px', opacity: 0.5 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    </PageShell>
  )
}