'use client'
import { useState, useEffect } from 'react'
import { useFormDraft } from '@/hooks/useFormDraft'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useLangStore, useTranslate } from '@/stores/langStore'
import Sidebar from '@/components/layout/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function req(path, opts = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers }
  }).then(r => r.json())
}

// FILING_LABELS resolved via t() at render time in TaxCard

function TaxCard({ record, onDelete }) {
  const t = useTranslate()
  const effectiveRate = record.annual_income > 0
    ? ((record.estimated_tax_owed / record.annual_income) * 100).toFixed(1)
    : 0

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '22px', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--gold)', borderRadius: '12px 12px 0 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '28px', fontWeight: 700, color: 'var(--gold)' }}>{record.tax_year}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{t(`tax.filing_${record.filing_status}`) || record.filing_status}</div>
        </div>
        <button onClick={() => onDelete(record.id)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', color: 'var(--red, #f87171)', cursor: 'pointer', fontSize: '12px' }}>
          ✕
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        {[
          { label: t('tax.annualIncome'), value: `$${(record.annual_income || 0).toLocaleString()}` },
          { label: t('tax.shortTermGains'), value: `$${(record.capital_gains_short || 0).toLocaleString()}` },
          { label: t('tax.longTermGains'), value: `$${(record.capital_gains_long || 0).toLocaleString()}` },
          { label: t('tax.effectiveRate'), value: `${effectiveRate}%`, color: 'var(--gold)' },
        ].map((row, i) => (
          <div key={i}>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '3px', letterSpacing: '0.05em' }}>{row.label}</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '14px', fontWeight: 600, color: row.color || 'var(--text-primary)' }}>{row.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-base)', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{t('tax.estimatedTax')}</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '20px', fontWeight: 700, color: '#f87171' }}>
          ${(record.estimated_tax_owed || 0).toLocaleString()}
        </span>
      </div>

      {record.notes && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{record.notes}</div>
      )}
    </div>
  )
}

export default function TaxPage() {
  const router = useRouter()
  const { init } = useAuthStore()
  const { init: initTheme } = useThemeStore()
  const { init: initLang } = useLangStore()
  const t = useTranslate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm, clearFormDraft] = useFormDraft('tax-entry', {
    tax_year: new Date().getFullYear(),
    filing_status: 'single',
    annual_income: '',
    capital_gains_short: '',
    capital_gains_long: '',
    notes: ''
  })

  const load = async () => {
    setLoading(true)
    const data = await req('/tax')
    setRecords(data.records || [])
    setLoading(false)
  }

  useEffect(() => {
    initLang()
    initTheme()
    init().then(() => {
      const { user } = useAuthStore.getState()
      if (!user) router.replace('/login')
      else load()
    })
  }, [])

  const handlePreview = async () => {
    const income = parseFloat(form.annual_income) || 0
    const cgShort = parseFloat(form.capital_gains_short) || 0
    const cgLong = parseFloat(form.capital_gains_long) || 0
    // Quick client-side estimate
    const brackets = { single: [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]], married_filing_jointly: [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]] }
    const bkt = brackets[form.filing_status] || brackets.single
    let tax = 0, prev = 0
    for (const [limit, rate] of bkt) {
      if (income <= prev) break
      tax += (Math.min(income, limit) - prev) * rate
      prev = limit
    }
    tax += cgShort * 0.22
    tax += cgLong * (income < 492300 ? 0.15 : 0.20)
    setPreview(Math.round(tax))
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    const data = await req('/tax', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        annual_income: parseFloat(form.annual_income) || 0,
        capital_gains_short: parseFloat(form.capital_gains_short) || 0,
        capital_gains_long: parseFloat(form.capital_gains_long) || 0,
      })
    })
    if (data.success) {
      setRecords(prev => {
        const idx = prev.findIndex(r => r.tax_year === data.record.tax_year)
        if (idx >= 0) { const n = [...prev]; n[idx] = data.record; return n }
        return [data.record, ...prev]
      })
      setShowForm(false); setPreview(null)
    } else setError(data.detail || 'Failed to save')
    setSaving(false)
  }

  const handleDelete = async (id) => {
    await req(`/tax/${id}`, { method: 'DELETE' })
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px' }}>
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: '24px', fontStyle: 'italic', fontWeight: 400 }}>{t('tax.title')}</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{t('tax.subtitle')}</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() =>{ setShowForm(!showForm); setPreview(null) }}
            style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {showForm ? t('tax.cancel') : t('tax.addYear')}</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
        {/* Form */}
        {showForm && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--gold)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', letterSpacing: '0.05em' }}>{t('tax.label')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('tax.taxYear')}</label>
                <input className="input" type="number" value={form.tax_year}
                  onChange={e => setForm({ ...form, tax_year: parseInt(e.target.value) })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('tax.filingStatus')}</label>
                <select value={form.filing_status} onChange={e => setForm({ ...form, filing_status: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}>
                  {[['single', t('tax.filing_single')],['married_filing_jointly', t('tax.filing_married_jointly')],['married_filing_separately', t('tax.filing_married_separately')],['head_of_household', t('tax.filing_head_household')]].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('tax.annualIncome')}</label>
                <input className="input" type="number" placeholder="75000" value={form.annual_income}
                  onChange={e => { setForm({ ...form, annual_income: e.target.value }); setPreview(null) }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('tax.shortTermGains')}</label>
                <input className="input" type="number" placeholder="0" value={form.capital_gains_short}
                  onChange={e => { setForm({ ...form, capital_gains_short: e.target.value }); setPreview(null) }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('tax.longTermGains')}</label>
                <input className="input" type="number" placeholder="0" value={form.capital_gains_long}
                  onChange={e => { setForm({ ...form, capital_gains_long: e.target.value }); setPreview(null) }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>{t('tax.notes')}</label>
                <input className="input" placeholder={t('tax.notesPlaceholder')} value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            {/* Estimate preview */}
            {preview !== null && (
              <div style={{ marginTop: '16px', background: 'var(--bg-base)', borderRadius: '8px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t('tax.estimatedTax')}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '22px', fontWeight: 700, color: '#f87171' }}>${preview.toLocaleString()}</span>
              </div>
            )}

            {error && <div style={{ color: 'var(--red, #f87171)', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={handlePreview}
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', cursor: 'pointer' }}>
                Preview Estimate
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {saving ? t('tax.saving') : t('tax.save')}
              </button>
            </div>
          </div>
        )}

        {/* Records */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>{t('tax.loading')}</div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧾</div>
            <div style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '6px' }}>{t('tax.empty')}</div>
            <div style={{ fontSize: '13px' }}>{t('tax.emptyHint')}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {records.map(record => (
              <TaxCard key={record.id} record={record} onDelete={handleDelete} />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}