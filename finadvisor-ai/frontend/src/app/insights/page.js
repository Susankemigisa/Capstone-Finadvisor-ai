'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
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

function fmt(n, currency = 'UGX') {
  if (n === null || n === undefined) return '—'
  const c = Math.abs(n)
  if (c >= 1_000_000_000) return `${n < 0 ? '-' : ''}${(c / 1_000_000_000).toFixed(1)}B`
  if (c >= 1_000_000) return `${n < 0 ? '-' : ''}${(c / 1_000_000).toFixed(1)}M`
  if (c >= 1_000) return `${n < 0 ? '-' : ''}${(c / 1_000).toFixed(0)}K`
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function HealthScoreRing({ score }) {
  const color = score >= 75 ? '#34d399' : score >= 50 ? '#c9a84c' : score >= 25 ? '#fb923c' : '#f87171'
  const label = score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : score >= 25 ? 'Fair' : 'Needs Work'
  const size = 140, r = 54, circ = 2 * Math.PI * r
  const fill = (score / 100) * circ * 0.75 // 3/4 arc
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-base)" strokeWidth={10}
            strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeLinecap="round" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '32px', fontWeight: 700, color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>/100</div>
        </div>
      </div>
      <div style={{ fontSize: '14px', fontWeight: 600, color }}>{label}</div>
    </div>
  )
}

