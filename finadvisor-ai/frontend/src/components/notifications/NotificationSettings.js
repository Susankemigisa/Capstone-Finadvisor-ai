'use client'
import { useState, useEffect } from 'react'
import { useTranslate, useLangStore } from '@/stores/langStore'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path, opts = {}) {
  const token = localStorage.getItem('access_token')
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers }
  }).then(r => r.json())
}

export default function NotificationSettings() {
  const t = useTranslate()
  useLangStore() // subscribe to store so component re-renders on lang change
  const [prefs, setPrefs] = useState({
    email_market_alerts: true,
    email_portfolio_summary: true,
    email_weekly_report: true,
    push_enabled: false,
    push_price_alerts: true,
  })
  const [pushSupported, setPushSupported] = useState(false)
  const [pushStatus, setPushStatus] = useState('idle')
  const [emailStatus, setEmailStatus] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window)
    req('/notifications/preferences').then(data => {
      if (!data.error) setPrefs(p => ({ ...p, ...data }))
    }).catch(() => {})
  }, [])

  const handleToggle = (key) => setPrefs(p => ({ ...p, [key]: !p[key] }))

  const savePrefs = async () => {
    setSaving(true)
    try { await req('/notifications/preferences', { method: 'POST', body: JSON.stringify(prefs) }) }
    finally { setSaving(false) }
  }

  const enablePush = async () => {
    setPushStatus('requesting')
    try {
      await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setPushStatus('denied'); return }
      setPrefs(p => ({ ...p, push_enabled: true }))
      setPushStatus('granted')
    } catch (e) { setPushStatus('denied') }
  }

  const sendTestEmail = async () => {
    setEmailStatus('sending')
    const res = await req('/notifications/test-email', { method: 'POST' })
    setEmailStatus(res.sent ? 'sent' : 'failed')
    setTimeout(() => setEmailStatus(null), 4000)
  }

  const Toggle = ({ value, onChange }) => (
    <button onClick={onChange}
      style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', background: value ? 'var(--gold)' : 'var(--bg-elevated)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: value ? '#0a0c10' : 'var(--text-dim)', position: 'absolute', top: '3px', left: value ? '19px' : '3px', transition: 'left 0.2s' }} />
    </button>
  )

  const Row = ({ label, sub, value, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: '13px' }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>{sub}</div>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('settings.emailNotifications') || 'Email Notifications'}
          </h3>
          <button onClick={sendTestEmail} disabled={emailStatus === 'sending'}
            style={{ fontSize: '11px', color: 'var(--gold)', background: 'none', border: '1px solid var(--gold-dim)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
            {emailStatus === 'sending' ? (t('settings.sending') || 'Sending...') : emailStatus === 'sent' ? '✓ Sent!' : emailStatus === 'failed' ? '✕ Failed' : (t('settings.sendTest') || 'Send test')}
          </button>
        </div>
        <Row label={t('settings.marketAlerts') || 'Market alerts'} sub={t('settings.marketAlertsSub') || 'Major market movements'} value={prefs.email_market_alerts} onChange={() => handleToggle('email_market_alerts')} />
        <Row label={t('settings.portfolioSummary') || 'Portfolio summary'} sub={t('settings.portfolioSummarySub') || 'Daily P&L updates'} value={prefs.email_portfolio_summary} onChange={() => handleToggle('email_portfolio_summary')} />
        <Row label={t('settings.weeklyReport') || 'Weekly report'} sub={t('settings.weeklyReportSub') || 'Financial digest every Monday'} value={prefs.email_weekly_report} onChange={() => handleToggle('email_weekly_report')} />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          {t('settings.pushNotifications') || 'Browser Push Notifications'}
        </h3>
        {!pushSupported ? (
          <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{t('settings.pushNotSupported') || 'Not supported in this browser.'}</p>
        ) : prefs.push_enabled || pushStatus === 'granted' ? (
          <Row label={t('settings.priceAlerts') || 'Price alerts'} sub={t('settings.priceAlertsSub') || 'Notify when stocks hit targets'} value={prefs.push_price_alerts} onChange={() => handleToggle('push_price_alerts')} />
        ) : (
          <div style={{ padding: '16px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{t('settings.pushDesc') || "Get real-time alerts even when you're not on the app."}</p>
            {pushStatus === 'denied' ? (
              <p style={{ fontSize: '12px', color: 'var(--red)' }}>{t('settings.pushDenied') || 'Permission denied. Enable in browser settings.'}</p>
            ) : (
              <button onClick={enablePush}
                style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                {pushStatus === 'requesting' ? (t('settings.requesting') || 'Requesting...') : (t('settings.enablePush') || 'Enable Push Notifications')}
              </button>
            )}
          </div>
        )}
      </div>

      <button onClick={savePrefs} disabled={saving}
        style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? (t('settings.saving') || 'Saving...') : (t('settings.savePreferences') || 'Save Preferences')}
      </button>
    </div>
  )
}
