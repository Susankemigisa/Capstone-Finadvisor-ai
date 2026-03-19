'use client'
import NotificationSettings from '@/components/notifications/NotificationSettings'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate, SUPPORTED_LANGUAGES } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const PROVIDERS = [
  { name: 'OpenAI', color: '#10a37f', models: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast & affordable · Recommended' },
    { id: 'gpt-4o',      label: 'GPT-4o',      desc: 'Most capable OpenAI model' },
  ]},
  { name: 'Anthropic', color: '#c9a84c', models: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku',  desc: 'Fastest Claude model' },
    { id: 'claude-sonnet-4-20250514',  label: 'Claude Sonnet', desc: 'Balanced · Recommended' },
    { id: 'claude-opus-4-6',           label: 'Claude Opus',   desc: 'Most powerful' },
  ]},
  { name: 'Google', color: '#4285f4', models: [
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: 'Fast & efficient · Recommended' },
    { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   desc: 'Most capable Gemini' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Latest generation' },
  ]},
  { name: 'Groq', color: '#f55036', models: [
    { id: 'groq-llama-3.1-8b-instant', label: 'Llama 3.1 8B',  desc: 'Ultra fast' },
    { id: 'groq-llama-3.3-70b',        label: 'Llama 3.3 70B', desc: 'Powerful · Recommended' },
    { id: 'groq-mixtral-8x7b',         label: 'Mixtral 8x7B',  desc: 'Great for finance' },
  ]},
]

