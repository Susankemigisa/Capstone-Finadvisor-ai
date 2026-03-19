'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import { useThemeStore } from '@/stores/themeStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
function req(path, opts = {}) {
  const token = localStorage.getItem('access_token')
  return fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers } }).then(r => r.json())
}

export default function BillingPage() {
  const router = useRouter()
  const { user, loading: authLoading, init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()
  const [billingStatus, setBillingStatus] = useState(null)
  const [interval, setInterval_] = useState('month')
  const [loading, setLoading] = useState(null)

  useEffect(() => {
    initLang()
    initTheme()
    init().then(async () => {
      const { user } = useAuthStore.getState()
      if (!user) { router.replace('/login'); return }
      try { const status = await req('/billing/status'); setBillingStatus(status) }
      catch (e) { console.error(e) }
    })
  }, [])

  const handleUpgrade = async (plan) => {
    setLoading(plan)
    try {
      const res = await req(`/billing/checkout?plan=pro_${plan}ly`, { method: 'POST' })
      if (res.checkout_url) window.location.href = res.checkout_url
      else throw new Error(res.detail || 'Failed to create checkout')
    } catch (e) { alert(e.message) } finally { setLoading(null) }
  }

  if (authLoading || !user) return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>{t('common.loading')}</div>
      </div>
    </div>
  )

  const isPro = billingStatus?.is_pro || user?.tier === 'pro'
  const monthlyPrice = 19, yearlyPrice = 159
  const yearlySaving = Math.round(((monthlyPrice * 12 - yearlyPrice) / (monthlyPrice * 12)) * 100)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{isPro ? t('upgrade.youreOnPro') : t('upgrade.title')}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{isPro ? t('upgrade.thankYou') : t('upgrade.subtitle')}</p>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>


          {isPro ? (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold-dim)', borderRadius: '16px', padding: '40px', textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>◆</div>
              <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '14px', letterSpacing: '0.1em', marginBottom: '8px' }}>{t('upgrade.proMember')}</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{t('upgrade.unlimited')}</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px', display: 'flex', gap: '4px' }}>
                  {['month', 'year'].map((i) => (
                    <button key={i} onClick={() => setInterval_(i)}
                      style={{ padding: '8px 20px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 0.15s', background: interval === i ? 'var(--gold)' : 'transparent', color: interval === i ? '#0a0c10' : 'var(--text-secondary)' }}>
                      {i === 'year' ? `${t('upgrade.yearly').split('(')[0].trim()} (${t('upgrade.yearly').includes('save') ? `${t('upgrade.yearly').split('(')[1]?.replace(')', '') || `save ${yearlySaving}%`}` : `save ${yearlySaving}%`})` : t('upgrade.monthly')}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>{t('upgrade.free')}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '28px', fontWeight: 700 }}>$0</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{t('upgrade.foreverFree')}</div>
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    {[t('upgrade.free80msg'), t('upgrade.freeGpt4o'), t('upgrade.freeAnalytics'), t('upgrade.freeExport'), t('upgrade.freePortfolio')].map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-dim)', fontSize: '14px' }}>○</span> {f}
                      </div>
                    ))}
                  </div>
                  <button disabled style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'not-allowed' }}>
                    {t('upgrade.currentPlan')}
                  </button>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '2px solid var(--gold)', borderRadius: '16px', padding: '28px', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#0a0c10', fontSize: '10px', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                    {t('upgrade.mostPopular')}
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--gold-light)' }}>Pro</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '28px', fontWeight: 700, color: 'var(--gold)' }}>
                      ${interval === 'month' ? monthlyPrice : Math.round(yearlyPrice / 12)}
                      <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-secondary)' }}>/mo</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {interval === 'year' ? `$${yearlyPrice} ${t('upgrade.yearlyBilled')}` : t('upgrade.billedMonthly')}
                    </div>
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    {[t('upgrade.proUnlimited'), t('upgrade.proModels'), t('upgrade.proAnalytics'), t('upgrade.proSupport'), t('upgrade.proEarlyAccess'), t('upgrade.proEverything')].map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '13px' }}>
                        <span style={{ color: 'var(--gold)', fontSize: '14px' }}>◆</span> {f}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => handleUpgrade(interval)} disabled={!!loading}
                    style={{ width: '100%', background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.15s' }}>
                    {loading ? t('upgrade.redirecting') : (interval === 'year' ? t('upgrade.upgradeYearly') : t('upgrade.upgradeMonthly'))}
                  </button>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', color: 'var(--text-dim)', fontSize: '12px' }}>
            {[t('upgrade.securePayments'), t('upgrade.cancelAnytime'), t('upgrade.noHiddenFees')].map(b => (
              <span key={b}>{b}</span>
            ))}
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
