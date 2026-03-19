'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import { useThemeStore } from '@/stores/themeStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
function req(path, opts = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers } }).then(r => r.json())
}

function DonutChart({ positions, allocLabel }) {
  if (!positions.length) return null
  const total = positions.reduce((s, p) => s + p.current_value, 0)
  if (!total) return null
  const COLORS = ['#c9a84c','#4a9eff','#34d399','#f87171','#a78bfa','#fb923c','#38bdf8','#f472b6']
  const slices = positions.slice(0, 8).reduce((acc, p, i) => {
    const pct = p.current_value / total, angle = pct * 360, startAngle = acc.cumAngle
    const r = 60, cx = 80, cy = 80, toRad = (d) => (d * Math.PI) / 180
    const x1 = cx + r * Math.cos(toRad(startAngle)), y1 = cy + r * Math.sin(toRad(startAngle))
    const x2 = cx + r * Math.cos(toRad(startAngle + angle)), y2 = cy + r * Math.sin(toRad(startAngle + angle))
    acc.slices.push({ path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${angle > 180 ? 1 : 0},1 ${x2},${y2} Z`, color: COLORS[i % COLORS.length], ticker: p.ticker, pct: pct * 100 })
    acc.cumAngle += angle
    return acc
  }, { cumAngle: -90, slices: [] }).slices
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
      <svg width={160} height={160}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity={0.85} />)}
        <circle cx={80} cy={80} r={36} fill="var(--bg-surface)" />
        <text x={80} y={76} textAnchor="middle" fill="var(--text-secondary)" fontSize={10} fontFamily="DM Mono">{allocLabel || 'ALLOC'}</text>
        <text x={80} y={92} textAnchor="middle" fill="var(--text-primary)" fontSize={12} fontFamily="DM Mono" fontWeight={600}>{positions.length}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500, minWidth: '48px', fontFamily: 'DM Mono, monospace' }}>{s.ticker}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>{icon}</span>{label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: color || 'var(--text-primary)', marginBottom: '4px' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  )
}

function AddPositionModal({ onClose, onAdd }) {
  const t = useTranslate()
  const [form, setForm] = useState({ ticker: '', shares: '', avg_buy_price: '', asset_type: 'stock' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (!form.ticker || !form.shares || !form.avg_buy_price) { setError('All fields required'); return }
    setLoading(true); setError('')
    try {
      const res = await req('/portfolio/positions', { method: 'POST', body: JSON.stringify({ ...form, shares: parseFloat(form.shares), avg_buy_price: parseFloat(form.avg_buy_price) }) })
      if (res.success) { onAdd(); onClose() } else setError(res.detail || 'Failed')
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '20px', fontStyle: 'italic', marginBottom: '20px' }}>{t('portfolio.addPosition')}</h2>
        {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: 'var(--red)', marginBottom: '14px' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{t('portfolio.tickerSymbol')}</label>
            <input className="input" value={form.ticker} onChange={e => setForm({...form, ticker: e.target.value.toUpperCase()})} placeholder={t('portfolio.tickerPlaceholder')} style={{ fontFamily: 'DM Mono, monospace' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{t('portfolio.sharesUnits')}</label>
              <input className="input" type="number" value={form.shares} onChange={e => setForm({...form, shares: e.target.value})} placeholder="10" />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{t('portfolio.avgBuyPrice')}</label>
              <input className="input" type="number" value={form.avg_buy_price} onChange={e => setForm({...form, avg_buy_price: e.target.value})} placeholder="150.00" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{t('portfolio.assetType')}</label>
            <select className="input" value={form.asset_type} onChange={e => setForm({...form, asset_type: e.target.value})} style={{ cursor: 'pointer' }}>
              <option value="stock">{t('assetTypes.stock')}</option><option value="crypto">{t('assetTypes.crypto')}</option><option value="etf">{t('assetTypes.etf')}</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', padding: '10px', cursor: 'pointer', fontSize: '13px' }}>{t('settings.cancel')}</button>
            <button onClick={submit} disabled={loading} style={{ flex: 2, background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '10px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
              {loading ? t('portfolio.adding') : t('portfolio.addPosition')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const router = useRouter()
  const t = useTranslate()
  const { user, loading: authLoading, init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const fetchPortfolio = useCallback(async () => {
    setLoading(true); setError(null)
    try { const res = await req('/portfolio/'); if (res.detail) throw new Error(res.detail); setData(res) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    initLang()
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else fetchPortfolio()
    })
  }, [])

  const deletePosition = async (id) => {
    setDeletingId(id)
    try { await req(`/portfolio/positions/${id}`, { method: 'DELETE' }); fetchPortfolio() }
    catch (e) { console.error(e) } finally { setDeletingId(null) }
  }

  if (authLoading || !user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>{t('common.loading')}</div>
    </div>
  )

  const summary = data?.summary, positions = data?.positions || [], pnlPositive = (summary?.total_pnl || 0) >= 0
  const fmt = (n) => { const abs = Math.abs(n || 0), p = (n || 0) < 0 ? '-' : ''; return abs >= 1e6 ? `${p}$${(abs/1e6).toFixed(2)}M` : abs >= 1000 ? `${p}$${(abs/1000).toFixed(1)}K` : `${p}$${abs.toFixed(2)}` }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('portfolio.title')}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{t('portfolio.subtitle')}</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={fetchPortfolio} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', padding: '8px 14px', cursor: 'pointer', fontSize: '12px' }}>↺ {t('portfolio.refresh')}</button>
              <button onClick={() => setShowAdd(true)} style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>{t('portfolio.addPosition')}</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {loading && <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>{t('common.loading')}</div>}
          {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '10px', padding: '16px', color: 'var(--red)', fontSize: '13px', marginBottom: '20px' }}>{error}</div>}
          {!loading && !error && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
                <StatCard icon="◎" label={t('portfolio.portfolioValue')} value={fmt(summary?.total_value)} sub={`${summary?.position_count || 0} ${t('portfolio.positions')}`} />
                <StatCard icon="◈" label={t('portfolio.totalInvested')} value={fmt(summary?.total_invested)} />
                <StatCard icon={pnlPositive ? '▲' : '▼'} label={t('portfolio.totalPnl')}
                  value={`${pnlPositive ? '+' : ''}${fmt(summary?.total_pnl)}`}
                  sub={`${pnlPositive ? '+' : ''}${(summary?.total_pnl_pct || 0).toFixed(2)}%`}
                  color={pnlPositive ? 'var(--green)' : 'var(--red)'} />
                <StatCard icon="◉" label={t('portfolio.return')} value={`${pnlPositive ? '+' : ''}${(summary?.total_pnl_pct || 0).toFixed(2)}%`}
                  sub={pnlPositive ? t('portfolio.profitable') : t('portfolio.atLoss')}
                  color={pnlPositive ? 'var(--green)' : 'var(--red)'} />
              </div>

              {positions.length === 0 ? (
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>◎</div>
                  <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '22px', fontStyle: 'italic', marginBottom: '8px' }}>{t('portfolio.emptyTitle')}</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>{t('portfolio.emptyDesc')}</p>
                  <button onClick={() => setShowAdd(true)} style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '12px 28px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>{t('portfolio.addFirst')}</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{t('portfolio.holdings')}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{t('portfolio.livePrices')}</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {[t('portfolio.asset'), t('portfolio.shares'), t('portfolio.avgPrice'), t('portfolio.current'), t('portfolio.value'), 'P&L', t('portfolio.day') || 'Day', ''].map(h => (
                              <th key={h} style={{ padding: '10px 16px', textAlign: h === '' ? 'center' : 'left', fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map((pos) => {
                            const pp = pos.pnl >= 0, dp = pos.day_change >= 0
                            return (
                              <tr key={pos.id} style={{ borderBottom: '1px solid var(--border)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={{ padding: '14px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--gold)' }}>{pos.ticker.slice(0, 2)}</div>
                                    <div>
                                      <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>{pos.ticker}</div>
                                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{pos.asset_type}</div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '14px 16px', fontSize: '13px', fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>{pos.shares}</td>
                                <td style={{ padding: '14px 16px', fontSize: '13px', fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>${pos.avg_buy_price.toLocaleString()}</td>
                                <td style={{ padding: '14px 16px', fontSize: '13px', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>${pos.current_price.toLocaleString()}</td>
                                <td style={{ padding: '14px 16px', fontSize: '13px', fontFamily: 'DM Mono, monospace' }}>{fmt(pos.current_value)}</td>
                                <td style={{ padding: '14px 16px' }}>
                                  <div style={{ fontSize: '13px', fontFamily: 'DM Mono, monospace', color: pp ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{pp ? '+' : ''}{fmt(pos.pnl)}</div>
                                  <div style={{ fontSize: '10px', color: pp ? 'var(--green)' : 'var(--red)' }}>{pp ? '+' : ''}{pos.pnl_pct.toFixed(2)}%</div>
                                </td>
                                <td style={{ padding: '14px 16px' }}>
                                  <span style={{ fontSize: '12px', fontFamily: 'DM Mono, monospace', color: dp ? 'var(--green)' : 'var(--red)' }}>{dp ? '▲' : '▼'} {Math.abs(pos.day_change_pct).toFixed(2)}%</span>
                                </td>
                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                  <button onClick={() => deletePosition(pos.id)} disabled={deletingId === pos.id}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px', opacity: deletingId === pos.id ? 0.4 : 0.6, padding: '4px 8px' }}
                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}>✕</button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>{t('portfolio.allocation')}</div>
                      <DonutChart positions={positions} allocLabel={t('portfolio.allocation').toUpperCase()} />
                    </div>
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '14px' }}>{t('portfolio.quickAnalysis')}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                          { label: t('portfolio.riskScore'), prompt: 'Calculate my portfolio risk score' },
                          { label: t('portfolio.diversification'), prompt: 'Analyze my portfolio diversification' },
                          { label: t('portfolio.rebalancing'), prompt: 'Should I rebalance my portfolio?' },
                          { label: t('portfolio.topPerformer'), prompt: 'Which of my holdings is performing best?' },
                        ].map((a) => (
                          <button key={a.label} onClick={() => { localStorage.setItem('pending_prompt', a.prompt); router.push('/chat') }}
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', transition: 'all 0.1s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
                            {a.label} →
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
      {showAdd && <AddPositionModal onClose={() => setShowAdd(false)} onAdd={fetchPortfolio} />}
    </div>
  )
}