'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const REFRESH_INTERVAL = 30

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
}

async function apiFetch(path, opts = {}) {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  })
  let data
  try { data = await res.json() } catch { data = {} }
  if (!res.ok) throw new Error(data?.detail || data?.message || `Error ${res.status}`)
  return data
}

function ChangeChip({ pct }) {
  const up = pct >= 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 8px', borderRadius: '20px', fontSize: '12px',
      fontFamily: 'DM Mono, monospace',
      background: up ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
      color: up ? '#34d399' : '#f87171',
    }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  )
}

export default function WatchlistPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [ticker, setTicker] = useState('')
  const [assetType, setAssetType] = useState('stock')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)


  const secondsLeft = useRef(REFRESH_INTERVAL)
  const intervalRef = useRef(null)

  // Use a ref for the fetch function so the interval never holds a stale closure
  const fetchRef = useRef(null)
  fetchRef.current = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await apiFetch('/watchlist')
      if (data && Array.isArray(data.watchlist)) {
        setItems(data.watchlist)
        setLastUpdated(new Date())

      }
    } catch (e) {
      if (!silent) setError(e.message || 'Failed to load watchlist')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const startTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    secondsLeft.current = REFRESH_INTERVAL
    setCountdown(REFRESH_INTERVAL)
    intervalRef.current = setInterval(() => {
      secondsLeft.current -= 1
      setCountdown(secondsLeft.current)
      if (secondsLeft.current <= 0) {
        secondsLeft.current = REFRESH_INTERVAL
        setCountdown(REFRESH_INTERVAL)
        fetchRef.current(true)
      }
    }, 1000)
  }

  useEffect(() => {
    initLang()
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) { router.replace('/login'); return }
      fetchRef.current(false).then(() => startTimer())
    })
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, []) // eslint-disable-line

  const handleAdd = async () => {
    if (!ticker.trim()) return
    setAdding(true); setError('')
    try {
      const data = await apiFetch('/watchlist', {
        method: 'POST',
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase(), asset_type: assetType }),
      })
      if (data.success) { setTicker(''); await fetchRef.current(true); startTimer() }
      else setError(data.detail || data.message || 'Failed to add ticker')
    } catch (e) { setError(e.message || 'Failed to add ticker') }
    setAdding(false)
  }

  const handleRemove = async (tickerSymbol) => {
    try {
      await apiFetch(`/watchlist/${tickerSymbol}`, { method: 'DELETE' })
      setItems(prev => prev.filter(i => i.ticker !== tickerSymbol))
    } catch {}
  }

  const handleManualRefresh = async () => {
    setRefreshing(true); setError('')
    await fetchRef.current(false)
    startTimer()
    setRefreshing(false)
  }

  const formatTime = (date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>

        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>
                {t('watchlist.title')}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Auto-refreshing every {REFRESH_INTERVAL}s</span>
                </div>
                {lastUpdated && (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    · updated {formatTime(lastUpdated)} · next in {countdown}s
                  </span>
                )}
              </div>
            </div>
            <button onClick={handleManualRefresh} disabled={refreshing}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
              {refreshing ? t('watchlist.refreshing') : t('watchlist.refreshPrices')}
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.05em' }}>{t('watchlist.addSection')}</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                style={{ flex: 1, minWidth: '160px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 14px', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'DM Mono, monospace', outline: 'none' }}
                placeholder={t('watchlist.tickerPlaceholder')} value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <select value={assetType} onChange={e => setAssetType(e.target.value)}
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', outline: 'none' }}>
                <option value="stock">{t('assetTypes.stock')}</option>
                <option value="crypto">{t('assetTypes.crypto')}</option>
                <option value="etf">{t('assetTypes.etf')}</option>
                <option value="commodity">{t('assetTypes.commodity')}</option>
              </select>
              <button onClick={handleAdd} disabled={adding || !ticker.trim()}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.7 : 1 }}>
                {adding ? t('watchlist.adding') : t('watchlist.add')}
              </button>
            </div>
            {error && <div style={{ marginTop: '8px', color: '#f87171', fontSize: '13px' }}>{error}</div>}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>{t('watchlist.loading')}</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>👁</div>
              <div style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '6px' }}>{t('watchlist.empty')}</div>
              <div style={{ fontSize: '13px' }}>{t('watchlist.emptyHint')}</div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                {[t('watchlist.ticker'), t('watchlist.type'), t('watchlist.price'), t('watchlist.change'), ''].map((h, i) => (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{h}</div>
                ))}
              </div>
              {items.map((item, i) => (
                <div key={item.id || item.ticker}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '12px', padding: '14px 20px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{item.ticker}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{item.asset_type}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '14px', color: 'var(--text-primary)' }}>
                    {item.price != null ? `$${Number(item.price).toLocaleString()}` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </div>
                  <div>
                    {item.price != null ? <ChangeChip pct={item.change_pct || 0} /> : <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>}
                  </div>
                  <button onClick={() => handleRemove(item.ticker)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}>
                    {t('watchlist.remove')}
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