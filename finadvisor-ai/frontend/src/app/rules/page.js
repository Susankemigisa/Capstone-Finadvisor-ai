'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import Sidebar from '@/components/layout/Sidebar'

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

function RuleCard({ rule, onToggle, onDelete }) {
  const pocket = rule.savings_pockets
  const account = rule.connected_accounts

  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid ${rule.is_active ? 'var(--border)' : 'var(--border)'}`, borderRadius: '12px', padding: '18px', opacity: rule.is_active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '22px' }}>{rule.is_active ? '⚡' : '⏸'}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{rule.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {rule.rule_type === 'percentage'
                ? `Save ${rule.amount_value}% of every incoming payment`
                : `Save ${fmt(rule.amount_value)} from every incoming payment`}
              {rule.trigger_keyword && ` · only when description contains "${rule.trigger_keyword}"`}
              {rule.trigger_amount_min && ` · minimum ${fmt(rule.trigger_amount_min)}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button onClick={() => onToggle(rule.id)}
            style={{ background: rule.is_active ? 'var(--bg-elevated)' : 'var(--gold)', color: rule.is_active ? 'var(--text-secondary)' : '#000', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            {rule.is_active ? 'Pause' : 'Enable'}
          </button>
          <button onClick={() => onDelete(rule.id)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 9px', color: '#f87171', fontSize: '12px', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {pocket && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>→</span> <strong style={{ color: 'var(--text-primary)' }}>{pocket.icon || '💰'} {pocket.name}</strong>
          </div>
        )}
        {account && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            📍 {account.account_name}
          </div>
        )}
        {!account && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            📍 All accounts
          </div>
        )}
      </div>

      {/* Stats */}
      {rule.times_triggered > 0 && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span>Triggered <strong style={{ color: 'var(--text-primary)' }}>{rule.times_triggered}×</strong></span>
          <span>Total saved <strong style={{ color: 'var(--gold)' }}>{fmt(rule.total_saved)}</strong></span>
          {rule.last_triggered_at && <span>Last: {new Date(rule.last_triggered_at).toLocaleDateString()}</span>}
        </div>
      )}
    </div>
  )
}

