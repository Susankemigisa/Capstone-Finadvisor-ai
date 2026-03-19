'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function authFetch(path, opts = {}) {
  const token = localStorage.getItem('access_token')
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers }
  })
}

export default function AlertsPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const t = useTranslate()
  const [alerts, setAlerts] = useState([])
  const [triggered, setTriggered] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ticker: '', condition: 'above', target_price: '', asset_type: 'stock' })
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)

  const loadAlerts = async (silent = false) => {
    if (!silent) setLoading(true)
    const r = await authFetch('/alerts/all')
    const d = await r.json()
    setAlerts(d.alerts || [])
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else loadAlerts()
    })
  }, [])

  // Auto-poll every 60 seconds silently
  useEffect(() => {
    const interval = setInterval(async () => {
      const r = await authFetch('/alerts/check', { method: 'POST' })
      const d = await r.json()
      if (d.triggered?.length > 0) {
        setTriggered(prev => [...prev, ...d.triggered])
        loadAlerts(true)
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const createAlert = async () => {
    if (!form.ticker || !form.target_price) return
    setSaving(true)
    await authFetch('/alerts', {
      method: 'POST',
      body: JSON.stringify({ ...form, target_price: parseFloat(form.target_price) })
    })
    setForm({ ticker: '', condition: 'above', target_price: '', asset_type: 'stock' })
    await loadAlerts()
    setSaving(false)
  }

  const deleteAlert = async (id) => {
    await authFetch(`/alerts/${id}`, { method: 'DELETE' })
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const checkAlerts = async () => {
    setChecking(true)
    const r = await authFetch('/alerts/check', { method: 'POST' })
    const d = await r.json()
    setTriggered(d.triggered || [])
    await loadAlerts()
    setChecking(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('alerts.title')} 🔔</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{alerts.length} {alerts.length !== 1 ? t('alerts.subtitlePlural') : t('alerts.subtitle')}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                {t('alerts.autoCheck')}
              </div>
            </div>
            <button onClick={checkAlerts} disabled={checking}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 16px', cursor: 'pointer', fontSize: '12px' }}>
              {checking ? t('alerts.checking') : t('alerts.checkNow')}
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: '700px', margin: '0 auto' }}>
          {/* Triggered alerts */}
          {triggered.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg, #0a1a0a, #0f2a0f)', border: '1px solid #22c55e', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' }}>
              <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: '8px' }}>🎯 {t('alerts.triggered')}</div>
              {triggered.map(a => (
                <div key={a.id} style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{a.ticker} hit <strong style={{color:'#22c55e'}}>${a.current_price?.toFixed(2)}</strong> — {t('alerts.targetWas')} {a.condition} ${a.target_price}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '12px', whiteSpace: 'nowrap' }}>
                    {new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Suggested test alerts */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '12px', letterSpacing: '0.05em' }}>💡 {t('alerts.suggested')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
              {[
                { ticker: 'AAPL', condition: 'below', target_price: 500, asset_type: 'stock', label: 'AAPL below $500', desc: t('alerts.triggersInstantly') },
                { ticker: 'MSFT', condition: 'below', target_price: 1000, asset_type: 'stock', label: 'MSFT below $1000', desc: t('alerts.triggersInstantly') },
                { ticker: 'BTC', condition: 'below', target_price: 200000, asset_type: 'crypto', label: 'BTC below $200k', desc: t('alerts.triggersInstantly') },
                { ticker: 'TSLA', condition: 'above', target_price: 1, asset_type: 'stock', label: 'TSLA above $1', desc: t('alerts.triggersInstantly') },
              ].map((s, i) => (
                <button key={i} onClick={() => setForm({ ticker: s.ticker, condition: s.condition, target_price: String(s.target_price), asset_type: s.asset_type })}
                  style={{ textAlign: 'left', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold-dim)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gold)' }}>{s.label}</div>
                  <div style={{ fontSize: '10px', color: '#22c55e', marginTop: '2px' }}>{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Create alert form */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>{t('alerts.newAlert')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <input placeholder={t('alerts.ticker')} value={form.ticker}
                onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                className="input" style={{ textTransform: 'uppercase' }} />
              <select value={form.asset_type} onChange={e => setForm({ ...form, asset_type: e.target.value })} className="input">
                <option value="stock">{t('assetTypes.stock')}</option>
                <option value="crypto">{t('assetTypes.crypto')}</option>
                <option value="etf">{t('assetTypes.etf')}</option>
              </select>
              <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} className="input">
                <option value="above">{t('alerts.goesAbove')}</option>
                <option value="below">{t('alerts.fallsBelow')}</option>
              </select>
              <input placeholder={t('alerts.price')} type="number" value={form.target_price}
                onChange={e => setForm({ ...form, target_price: e.target.value })}
                className="input" />
            </div>
            <button onClick={createAlert} disabled={saving || !form.ticker || !form.target_price}
              style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, opacity: (!form.ticker || !form.target_price) ? 0.5 : 1 }}>
              {saving ? t('alerts.creating') : t('alerts.create')}
            </button>
          </div>

          {/* Alerts list */}
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px', fontFamily: 'DM Mono, monospace', padding: '40px' }}>{t('common.loading')}</div>
          ) : alerts.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px', padding: '40px' }}>
              No alerts yet. Create one above to get notified when a price hits your target.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {alerts.map(alert => (
                <div key={alert.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '14px', fontWeight: 700, color: 'var(--gold)' }}>{alert.ticker}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {alert.condition === 'above' ? '↑ above' : '↓ below'} <strong style={{ color: 'var(--text-primary)' }}>${parseFloat(alert.target_price).toFixed(2)}</strong>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', background: 'var(--bg-elevated)', borderRadius: '4px', padding: '2px 8px' }}>{alert.asset_type}</div>
                  </div>
                  <button onClick={() => deleteAlert(alert.id)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-dim)', padding: '4px 10px', cursor: 'pointer', fontSize: '11px' }}>
                    {t('alerts.remove')}
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
