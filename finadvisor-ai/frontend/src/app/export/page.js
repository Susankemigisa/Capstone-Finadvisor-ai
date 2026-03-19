'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function downloadFromAPI(path, filename) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }).then(async r => {
    if (!r.ok) throw new Error('Export failed')
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  })
}

const EXPORTS = [
  {
    key: 'portfolio',
    icon: '📊',
    titleKey: 'export.exportPortfolio',
    descKey: 'export.descPortfolio',
    path: '/export/portfolio',
    color: '#c9a84c',
  },
  {
    key: 'budget',
    icon: '💰',
    titleKey: 'export.exportBudget',
    descKey: 'export.descBudget',
    path: '/export/budget',
    color: '#34d399',
  },
  {
    key: 'goals',
    icon: '🎯',
    titleKey: 'export.exportGoals',
    descKey: 'export.descGoals',
    path: '/export/goals',
    color: '#4a9eff',
  },
  {
    key: 'tax',
    icon: '🧾',
    titleKey: 'export.exportTax',
    descKey: 'export.descTax',
    path: '/export/tax',
    color: '#a78bfa',
  },
  {
    key: 'watchlist',
    icon: '👁',
    titleKey: 'export.exportWatchlist',
    descKey: 'export.descWatchlist',
    path: '/export/watchlist',
    color: '#fb923c',
  },
  {
    key: 'all',
    icon: '📦',
    titleKey: 'export.exportAll',
    descKey: 'export.descAll',
    path: '/export/all',
    color: 'var(--gold)',
    jsonOnly: true,
    featured: true,
  },
]

function ExportCard({ item, onExport, loading }) {
  const t = useTranslate()
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${item.featured ? item.color : 'var(--border)'}`,
      borderRadius: '12px', padding: '22px',
      position: 'relative', overflow: 'hidden',
    }}>
      {item.featured && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: item.color }} />
      )}

      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '16px' }}>
        <span style={{ fontSize: '28px', lineHeight: 1 }}>{item.icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{t(item.titleKey)}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: '1.5' }}>{t(item.descKey)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {!item.jsonOnly && (
          <button
            onClick={() => onExport(item, 'csv')}
            disabled={!!loading}
            style={{
              flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '8px', fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer',
              color: 'var(--text-primary)', opacity: loading === `${item.key}-csv` ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
            {loading === `${item.key}-csv` ? `⟳ ${t('export.exporting')}` : `⬇ ${t('export.csv')}`}
          </button>
        )}
        <button
          onClick={() => onExport(item, 'json')}
          disabled={!!loading}
          style={{
            flex: 1, background: item.featured ? item.color : 'var(--bg-base)',
            border: item.featured ? 'none' : '1px solid var(--border)',
            borderRadius: '8px', padding: '8px', fontSize: '13px', fontWeight: item.featured ? 700 : 400,
            cursor: loading ? 'not-allowed' : 'pointer',
            color: item.featured ? '#000' : 'var(--text-primary)',
            opacity: loading === `${item.key}-json` ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
          {loading === `${item.key}-json` ? `⟳ ${t('export.exporting')}` : `⬇ ${t('export.json')}`}
        </button>
      </div>
    </div>
  )
}

export default function ExportPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()
  const [loading, setLoading] = useState(null) // key-fmt
  const [message, setMessage] = useState('')

  useEffect(() => {
    initLang()
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
    })
  }, [])

  const handleExport = async (item, fmt) => {
    const key = `${item.key}-${fmt}`
    setLoading(key); setMessage('')
    try {
      const qs = fmt === 'csv' ? '?fmt=csv' : '?fmt=json'
      const isAll = item.key === 'all'
      const ts = new Date().toISOString().split('T')[0]
      const ext = fmt === 'csv' ? 'csv' : 'json'
      const filename = `finadvisor_${item.key}_${ts}.${ext}`
      await downloadFromAPI(`${item.path}${isAll ? '' : qs}`, filename)
      setMessage(`✓ ${t(item.titleKey)} ${t('export.success')}`)
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setMessage(`✗ ${t('export.failed')}: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  const featured = EXPORTS.filter(e => e.featured)
  const regular = EXPORTS.filter(e => !e.featured)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('export.title')}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{t('export.subtitle')}</p>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
        {/* Status message */}
        {message && (
          <div style={{
            background: message.startsWith('✓') ? 'rgba(52,211,153,0.1)' : 'var(--red-dim)',
            border: `1px solid ${message.startsWith('✓') ? 'var(--green, #34d399)' : 'var(--red, #f87171)'}`,
            borderRadius: '8px', padding: '12px 16px', marginBottom: '20px',
            fontSize: '13px', color: message.startsWith('✓') ? 'var(--green, #34d399)' : 'var(--red, #f87171)',
          }}>
            {message}
          </div>
        )}

        {/* Full export featured */}
        <div style={{ marginBottom: '24px' }}>
          {featured.map(item => (
            <ExportCard key={item.key} item={item} onExport={handleExport} loading={loading} />
          ))}
        </div>

        {/* Individual exports */}
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '16px' }}>{t('export.individual')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {regular.map(item => (
            <ExportCard key={item.key} item={item} onExport={handleExport} loading={loading} />
          ))}
        </div>

        {/* Format info */}
        <div style={{ marginTop: '32px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '12px' }}>{t('export.formatGuide')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>CSV</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                {t('export.csvDesc')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>JSON</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                {t('export.jsonDesc')}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}