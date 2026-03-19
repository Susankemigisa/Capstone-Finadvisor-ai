'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

// CHANGES:
// - Removed token counts (prompt_tokens / completion_tokens) — jargon
// - Removed cost in USD — that's our infra cost, not theirs
// - Renamed labels to plain English:
//     total_requests  → "Questions asked"
//     sessions_count  → "Conversations"
//     tokens          → removed entirely
//     avg_response_ms → "Avg response time"
// - Daily chart now shows "questions per day" not "tokens per day"
// - Model breakdown: removed cost column, shows usage % only
// - Removed LangSmith/cache panel — internal developer info
// - Export renamed: "CSV" → "Spreadsheet (.csv)", "JSON" → "Data file (.json)"

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path) {
  const token = localStorage.getItem('access_token')
  return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>{icon}</span>{label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: color || 'var(--text-primary)', marginBottom: '4px' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  )
}

function BarChart({ data, valueKey = 'requests', labelKey = 'date', color = 'var(--gold)' }) {
  const buildGrid = () => {
    const map = {}
    ;(data || []).forEach(d => { if (d[labelKey]) map[d[labelKey]] = d[valueKey] || 0 })
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label = i === 0 ? 'Today' : `${d.getMonth()+1}/${d.getDate()}`
      days.push({ date: key, label, value: map[key] || 0 })
    }
    return days
  }
  const grid = buildGrid()
  const max = Math.max(...grid.map(d => d.value)) || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px', padding: '0 2px' }}>
        {grid.map((d, i) => {
          const h = d.value > 0 ? Math.max((d.value / max) * 76, 6) : 6
          return (
            <div key={i} title={`${d.label}: ${d.value}`}
              style={{ flex: 1, height: `${h}px`, background: d.value > 0 ? color : 'var(--border)', borderRadius: '2px 2px 0 0', opacity: d.value > 0 ? 0.9 : 0.25, cursor: 'default', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = d.value > 0 ? '0.9' : '0.25'} />
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '3px', padding: '0 2px' }}>
        {grid.map((d, i) => (
          <div key={i} style={{ flex: 1, fontSize: '8px', color: i % 2 === 0 ? 'var(--text-dim)' : 'transparent', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// Friendly model display names — hide raw IDs from users
const MODEL_LABELS = {
  'gpt-4o':                     'GPT-4o',
  'gpt-4o-mini':                'GPT-4o Mini',
  'claude-3-5-sonnet-20241022': 'Claude Sonnet',
  'claude-haiku-4-5-20251001':  'Claude Haiku',
  'claude-sonnet-4-20250514':   'Claude Sonnet',
  'claude-opus-4-6':            'Claude Opus',
  'gemini-1.5-flash':           'Gemini Flash',
  'gemini-1.5-pro':             'Gemini Pro',
  'gemini-2.0-flash':           'Gemini 2.0',
  'groq-llama-3.3-70b':         'Llama 3.3',
  'groq-llama-3.1-8b-instant':  'Llama 3.1 Fast',
  'llama-3.3-70b-versatile':    'Llama 3.3',
  'llama-3.1-8b-instant':       'Llama 3.1 Fast',
}

export default function AnalyticsPage() {
  const router = useRouter()
  const t = useTranslate()
  const { user, loading: authLoading, init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(null)

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      const res = await req('/analytics/usage')
      setData(res)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else fetchAnalytics()
    })
  }, [])

  const handleExport = async (format) => {
    setExporting(format)
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${API}/analytics/export/chat?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finadvisor_chat.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { console.error(e) }
    finally { setExporting(null) }
  }

  if (authLoading || !user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>Loading...</div>
    </div>
  )

  // Top features used (renamed from "tools")
  const topFeatures = data?.tools_used
    ? Object.entries(data.tools_used)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([key, count]) => {
          // Convert tool IDs to friendly feature names
          const friendlyNames = {
            get_stock_price:    'Stock prices',
            get_crypto_price:   'Crypto prices',
            get_market_overview:'Market overview',
            get_portfolio:      'Portfolio view',
            get_budget_summary: 'Budget summary',
            calculate_roi:      'ROI calculator',
            compound_interest:  'Compound interest',
            retirement_calculator: 'Retirement planner',
            search_documents:   'Document search',
            get_financial_news: 'Financial news',
          }
          return [friendlyNames[key] || key.replace(/_/g, ' '), count]
        })
    : []

  const topModels = data?.by_model
    ? Object.entries(data.by_model).sort((a, b) => b[1].requests - a[1].requests)
    : []

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('analytics.title')}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{t('analytics.subtitle')}</p>
          </div>
          <button onClick={fetchAnalytics}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', padding: '8px 14px', cursor: 'pointer', fontSize: '12px' }}>
            ↺ Refresh
          </button>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>{t('common.loading')}</div>
          ) : !data || data.total_requests === 0 ? (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>◉</div>
              <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '22px', fontStyle: 'italic', marginBottom: '8px' }}>{t('analytics.noData')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>Start chatting to see your activity here</p>
              <button onClick={() => router.push('/chat')}
                style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '12px 28px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
                Go to Chat →
              </button>
            </div>
          ) : (
            <>
              {/* Plain-language summary stats — no tokens, no cost */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
                <StatCard icon="💬" label="Questions asked"
                  value={data.total_requests.toLocaleString()}
                  sub={`across ${data.sessions_count} conversation${data.sessions_count !== 1 ? 's' : ''}`} />
                <StatCard icon="📅" label="This month"
                  value={(data.monthly_requests ?? data.total_requests).toLocaleString()}
                  sub="questions this month" />
                <StatCard icon="⚡" label="Avg response time"
                  value={`${(data.avg_response_ms / 1000).toFixed(1)}s`}
                  sub="per question" />
              </div>

              {/* Daily activity chart — one chart, requests only */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Questions per day</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>Last 14 days</span>
                </div>
                <BarChart data={data.daily} valueKey="requests" labelKey="date" color="var(--gold)" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* AI model usage — friendly names, no cost */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>AI model used</div>
                  {topModels.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No data yet</div>
                  ) : topModels.map(([model, stats]) => {
                    const pct        = (stats.requests / data.total_requests) * 100
                    const label      = MODEL_LABELS[model] || model
                    return (
                      <div key={model} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{label}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{Math.round(pct)}%</span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gold)', borderRadius: '2px', transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Most used features — renamed from "tools" */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>Most used features</div>
                  {topFeatures.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No data yet</div>
                  ) : topFeatures.map(([feature, count]) => {
                    const maxCount = topFeatures[0][1]
                    const pct      = (count / maxCount) * 100
                    return (
                      <div key={feature} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{feature}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{count}×</span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#4a9eff', borderRadius: '2px', transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Export section — renamed buttons */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Download your chat history</div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Export all your conversations from every session</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleExport('csv')} disabled={!!exporting}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '10px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                    {exporting === 'csv' ? 'Downloading...' : '↓ Spreadsheet (.csv)'}
                  </button>
                  <button onClick={() => handleExport('json')} disabled={!!exporting}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '10px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                    {exporting === 'json' ? 'Downloading...' : '↓ Data file (.json)'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
