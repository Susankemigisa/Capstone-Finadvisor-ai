'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const CACHE_KEY = 'finadvisor_enabled_tools'

const CATEGORY_ICONS = {
  Market: '📈', Crypto: '₿', Portfolio: '💼', Calculator: '🧮',
  Budget: '💸', Tax: '🧾', Planning: '🎯', News: '📰',
  Documents: '📄', Images: '🎨', Utilities: '🔧',
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}
function writeCache(val) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(val)) } catch {}
}

export default function PluginsPage() {
  const router = useRouter()
  const { user, loading, init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()

  const [tools, setTools] = useState([])
  const [enabledTools, setEnabledTools] = useState(() => readCache() || [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadingTools, setLoadingTools] = useState(true)

  useEffect(() => {
    initLang()
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) { router.replace('/login'); return }
      const token = localStorage.getItem('access_token')
      if (!token) { setLoadingTools(false); return }

      fetch(`${API}/chat/tools`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
        .then(d => {
          setTools(d.tools || [])
          // Backend wins only if it returns a real list.
          // If it returns empty but we have a local cache, keep the cache.
          const fromServer = Array.isArray(d.enabled) ? d.enabled : null
          const cached = readCache()
          if (fromServer !== null && fromServer.length > 0) {
            // Server has data — trust it and update cache
            setEnabledTools(fromServer)
            writeCache(fromServer)
          } else if (cached !== null) {
            // Server returned nothing / empty — use local cache silently
            setEnabledTools(cached)
          } else {
            // No data anywhere — start empty
            setEnabledTools([])
          }
        })
        .catch(() => {
          // Network error — fall back to cache
          const cached = readCache()
          if (cached) setEnabledTools(cached)
        })
        .finally(() => setLoadingTools(false))
    })
  }, [])

  const toggleTool = (id) => {
    setEnabledTools(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setSaved(false)
  }

  const toggleCategory = (cat) => {
    const catIds = tools.filter(x => x.category === cat).map(x => x.id)
    const allOn = catIds.every(id => enabledTools.includes(id))
    setEnabledTools(prev =>
      allOn ? prev.filter(id => !catIds.includes(id)) : [...new Set([...prev, ...catIds])]
    )
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const token = localStorage.getItem('access_token')
    try {
      await fetch(`${API}/chat/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled_tools: enabledTools }),
      })
      writeCache(enabledTools) // always persist locally after save
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // still write cache even if network fails — user's choices are preserved
      writeCache(enabledTools)
    }
    setSaving(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '11px' }}>{t('common.loading')}</div>
      </div>
    </div>
  )

  const categories = [...new Set(tools.map(x => x.category))]
  const enabledCount = enabledTools.length

  // Translate tool name — uses t(`pluginTools.${id}`) which now exists in all 16 lang files
  const tTool = (toolId, fallback) => {
    const key = `pluginTools.${toolId}`
    const val = t(key)
    return val !== key ? val : fallback
  }
  const tCat = (cat) => {
    const key = `pluginCategories.${cat}`
    const val = t(key)
    return val !== key ? val : cat
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>

        {/* Sticky header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('plugins.title')}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
              {loadingTools ? t('common.loading') : `${enabledCount} ${t('plugins.of')} ${tools.length} ${t('plugins.subtitle')}`}
            </p>
          </div>
          <button onClick={handleSave} disabled={saving}
            style={{ background: saved ? 'var(--bg-elevated)' : 'var(--gold)', color: saved ? 'var(--gold)' : '#0a0c10', border: `1px solid ${saved ? 'var(--gold)' : 'transparent'}`, borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s' }}>
            {saving ? t('plugins.saving') : saved ? t('plugins.saved') : t('plugins.save')}
          </button>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            💡 <strong style={{ color: 'var(--text-primary)' }}>{t('plugins.info')}:</strong> {t('plugins.infoDesc')}
          </div>

          {loadingTools ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>
              {t('plugins.loading')}
            </div>
          ) : (
            categories.map(cat => {
              const catTools = tools.filter(x => x.category === cat)
              const allEnabled = catTools.every(x => enabledTools.includes(x.id))
              return (
                <div key={cat} style={{ marginBottom: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>{CATEGORY_ICONS[cat] || '🔧'}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{tCat(cat)}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>
                        {catTools.filter(x => enabledTools.includes(x.id)).length}/{catTools.length}
                      </span>
                    </div>
                    <button onClick={() => toggleCategory(cat)}
                      style={{ fontSize: '11px', color: 'var(--gold)', background: 'none', border: '1px solid var(--gold-dim)', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer' }}>
                      {allEnabled ? t('plugins.disableAll') : t('plugins.enableAll')}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                    {catTools.map(tool => {
                      const enabled = enabledTools.includes(tool.id)
                      const toolName = tTool(tool.id, tool.name)
                      const toolDesc = tTool(`${tool.id}_desc`, tool.desc || tool.name)
                      return (
                        <button key={tool.id} onClick={() => toggleTool(tool.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: enabled ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${enabled ? 'var(--gold-dim)' : 'var(--border)'}`, borderRadius: '10px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                          {/* Toggle switch */}
                          <div style={{ width: '32px', height: '18px', borderRadius: '9px', background: enabled ? 'var(--gold)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                            <div style={{ position: 'absolute', top: '3px', left: enabled ? '17px' : '3px', width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: enabled ? 'var(--text-primary)' : 'var(--text-dim)', marginBottom: '2px' }}>{toolName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toolDesc}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}