'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path) {
  const token = localStorage.getItem('access_token')
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(r => r.json())
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

// Simple bar chart using divs
function BarChart({ data, valueKey = 'tokens', labelKey = 'date', color = 'var(--gold)' }) {
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
            <div key={i} title={`${d.label}: ${d.value.toLocaleString()}`}
              style={{ flex: 1, height: `${h}px`, background: d.value > 0 ? color : 'var(--border)', borderRadius: '2px 2px 0 0', opacity: d.value > 0 ? 0.9 : 0.25, cursor: 'default', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = d.value > 0 ? '0.9' : '0.25'} />
          )
        })}
      </div>
      {/* Date labels — show every 2nd day */}
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

  const topTools = data?.tools_used ? Object.entries(data.tools_used).slice(0, 6) : []
  const topModels = data?.by_model ? Object.entries(data.by_model).sort((a, b) => b[1].requests - a[1].requests) : []

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
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => handleExport('csv')} disabled={!!exporting}
              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', padding: '8px 14px', cursor: 'pointer', fontSize: '12px', opacity: exporting === 'json' ? 0.5 : 1 }}>
              {exporting === 'csv' ? t('analytics.exporting') : '↓ Export CSV'}
            </button>
            <button onClick={() => handleExport('json')} disabled={!!exporting}
              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', padding: '8px 14px', cursor: 'pointer', fontSize: '12px', opacity: exporting === 'csv' ? 0.5 : 1 }}>
              {exporting === 'json' ? t('analytics.exporting') : '↓ Export JSON'}
            </button>
            <button onClick={fetchAnalytics}
              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', padding: '8px 14px', cursor: 'pointer', fontSize: '12px' }}>
              ↺ {t('analytics.refresh') || 'Refresh'}
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>{t('common.loading')}</div>
          ) : !data || data.total_requests === 0 ? (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>◉</div>
              <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '22px', fontStyle: 'italic', marginBottom: '8px' }}>{t('analytics.noData')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>Start chatting to see your usage stats here</p>
              <button onClick={() => router.push('/chat')}
                style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '12px 28px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
                Go to Chat →
              </button>
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
                <StatCard icon="◈" label={t('analytics.totalRequests')} value={data.total_requests.toLocaleString()} sub={`${data.sessions_count} ${t('analytics.sessions')}`} />
                <StatCard icon="◎" label={t('analytics.tokensUsed')} value={data.total_tokens >= 1000 ? `${(data.total_tokens/1000).toFixed(1)}K` : data.total_tokens.toLocaleString()}
                  sub={`${data.prompt_tokens.toLocaleString()} prompt · ${data.completion_tokens.toLocaleString()} completion`} />
                <StatCard icon="$" label={t('analytics.totalCost')} value={`$${data.total_cost_usd.toFixed(4)}`}
                  sub={`~$${(data.total_cost_usd / Math.max(data.total_requests, 1) * 100).toFixed(3)}¢ ${t('analytics.perRequest')}`}
                  color="var(--gold)" />
                <StatCard icon="⚡" label={t('analytics.avgResponse')} value={`${(data.avg_response_ms / 1000).toFixed(1)}s`} sub={t('analytics.avgResponseTime')} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* Daily activity chart */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{t('analytics.dailyRequests')}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{t('analytics.last14Days')}</span>
                  </div>
                  <BarChart data={data.daily} valueKey="requests" labelKey="date" color="var(--gold)" />
                </div>

                {/* Daily tokens chart */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{t('analytics.dailyTokens')}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>{t('analytics.last14Days')}</span>
                  </div>
                  <BarChart data={data.daily} valueKey="tokens" labelKey="date" color="#4a9eff" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* Model breakdown */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>{t('analytics.modelsUsed')}</div>
                  {topModels.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{t('analytics.noData')}</div>
                  ) : topModels.map(([model, stats]) => {
                    const pct = (stats.requests / data.total_requests) * 100
                    return (
                      <div key={model} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)' }}>{model}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{stats.requests} req · ${stats.cost.toFixed(4)}</span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gold)', borderRadius: '2px', transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Tools used */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>{t('analytics.topTools')}</div>
                  {topTools.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{t('analytics.noData')}</div>
                  ) : topTools.map(([tool, count]) => {
                    const maxCount = topTools[0][1]
                    const pct = (count / maxCount) * 100
                    return (
                      <div key={tool} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)' }}>{tool}</span>
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

              {/* LangSmith + Cache Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '12px' }}>{`◆ ${t('analytics.langsmithTracing')}`}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: data?.langsmith_enabled ? '#22c55e' : '#6b7280', flexShrink: 0 }} />
                    <span style={{ fontSize: '15px', fontWeight: 600 }}>{data?.langsmith_enabled ? t('analytics.active') : t('common.disabled')}</span>
                  </div>
                  {data?.langsmith_enabled
                    ? <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Project: <span style={{ color: 'var(--gold)' }}>{data.langsmith_project}</span></div>
                    : <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Add LANGCHAIN_API_KEY to Railway to enable</div>
                  }
                </div>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '12px' }}>{`⚡ ${t('analytics.responseCache')}`}</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--gold)', marginBottom: '4px' }}>{data?.cache_stats?.active ?? 0}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>active entries · {data?.cache_stats?.total ?? 0} total</div>
                </div>
              </div>

              {/* Export section */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Export Chat History</div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Download all your conversations from all sessions</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleExport('csv')} disabled={!!exporting}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '10px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                    {exporting === 'csv' ? 'Downloading...' : '↓ Download CSV'}
                  </button>
                  <button onClick={() => handleExport('json')} disabled={!!exporting}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '10px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                    {exporting === 'json' ? 'Downloading...' : '↓ Download JSON'}
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