const CURRENCIES = ['USD','EUR','GBP','UGX','KES','NGN','ZAR','JPY','CAD','AUD','INR','BRL','GHS','TZS','EGP']

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : '18px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: hint ? '3px' : '8px' }}>{label}</label>
      {hint && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{hint}</p>}
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, loading, init, updateProfile, logout } = useAuthStore()
  const { theme, setTheme, init: initTheme } = useThemeStore()
  const t = useTranslate()
  const { lang, setLang, init: initLang } = useLangStore()

  const [form, setForm] = useState({
    full_name: '', preferred_name: '',
    preferred_model: 'gpt-4o-mini', preferred_currency: 'USD', preferred_language: 'en', temperature: 0.3, top_p: 1.0
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tools, setTools] = useState([])
  const [enabledTools, setEnabledTools] = useState([])
  const [toolsLoading, setToolsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showDelete, setShowDelete] = useState(false)
  const [expandedProvider, setExpandedProvider] = useState('OpenAI')

  useEffect(() => {
    // Load tool registry
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (token) {
      setToolsLoading(true)
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      fetch(`${API}/chat/tools`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(d => {
        setTools(d.tools || [])
        setEnabledTools(d.enabled || [])
      }).catch(() => {}).finally(() => setToolsLoading(false))
    }
  }, [])

  useEffect(() => {
    initTheme()
    initLang()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) { router.replace('/login'); return }
      const model = user.preferred_model || 'gpt-4o-mini'
      const temp = user.temperature ?? 0.3
      const tp = user.top_p ?? 1.0
      setExpandedProvider(PROVIDERS.find(p => p.models.some(m => m.id === model))?.name || 'OpenAI')
      setForm({
        full_name: user.full_name || '',
        preferred_name: user.preferred_name || '',
        preferred_model: model,
        temperature: temp,
        top_p: tp,
        preferred_currency: user.preferred_currency || 'USD',
        preferred_language: user.preferred_language || (typeof window !== 'undefined' ? localStorage.getItem('lang') : null) || 'en',
      })
    })
  }, [])

  const handleSaveTools = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      if (!token) return
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chat/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled_tools: enabledTools })
      })
    } catch (e) {
      console.warn('Tools save failed (non-critical):', e)
    }
  }

  const toggleTool = (id) => {
    setEnabledTools(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false)
    try {
      await updateProfile(form)
      await handleSaveTools()
      // Always apply language to ensure store and localStorage stay in sync
      await setLang(form.preferred_language)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading || !user) return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>{t('common.loading')}</div>
      </div>
    </div>
  )

  const currentModel = PROVIDERS.flatMap(p => p.models).find(m => m.id === form.preferred_model)
  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === form.preferred_language)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('settings.title')}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{t('settings.subtitle')}</p>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ maxWidth: '580px', margin: '0 auto' }}>

          {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: 'var(--red)', marginBottom: '16px' }}>{error}</div>}

          <Section title={t('settings.profile')}>
            <Field label={t('settings.fullName')}>
              <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label={t('settings.preferredName')} hint={t('settings.preferredNameHint')}>
              <input className="input" value={form.preferred_name} onChange={(e) => setForm({ ...form, preferred_name: e.target.value })} placeholder={t('settings.preferredNamePlaceholder')} />
            </Field>
            <Field label={t('settings.email')} last>
              <input className="input" value={user.email} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} />
            </Field>
          </Section>

          <Section title={t('settings.appearance')}>
            <Field label={t('settings.theme')} hint={t('settings.themeHint')} last>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { value: 'dark', label: t('settings.dark'), desc: t('settings.darkDesc') },
                  { value: 'light', label: t('settings.light'), desc: t('settings.lightDesc') }
                ].map((th) => (
                  <button key={th.value} onClick={() => setTheme(th.value)}
                    style={{ padding: '12px 16px', borderRadius: '8px', border: `2px solid ${theme === th.value ? 'var(--gold)' : 'var(--border)'}`, background: theme === th.value ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: theme === th.value ? 'var(--gold-light)' : 'var(--text-primary)' }}>{th.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>{th.desc}</div>
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          <Section title={t('settings.aiPreferences')}>
            <Field label={t('settings.aiModel')} hint={t('settings.aiModelHint')}>
              {PROVIDERS.map((provider) => {
                const isOpen = expandedProvider === provider.name
                const hasActive = provider.models.some(m => m.id === form.preferred_model)
                return (
                  <div key={provider.name} style={{ marginBottom: '8px', border: `1px solid ${hasActive ? 'var(--gold-dim)' : 'var(--border)'}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button onClick={() => setExpandedProvider(isOpen ? null : provider.name)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: isOpen ? 'var(--bg-elevated)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: provider.color }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{provider.name}</span>
                        {hasActive && <span style={{ fontSize: '10px', background: 'var(--gold-dim)', color: 'var(--gold-light)', borderRadius: '4px', padding: '1px 6px', fontFamily: 'DM Mono, monospace' }}>{t('common.active')}</span>}
                      </div>
                      <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '8px' }}>
                        {provider.models.map((m) => {
                          const active = form.preferred_model === m.id
                          return (
                            <button key={m.id} onClick={() => setForm({ ...form, preferred_model: m.id })}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '6px', border: `1px solid ${active ? 'var(--gold)' : 'transparent'}`, background: active ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: '4px' }}>
                              <div>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: active ? 'var(--gold-light)' : 'var(--text-primary)' }}>{m.label}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '1px' }}>{m.desc}</span>
                              </div>
                              {active && <span style={{ color: 'var(--gold)' }}>✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </Field>

            <Field label={t("settings.temperature")} hint={t("settings.temperatureHint")}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min="0" max="2" step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                  style={{ flex: 1, accentColor: 'var(--gold)', cursor: 'pointer' }} />
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', color: 'var(--gold)', minWidth: '32px', textAlign: 'right' }}>{form.temperature.toFixed(1)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
                <span>{t("settings.focused")}</span><span>{t("settings.balanced")}</span><span>{t("settings.creative")}</span>
              </div>
            </Field>

            <Field label={t("settings.topP")} hint={t("settings.topPHint")}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min="0.1" max="1" step="0.05"
                  value={form.top_p}
                  onChange={(e) => setForm({ ...form, top_p: parseFloat(e.target.value) })}
                  style={{ flex: 1, accentColor: 'var(--gold)', cursor: 'pointer' }} />
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', color: 'var(--gold)', minWidth: '32px', textAlign: 'right' }}>{form.top_p.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
                <span>{t("settings.safe")}</span><span>{t("settings.balanced")}</span><span>{t("settings.varied")}</span>
              </div>
            </Field>

            <Field label={t('settings.language')} hint={t('settings.languageHint')}>
              <select className="input" value={form.preferred_language}
                onChange={(e) => setForm({ ...form, preferred_language: e.target.value })}
                style={{ cursor: 'pointer' }}>
                {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </Field>

            <Field label={t('settings.currency')} last>
              <select className="input" value={form.preferred_currency}
                onChange={(e) => setForm({ ...form, preferred_currency: e.target.value })}
                style={{ cursor: 'pointer' }}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </Section>

          <Section title={t('settings.planUsage')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{user.tier === 'pro' ? t('settings.proPlan') : t('settings.freePlan')}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{user.tier === 'pro' ? t('settings.unlimited') : t('settings.messagesDay')}</div>
              </div>
              {user.tier !== 'pro' && (
                <button onClick={() => router.push('/billing')}
                  style={{ background: 'var(--gold)', color: '#0a0c10', border: 'none', borderRadius: '6px', padding: '9px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {t('settings.upgradePro')}
                </button>
              )}
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: t('settings.activeModel'), value: currentModel?.label || form.preferred_model },
                { label: t('settings.language'),    value: currentLang?.label || form.preferred_language },
                { label: t('settings.currency'),    value: form.preferred_currency },
                { label: t('settings.calledBy'),    value: form.preferred_name || form.full_name?.split(' ')[0] || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace' }}>{value}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t('settings.dangerZone')}>
            {!showDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{t('settings.deleteAccount')}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{t('settings.deleteDesc')}</div>
                </div>
                <button onClick={() => setShowDelete(true)}
                  style={{ background: 'transparent', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' }}>
                  {t('settings.deleteAccount')}
                </button>
              </div>
            ) : (
              <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '8px', padding: '16px' }}>
                <p style={{ fontSize: '13px', marginBottom: '12px' }}>{t('settings.deleteConfirm')}</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setShowDelete(false)}
                    style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-secondary)', padding: '8px', fontSize: '12px', cursor: 'pointer' }}>
                    {t('settings.cancel')}
                  </button>
                  <button onClick={() => { logout(); router.push('/login') }}
                    style={{ flex: 1, background: 'var(--red)', border: 'none', borderRadius: '6px', color: '#fff', padding: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                    {t('settings.deleteEverything')}
                  </button>
                </div>
              </div>
            )}
          </Section>

          <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg-base)', padding: '16px 0', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ background: saved ? 'var(--green-dim)' : 'var(--gold)', color: saved ? 'var(--green)' : '#0a0c10', border: saved ? '1px solid var(--green)' : 'none', borderRadius: '8px', padding: '11px 28px', fontSize: '14px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: saving ? 0.7 : 1 }}>
              {saving ? t('settings.saving') : saved ? t('settings.saved') : t('settings.saveAll')}
            </button>
            {saved && <span style={{ fontSize: '12px', color: 'var(--green)' }}>{t('settings.savedHint')}</span>}
          </div>

        {/* Notifications */}
        <Section title={t('settings.notifications') || 'Notifications'}>
          <NotificationSettings />
        </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