function SpendingBar({ category, amount, total, color }) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px' }}>
        <span style={{ color: 'var(--text-primary)' }}>{category}</span>
        <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>
          {fmt(amount)} <span style={{ color: 'var(--text-dim)' }}>· {pct.toFixed(0)}%</span>
        </span>
      </div>
      <div style={{ background: 'var(--bg-base)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

const CAT_COLORS = ['#c9a84c','#4a9eff','#34d399','#f87171','#a78bfa','#fb923c','#38bdf8','#f472b6','#6ee7b7','#fbbf24']

function calcHealthScore({ savingsRate, goalProgress, hasEmergencyFund, debtRatio, budgetEntries }) {
  let score = 0
  // Savings rate (0-30 pts): 20%+ = full marks
  if (savingsRate >= 20) score += 30
  else if (savingsRate >= 10) score += 20
  else if (savingsRate >= 5) score += 10
  else if (savingsRate > 0) score += 5
  // Goal progress (0-25 pts)
  if (goalProgress >= 75) score += 25
  else if (goalProgress >= 50) score += 18
  else if (goalProgress >= 25) score += 10
  else if (goalProgress > 0) score += 5
  // Emergency fund (0-20 pts)
  if (hasEmergencyFund) score += 20
  // Budget tracking (0-15 pts)
  if (budgetEntries >= 10) score += 15
  else if (budgetEntries >= 5) score += 10
  else if (budgetEntries >= 1) score += 5
  // Low debt ratio (0-10 pts)
  if (debtRatio === 0) score += 10
  else if (debtRatio < 0.2) score += 7
  else if (debtRatio < 0.4) score += 3
  return Math.min(Math.round(score), 100)
}

export default function InsightsPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [portfolio, budget, goals, pockets] = await Promise.all([
      req('/portfolio').catch(() => ({ summary: null, positions: [] })),
      req('/budget').catch(() => ({ summary: { income: 0, expenses: 0 }, entries: [] })),
      req('/goals').catch(() => ({ goals: [] })),
      req('/savings/pockets').catch(() => ({ pockets: [] })),
    ])
    setData({ portfolio, budget, goals, pockets })
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

  if (loading) return (
    <PageShell title="Financial Insights">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Calculating your financial picture...</div>
      </div>
    </div>
  )

  // ── Calculations ──────────────────────────────────────────
  const portfolioValue = data?.portfolio?.summary?.total_value || 0
  const savingsTotal = (data?.pockets?.pockets || []).reduce((s, p) => s + (p.current_amount || 0), 0)
  const income = data?.budget?.summary?.income || 0
  const expenses = data?.budget?.summary?.expenses || 0
  const netWorth = portfolioValue + savingsTotal
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0
  const goals = data?.goals?.goals || []
  const goalProgress = goals.length > 0
    ? goals.reduce((s, g) => s + Math.min((g.current_amount / g.target_amount) * 100, 100), 0) / goals.length
    : 0
  const hasEmergencyFund = (data?.pockets?.pockets || []).some(p =>
    p.name.toLowerCase().includes('emergency') && p.current_amount > 0
  )
  const entries = data?.budget?.entries || []

  const healthScore = calcHealthScore({
    savingsRate: Math.max(savingsRate, 0),
    goalProgress,
    hasEmergencyFund,
    debtRatio: 0,
    budgetEntries: entries.length,
  })

  // Spending by category
  const expenseEntries = entries.filter(e => e.entry_type === 'expense')
  const byCategory = {}
  expenseEntries.forEach(e => {
    const cat = e.category || 'Other'
    byCategory[cat] = (byCategory[cat] || 0) + parseFloat(e.amount)
  })
  const sortedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // Insights
  const insights = []
  if (savingsRate < 10 && income > 0) insights.push({ type: 'warning', text: `Your savings rate is ${savingsRate.toFixed(1)}%. Financial advisors recommend saving at least 20% of income.` })
  if (savingsRate >= 20) insights.push({ type: 'success', text: `Great job! You're saving ${savingsRate.toFixed(1)}% of your income — above the recommended 20%.` })
  if (!hasEmergencyFund) insights.push({ type: 'warning', text: 'You don\'t have an emergency fund pocket yet. Create one targeting 3–6 months of expenses.' })
  if (hasEmergencyFund) insights.push({ type: 'success', text: 'You have an emergency fund — one of the most important financial safety nets.' })
  if (expenses > income && income > 0) insights.push({ type: 'danger', text: `You're spending ${fmt(expenses - income)} more than you earn this month. Review your expenses.` })
  const topCat = sortedCats[0]
  if (topCat && expenses > 0) insights.push({ type: 'info', text: `Your biggest expense category is ${topCat[0]} at ${((topCat[1]/expenses)*100).toFixed(0)}% of total spending.` })
  if (goals.length === 0) insights.push({ type: 'info', text: 'Set financial goals to give your savings purpose and track progress.' })
  const nearGoals = goals.filter(g => g.target_amount > 0 && (g.current_amount / g.target_amount) >= 0.8 && g.current_amount < g.target_amount)
  if (nearGoals.length > 0) insights.push({ type: 'success', text: `You're close! "${nearGoals[0].goal_name}" is ${((nearGoals[0].current_amount/nearGoals[0].target_amount)*100).toFixed(0)}% complete.` })

  const insightColors = { success: '#34d399', warning: '#c9a84c', danger: '#f87171', info: '#4a9eff' }
  const insightBg = { success: '#052e16', warning: '#1a1200', danger: '#2d0a0a', info: '#0c1a2e' }

  return (
    <PageShell title="Financial Insights">
      <>
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ paddingBottom: '16px' }}>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>Financial Insights</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Your complete financial picture — net worth, health score, and spending patterns</p>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>

            {/* Net Worth */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', gridColumn: '1 / 2' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '12px' }}>NET WORTH</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '32px', fontWeight: 700, color: netWorth >= 0 ? 'var(--gold)' : '#f87171', marginBottom: '16px' }}>
                {fmt(netWorth)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'Portfolio', value: portfolioValue, color: '#4a9eff' },
                  { label: 'Savings pockets', value: savingsTotal, color: '#34d399' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, display: 'inline-block' }} />
                      {label}
                    </span>
                    <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)' }}>{fmt(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Health Score */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '16px', textAlign: 'center' }}>FINANCIAL HEALTH SCORE</div>
              <HealthScoreRing score={healthScore} />
              <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5 }}>
                Based on savings rate, goal progress, emergency fund & budget tracking
              </div>
            </div>

            {/* This month */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '12px' }}>THIS MONTH</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Income', value: income, color: '#34d399' },
                  { label: 'Expenses', value: expenses, color: '#f87171' },
                  { label: 'Net', value: income - expenses, color: income >= expenses ? '#34d399' : '#f87171' },
                  { label: 'Savings rate', value: `${Math.max(savingsRate, 0).toFixed(1)}%`, color: savingsRate >= 20 ? '#34d399' : savingsRate >= 10 ? '#c9a84c' : '#f87171', raw: true },
                ].map(({ label, value, color, raw }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '14px', fontWeight: 600, color }}>
                      {raw ? value : fmt(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {/* Spending breakdown */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '16px' }}>SPENDING BY CATEGORY</div>
              {sortedCats.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                  Log some expenses to see your spending breakdown
                </div>
              ) : sortedCats.map(([cat, amount], i) => (
                <SpendingBar key={cat} category={cat} amount={amount} total={expenses} color={CAT_COLORS[i % CAT_COLORS.length]} />
              ))}
            </div>

            {/* AI Insights */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '16px' }}>AI INSIGHTS</div>
              {insights.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '13px' }}>
                  Add more data (budget entries, goals, savings) to get personalised insights
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {insights.slice(0, 5).map((insight, i) => (
                    <div key={i} style={{ background: insightBg[insight.type], border: `1px solid ${insightColors[insight.type]}44`, borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <span style={{ color: insightColors[insight.type], marginRight: '6px' }}>
                        {insight.type === 'success' ? '✅' : insight.type === 'warning' ? '⚠️' : insight.type === 'danger' ? '🔴' : 'ℹ️'}
                      </span>
                      {insight.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Goals progress */}
          {goals.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '16px' }}>GOALS PROGRESS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                {goals.map((g, i) => {
                  const pct = g.target_amount > 0 ? Math.min((g.current_amount / g.target_amount) * 100, 100) : 0
                  const color = CAT_COLORS[i % CAT_COLORS.length]
                  return (
                    <div key={g.id} style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{g.goal_name || g.name}</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px', color, fontWeight: 700 }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ background: 'var(--bg-base)', borderRadius: '4px', height: '5px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px' }}>
                        {fmt(g.current_amount || 0)} of {fmt(g.target_amount)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </>
    </PageShell>
  )
}