'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import Sidebar from '@/components/layout/Sidebar'
import PageShell from '@/components/layout/PageShell'
import { useLangStore, useTranslate } from '@/stores/langStore'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path, opts = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers }
  }).then(r => r.json())
}

function fmt(n, currency = 'UGX') {
  if (!n && n !== 0) return '—'
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function ProgressRing({ pct, color, size = 56 }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const fill = Math.min(pct, 100) / 100 * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-base)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  )
}

function PocketCard({ pocket, onTransact, onDelete }) {
  const pct = pocket.target_amount > 0 ? Math.min((pocket.current_amount / pocket.target_amount) * 100, 100) : null
  const reached = pct !== null && pct >= 100
  const [showTransact, setShowTransact] = useState(false)
  const [txType, setTxType] = useState('deposit')
  const [txAmount, setTxAmount] = useState('')
  const [txNote, setTxNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleTransact = async () => {
    if (!txAmount || parseFloat(txAmount) <= 0) return
    setLoading(true)
    await onTransact(pocket.id, { amount: parseFloat(txAmount), transaction_type: txType, note: txNote })
    setTxAmount(''); setTxNote(''); setShowTransact(false); setLoading(false)
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid ${reached ? '#34d399' : 'var(--border)'}`, borderRadius: '14px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: pocket.color || 'var(--gold)' }} />

      {reached && (
        <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#34d399', color: '#000', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
          🎉 GOAL REACHED
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '28px', lineHeight: 1 }}>{pocket.icon || '💰'}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{pocket.name}</div>
            {pocket.description && <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>{pocket.description}</div>}
          </div>
        </div>
        {pct !== null && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ProgressRing pct={pct} color={pocket.color || 'var(--gold)'} />
            <span style={{ position: 'absolute', fontSize: '10px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: pocket.color || 'var(--gold)' }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '24px', fontWeight: 700, color: pocket.color || 'var(--gold)' }}>
          {fmt(pocket.current_amount, pocket.currency)}
        </div>
        {pocket.target_amount > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            of {fmt(pocket.target_amount, pocket.currency)} goal
            {pocket.target_date && ` · due ${new Date(pocket.target_date).toLocaleDateString('en-UG', { month: 'short', year: 'numeric' })}`}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <div style={{ background: 'var(--bg-base)', borderRadius: '4px', height: '5px', marginBottom: '14px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pocket.color || 'var(--gold)', borderRadius: '4px', transition: 'width 0.6s ease' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => { setTxType('deposit'); setShowTransact(!showTransact) }}
          style={{ flex: 1, background: pocket.color || 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
          + Save
        </button>
        <button onClick={() => { setTxType('withdrawal'); setShowTransact(!showTransact) }}
          style={{ flex: 1, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', fontSize: '12px', cursor: 'pointer' }}>
          Withdraw
        </button>
        <button onClick={() => onDelete(pocket.id)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}>
          ✕
        </button>
      </div>

      {showTransact && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input type="number" placeholder="Amount" value={txAmount} onChange={e => setTxAmount(e.target.value)}
              style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'DM Mono, monospace', outline: 'none' }} />
          </div>
          <input placeholder="Note (optional)" value={txNote} onChange={e => setTxNote(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }} />
          <button onClick={handleTransact} disabled={loading}
            style={{ width: '100%', background: txType === 'deposit' ? (pocket.color || 'var(--gold)') : '#f87171', color: '#000', border: 'none', borderRadius: '8px', padding: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Processing...' : txType === 'deposit' ? `Deposit to ${pocket.name}` : `Withdraw from ${pocket.name}`}
          </button>
        </div>
      )}
    </div>
  )
}

const POCKET_ICONS = ['💰','🏠','✈️','🎓','🚗','💊','🎉','🛡️','👶','💍','📱','🌍']
const POCKET_COLORS = ['#c9a84c','#4a9eff','#34d399','#f87171','#a78bfa','#fb923c','#38bdf8','#f472b6']

export default function SavingsPage() {
  const router = useRouter()
  const t = useTranslate()
  const { init: initLang } = useLangStore()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const [pockets, setPockets] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', target_amount: '', currency: 'UGX', icon: '💰', color: '#c9a84c', target_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const [pData, sData] = await Promise.all([req('/savings/pockets'), req('/savings/summary')])
    setPockets(pData.pockets || [])
    setSummary(sData)
    setLoading(false)
  }

  useEffect(() => {
    initTheme()
    initLang()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else load()
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!form.name) { setError('Pocket name is required'); return }
    setSaving(true); setError('')
    const data = await req('/savings/pockets', {
      method: 'POST',
      body: JSON.stringify({ ...form, target_amount: form.target_amount ? parseFloat(form.target_amount) : null })
    })
    if (data.pocket) {
      setPockets(prev => [...prev, data.pocket])
      setForm({ name: '', description: '', target_amount: '', currency: 'UGX', icon: '💰', color: '#c9a84c', target_date: '' })
      setShowForm(false)
    } else setError(data.detail || 'Failed to create pocket')
    setSaving(false)
  }

  const handleTransact = async (pocketId, body) => {
    await req(`/savings/pockets/${pocketId}/transact`, { method: 'POST', body: JSON.stringify(body) })
    load()
  }

  const handleDelete = async (pocketId) => {
    if (!confirm('Delete this pocket? This cannot be undone.')) return
    await req(`/savings/pockets/${pocketId}`, { method: 'DELETE' })
    setPockets(prev => prev.filter(p => p.id !== pocketId))
  }

  const totalSaved = pockets.reduce((s, p) => s + (p.current_amount || 0), 0)
  const totalTarget = pockets.reduce((s, p) => s + (p.target_amount || 0), 0)
  const reached = pockets.filter(p => p.target_amount > 0 && p.current_amount >= p.target_amount).length

  return (
    <PageShell title={t('savings.title')}>
      <>
        {/* Header */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('savings.title')}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Virtual buckets — your money stays in your real bank, this tracks what&apos;s earmarked</p>
            </div>
            <button onClick={() => setShowForm(!showForm)}
              style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {showForm ? 'Cancel' : '+ New Pocket'}
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {/* Summary stats */}
          {pockets.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {[
                { label: 'TOTAL SAVED', value: fmt(totalSaved), color: 'var(--gold)' },
                { label: 'TOTAL TARGET', value: fmt(totalTarget), color: 'var(--text-primary)' },
                { label: 'POCKETS', value: pockets.length, color: 'var(--text-primary)' },
                { label: 'GOALS REACHED', value: `${reached} 🎉`, color: '#34d399' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '20px', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* New pocket form */}
          {showForm && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold-dim)', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '18px' }}>{t('savings.newPocket')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('savings.pocketName')} *</label>
                  <input className="input" placeholder="e.g. Emergency Fund, Holiday Trip, New Laptop" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('savings.targetAmount')}</label>
                  <input className="input" type="number" placeholder="e.g. 5000000" value={form.target_amount}
                    onChange={e => setForm({ ...form, target_amount: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('savings.currency')}</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                    {['UGX','USD','KES','GBP','EUR'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('savings.targetDate')}</label>
                  <input className="input" type="date" value={form.target_date}
                    onChange={e => setForm({ ...form, target_date: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>{t('savings.icon')}</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {POCKET_ICONS.map(icon => (
                      <button key={icon} onClick={() => setForm({ ...form, icon })}
                        style={{ fontSize: '20px', padding: '6px', background: form.icon === icon ? 'var(--bg-elevated)' : 'none', border: `2px solid ${form.icon === icon ? 'var(--gold)' : 'transparent'}`, borderRadius: '8px', cursor: 'pointer' }}>
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>{t('savings.color')}</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {POCKET_COLORS.map(color => (
                      <button key={color} onClick={() => setForm({ ...form, color })}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', background: color, border: `3px solid ${form.color === color ? 'var(--text-primary)' : 'transparent'}`, cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('savings.description')}</label>
                  <input className="input" placeholder="What is this pocket for?" value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              {error && <div style={{ color: '#f87171', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
              <button onClick={handleCreate} disabled={saving}
                style={{ marginTop: '16px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {saving ? t('savings.creating') : t('savings.createPocket')}
              </button>
            </div>
          )}

          {/* Pockets grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', height: '180px' }}>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', height: '16px', width: '60%', marginBottom: '12px' }} />
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', height: '28px', width: '40%', marginBottom: '8px' }} />
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: '4px', height: '5px', width: '100%', marginBottom: '14px' }} />
                </div>
              ))}
            </div>
          ) : pockets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>💰</div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{t('savings.noPockets')}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 24px' }}>
                Create a pocket for each savings goal — Emergency Fund, Holiday Trip, New Phone. Your money stays in your real bank account, this just helps you track it.
              </div>
              <button onClick={() => setShowForm(true)}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '12px 28px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Create your first pocket
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {pockets.map(pocket => (
                <PocketCard key={pocket.id} pocket={pocket} onTransact={handleTransact} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </>
    </PageShell>
  )
}