export default function RulesPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const [rules, setRules] = useState([])
  const [pockets, setPockets] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', pocket_id: '', rule_type: 'percentage', amount_value: '20', trigger_keyword: '', trigger_amount_min: '', source_account_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const [rData, pData, aData] = await Promise.all([req('/savings/rules'), req('/savings/pockets'), req('/savings/accounts')])
    setRules(rData.rules || [])
    setPockets(pData.pockets || [])
    setAccounts(aData.accounts || [])
    setLoading(false)
  }

  useEffect(() => {
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else load()
    })
  }, [])

  const handleCreate = async () => {
    if (!form.name) { setError('Rule name is required'); return }
    if (!form.pocket_id) { setError('Select a savings pocket'); return }
    if (!form.amount_value || parseFloat(form.amount_value) <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    const data = await req('/savings/rules', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        pocket_id: form.pocket_id,
        rule_type: form.rule_type,
        amount_value: parseFloat(form.amount_value),
        trigger_keyword: form.trigger_keyword.trim(),
        trigger_amount_min: form.trigger_amount_min ? parseFloat(form.trigger_amount_min) : null,
        source_account_id: form.source_account_id || null,
      })
    })
    if (data.rule) {
      load()
      setForm({ name: '', pocket_id: '', rule_type: 'percentage', amount_value: '20', trigger_keyword: '', trigger_amount_min: '', source_account_id: '' })
      setShowForm(false)
    } else setError(data.detail || 'Failed to create rule')
    setSaving(false)
  }

  const handleToggle = async (id) => {
    await req(`/savings/rules/${id}/toggle`, { method: 'PATCH' })
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this rule?')) return
    await req(`/savings/rules/${id}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const activeRules = rules.filter(r => r.is_active).length
  const totalAutoSaved = rules.reduce((s, r) => s + (r.total_saved || 0), 0)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>Savings Rules</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Automatic rules that save money the moment it arrives in your account</p>
            </div>
            <button onClick={() => { setShowForm(!showForm); setError('') }}
              style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {showForm ? 'Cancel' : '+ New Rule'}
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: '800px' }}>
          {/* Stats */}
          {rules.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
              {[
                { label: 'ACTIVE RULES', value: activeRules, color: '#34d399' },
                { label: 'TOTAL RULES', value: rules.length, color: 'var(--text-primary)' },
                { label: 'AUTO-SAVED', value: new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(totalAutoSaved), color: 'var(--gold)' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '20px', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* No pockets warning */}
          {pockets.length === 0 && !loading && (
            <div style={{ background: '#1a1200', border: '1px solid var(--gold-dim)', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', fontSize: '13px', color: 'var(--gold)' }}>
              ⚠️ You need at least one savings pocket before creating rules. <a href="/savings" style={{ color: 'var(--gold)', fontWeight: 600, textDecoration: 'underline' }}>Create a pocket →</a>
            </div>
          )}

          {/* New rule form */}
          {showForm && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold-dim)', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '18px' }}>NEW SAVINGS RULE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>RULE NAME *</label>
                  <input className="input" placeholder='e.g. Save 20% of everything' value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>SAVE INTO POCKET *</label>
                  <select value={form.pocket_id} onChange={e => setForm({ ...form, pocket_id: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                    <option value="">Select a pocket...</option>
                    {pockets.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>RULE TYPE</label>
                  <select value={form.rule_type} onChange={e => setForm({ ...form, rule_type: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                    <option value="percentage">Percentage of income</option>
                    <option value="fixed_amount">Fixed amount</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    {form.rule_type === 'percentage' ? 'PERCENTAGE (%)' : 'FIXED AMOUNT (UGX)'}
                  </label>
                  <input className="input" type="number" placeholder={form.rule_type === 'percentage' ? '20' : '100000'} value={form.amount_value}
                    onChange={e => setForm({ ...form, amount_value: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    KEYWORD FILTER <span style={{ color: 'var(--text-dim)' }}>(optional)</span>
                  </label>
                  <input className="input" placeholder='Leave empty to match ALL income' value={form.trigger_keyword}
                    onChange={e => setForm({ ...form, trigger_keyword: e.target.value })} />
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>Set e.g. "salary" to only save from salary payments</div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    MINIMUM AMOUNT <span style={{ color: 'var(--text-dim)' }}>(optional)</span>
                  </label>
                  <input className="input" type="number" placeholder='e.g. 50000 (skips small credits)' value={form.trigger_amount_min}
                    onChange={e => setForm({ ...form, trigger_amount_min: e.target.value })} />
                </div>
                {accounts.length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      APPLY TO ACCOUNT <span style={{ color: 'var(--text-dim)' }}>(optional — leave blank for all accounts)</span>
                    </label>
                    <select value={form.source_account_id} onChange={e => setForm({ ...form, source_account_id: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                      <option value="">All connected accounts</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                    </select>
                  </div>
                )}

                {/* Preview */}
                {form.amount_value && form.pocket_id && (
                  <div style={{ gridColumn: '1 / -1', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--gold)' }}>Preview:</strong> When money arrives
                    {form.trigger_keyword ? ` with "${form.trigger_keyword}" in the description` : ' (any income)'}
                    {form.trigger_amount_min ? ` above ${fmt(parseFloat(form.trigger_amount_min))}` : ''},
                    save {form.rule_type === 'percentage' ? `${form.amount_value}%` : fmt(parseFloat(form.amount_value))} into{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>{pockets.find(p => p.id === form.pocket_id)?.name || 'selected pocket'}</strong>.
                  </div>
                )}
              </div>

              {error && <div style={{ color: '#f87171', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
              <button onClick={handleCreate} disabled={saving || pockets.length === 0}
                style={{ marginTop: '16px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {saving ? 'Creating...' : 'Create Rule'}
              </button>
            </div>
          )}

          {/* Rules list */}
          {loading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading rules...</div>
          ) : rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '70px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No savings rules yet</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto 24px' }}>
                Create a rule like "Save 20% of everything" and your savings will happen automatically every time money hits your account.
              </div>
              {pockets.length > 0 ? (
                <button onClick={() => setShowForm(true)}
                  style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '12px 28px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  Create your first rule
                </button>
              ) : (
                <a href="/savings" style={{ background: 'var(--gold)', color: '#000', borderRadius: '8px', padding: '12px 28px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                  Create a savings pocket first
                </a>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {rules.map(rule => <RuleCard key={rule.id} rule={rule} onToggle={handleToggle} onDelete={handleDelete} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}