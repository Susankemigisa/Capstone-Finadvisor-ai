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

const PROVIDERS = [
  { id: 'mtn_momo',     name: 'MTN Mobile Money', icon: '📱', color: '#FFCC00', type: 'mobile_money', bank: 'MTN Uganda',       hint: 'Your MTN MoMo phone number e.g. 0771234567' },
  { id: 'airtel_money', name: 'Airtel Money',      icon: '📡', color: '#FF0000', type: 'mobile_money', bank: 'Airtel Uganda',    hint: 'Your Airtel Money phone number e.g. 0701234567' },
  { id: 'mono',         name: 'Stanbic Bank',      icon: '🏦', color: '#003366', type: 'bank',         bank: 'Stanbic Bank Uganda', hint: 'Your Stanbic online banking account ID' },
  { id: 'mono',         name: 'DFCU Bank',         icon: '🏦', color: '#006633', type: 'bank',         bank: 'DFCU Bank Uganda',    hint: 'Your DFCU account number' },
  { id: 'mono',         name: 'Centenary Bank',    icon: '🏦', color: '#004080', type: 'bank',         bank: 'Centenary Bank',      hint: 'Your Centenary account number' },
  { id: 'mono',         name: 'Equity Bank',       icon: '🏦', color: '#CC0000', type: 'bank',         bank: 'Equity Bank Uganda',  hint: 'Your Equity account number' },
  { id: 'flutterwave',  name: 'Card / Other',      icon: '💳', color: '#F5A623', type: 'card',         bank: 'Flutterwave',         hint: 'Email address linked to your Flutterwave account' },
  { id: 'manual',       name: 'Manual Entry',      icon: '✏️', color: '#8892a4', type: 'manual',       bank: 'Manual',              hint: 'No live sync — you update the balance yourself' },
]

function AccountCard({ account, onDisconnect }) {
  const providerColor = PROVIDERS.find(p => p.id === account.provider)?.color || '#c9a84c'
  const icon = PROVIDERS.find(p => p.bank === account.bank_name)?.icon || '🏦'
  const lastSync = account.last_synced_at
    ? new Date(account.last_synced_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Never synced'

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: providerColor + '22', border: `2px solid ${providerColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{account.account_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {account.bank_name} {account.account_number_masked && `· ${account.account_number_masked}`}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>Last synced: {lastSync}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#34d399' }} />
          <span style={{ color: '#34d399' }}>Connected</span>
        </div>
        <button onClick={() => onDisconnect(account.id)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#f87171', fontSize: '12px', cursor: 'pointer' }}>
          Disconnect
        </button>
      </div>
    </div>
  )
}

export default function ConnectionsPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ account_name: '', account_number: '', provider_account_id: '', currency: 'UGX' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => {
    setLoading(true)
    const data = await req('/savings/accounts')
    setAccounts(data.accounts || [])
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

  const handleConnect = async () => {
    if (!selected) { setError('Select an account type'); return }
    if (!form.account_name) { setError('Account name is required'); return }
    setSaving(true); setError('')
    const data = await req('/savings/accounts', {
      method: 'POST',
      body: JSON.stringify({
        provider: selected.id,
        account_name: form.account_name,
        account_type: selected.type,
        bank_name: selected.bank,
        account_number: form.account_number,
        provider_account_id: form.provider_account_id || form.account_number,
        currency: form.currency,
      })
    })
    if (data.account) {
      setAccounts(prev => [...prev, data.account])
      setForm({ account_name: '', account_number: '', provider_account_id: '', currency: 'UGX' })
      setShowForm(false); setSelected(null)
      setSuccess(`${form.account_name} connected! Incoming transactions will now trigger your savings rules.`)
      setTimeout(() => setSuccess(''), 5000)
    } else setError(data.detail || 'Failed to connect account')
    setSaving(false)
  }

  const handleDisconnect = async (id) => {
    if (!confirm('Disconnect this account? Your savings history will be kept.')) return
    await req(`/savings/accounts/${id}`, { method: 'DELETE' })
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>Bank & Mobile Money</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Connect your accounts — when money arrives, your savings rules run automatically</p>
            </div>
            <button onClick={() => { setShowForm(!showForm); setSelected(null); setError('') }}
              style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {showForm ? 'Cancel' : '+ Connect Account'}
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: '800px' }}>
          {success && (
            <div style={{ background: '#052e16', border: '1px solid #34d399', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', color: '#34d399', fontSize: '13px' }}>
              ✅ {success}
            </div>
          )}

          {/* How it works */}
          {accounts.length === 0 && !showForm && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '28px', marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>How automatic savings works</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { step: '1', text: 'Connect your MTN MoMo, Airtel Money, or bank account below' },
                  { step: '2', text: 'Go to Savings Rules and create a rule e.g. "Save 20% of everything"' },
                  { step: '3', text: 'When money hits your account, FinAdvisor detects it automatically' },
                  { step: '4', text: 'Your savings rule fires instantly — money is tracked in your pocket' },
                ].map(({ step, text }) => (
                  <div key={step} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--gold)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{step}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingTop: '3px' }}>{text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connect form */}
          {showForm && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold-dim)', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '16px' }}>SELECT ACCOUNT TYPE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                {PROVIDERS.map((p, i) => (
                  <button key={i} onClick={() => { setSelected(p); setForm({ ...form, account_name: p.name }) }}
                    style={{ textAlign: 'left', padding: '12px', borderRadius: '10px', border: `2px solid ${selected?.name === p.name ? p.color : 'var(--border)'}`, background: selected?.name === p.name ? p.color + '15' : 'var(--bg-elevated)', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{p.icon}</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>{p.type.replace('_', ' ')}</div>
                  </button>
                ))}
              </div>

              {selected && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>ACCOUNT NICKNAME *</label>
                    <input className="input" placeholder={`e.g. My ${selected.name}`} value={form.account_name}
                      onChange={e => setForm({ ...form, account_name: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      {selected.type === 'mobile_money' ? 'PHONE NUMBER' : selected.id === 'flutterwave' ? 'EMAIL ADDRESS' : 'ACCOUNT NUMBER'}
                    </label>
                    <input className="input" placeholder={selected.hint} value={form.account_number}
                      onChange={e => setForm({ ...form, account_number: e.target.value, provider_account_id: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>CURRENCY</label>
                    <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                      {['UGX','USD','KES','GBP','EUR'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    ℹ️ <strong style={{ color: 'var(--text-primary)' }}>Your credentials are never stored.</strong> We only store your phone number or account identifier so we can match incoming webhook events to your account. Your actual bank login details go directly to your bank.
                  </div>
                </div>
              )}

              {error && <div style={{ color: '#f87171', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
              {selected && (
                <button onClick={handleConnect} disabled={saving}
                  style={{ marginTop: '16px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? 'Connecting...' : `Connect ${selected.name}`}
                </button>
              )}
            </div>
          )}

          {/* Connected accounts */}
          {loading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '20px 0' }}>Loading accounts...</div>
          ) : accounts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '4px' }}>CONNECTED ACCOUNTS</div>
              {accounts.map(a => <AccountCard key={a.id} account={a} onDisconnect={handleDisconnect} />)}
            </div>
          ) : !showForm && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏦</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No accounts connected yet</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto 24px' }}>
                Connect your MTN MoMo or bank account and your savings rules will run automatically whenever money arrives.
              </div>
              <button onClick={() => setShowForm(true)}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '12px 28px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Connect your first account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}