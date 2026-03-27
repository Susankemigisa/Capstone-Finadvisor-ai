'use client'
import { useMemo, useState } from 'react'

// ── Markdown renderer ─────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[•\-] (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
  return '<p>' + html + '</p>'
}

// ── Extract ALL base64 images from any format the LLM might use ──
// Handles:
//   1. CHART_BASE64:<b64>                          (our tool prefix)
//   2. ![alt](data:image/png;base64,<b64>)         (LLM markdown format)
//   3. (data:image/png;base64,<b64>)               (bare parenthesised)
//   4. data:image/png;base64,<b64>                 (completely bare)
function extractCharts(text) {
  if (!text) return []
  const charts = []
  const seen = new Set()

  const add = (b64) => {
    const key = b64.slice(0, 40)
    if (!seen.has(key)) { seen.add(key); charts.push(b64) }
  }

  // Format 1: our explicit prefix
  const re1 = /CHART_BASE64:([A-Za-z0-9+/=\s]+?)(?:\s|$|CHART_BASE64|FILE_BASE64)/g
  let m
  while ((m = re1.exec(text)) !== null) add(m[1].replace(/\s/g, ''))

  // Format 2: markdown image with data URI  ![anything](data:image/png;base64,<b64>)
  const re2 = /!\[[^\]]*\]\(data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+?)\)/g
  while ((m = re2.exec(text)) !== null) add(m[1].replace(/\s/g, ''))

  // Format 3: bare parenthesised  (data:image/png;base64,<b64>)
  const re3 = /\(data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+?)\)/g
  while ((m = re3.exec(text)) !== null) add(m[1].replace(/\s/g, ''))

  // Format 4: completely bare data URI on its own line
  const re4 = /(?:^|\s)data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)/gm
  while ((m = re4.exec(text)) !== null) add(m[1].replace(/\s/g, ''))

  return charts
}

// ── Extract file downloads ────────────────────────────────────
function extractFiles(text) {
  if (!text) return []
  const files = []
  const pdfRe  = /FILE_BASE64_PDF:([A-Za-z0-9+/=\s]+?)(?:\s|$|FILE_BASE64)/g
  const xlsxRe = /FILE_BASE64_XLSX:([A-Za-z0-9+/=\s]+?)(?:\s|$|FILE_BASE64)/g
  let m
  while ((m = pdfRe.exec(text))  !== null) files.push({ type: 'pdf',  b64: m[1].replace(/\s/g, '') })
  while ((m = xlsxRe.exec(text)) !== null) files.push({ type: 'xlsx', b64: m[1].replace(/\s/g, '') })
  return files
}

// ── Extract remote image URLs (DALL-E etc.) ───────────────────
function extractRemoteImages(text) {
  if (!text) return []
  const urls = []
  const patterns = [
    /URL:\s*(https?:\/\/[^\s\n]+)/g,
    /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g,
    /(https?:\/\/(?:oaidalleapiprodscus|dalleprodsec)[^\s\n"')]+)/g,
    /(https?:\/\/[^\s\n"')]+\.(?:png|jpg|jpeg|webp|gif)(?:[^\s\n"')]*)?)/gi,
  ]
  let m
  for (const re of patterns) {
    while ((m = re.exec(text)) !== null) {
      const url = m[1].trim()
      if (!urls.includes(url)) urls.push(url)
    }
  }
  return urls
}

// ── Strip everything special from displayed text ──────────────
function stripSpecialTokens(text) {
  return text
    // our prefixes
    .replace(/CHART_BASE64:[A-Za-z0-9+/=\s]+/g, '')
    .replace(/FILE_BASE64_PDF:[A-Za-z0-9+/=\s]+/g, '')
    .replace(/FILE_BASE64_XLSX:[A-Za-z0-9+/=\s]+/g, '')
    // markdown images with data URIs
    .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '')
    // bare data URIs
    .replace(/\(?data:image\/[^\s)]+\)?/g, '')
    // remote image URLs
    .replace(/URL:\s*https?:\/\/[^\s\n]+/g, '')
    .replace(/!\[[^\]]*\]\(https?:\/\/[^\s)]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Chart card ────────────────────────────────────────────────
function ChartCard({ b64 }) {
  const src = `data:image/png;base64,${b64}`
  const [loaded, setLoaded] = useState(false)
  const [error,  setError]  = useState(false)

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = `finadvisor-chart-${Date.now()}.png`
    a.click()
  }

  if (error) return (
    <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '12px' }}>
      ⚠️ Chart could not be rendered. Try asking again.
    </div>
  )

  return (
    <div style={{ marginTop: '12px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
      {!loaded && (
        <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '12px', fontFamily: 'DM Mono, monospace' }}>
          📊 Rendering chart...
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Financial chart"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{ width: '100%', maxWidth: '700px', display: loaded ? 'block' : 'none' }}
      />
      {loaded && (
        <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>Generated by FinAdvisor AI</span>
          <button onClick={handleDownload}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--gold)', fontFamily: 'DM Mono, monospace' }}>
            ↓ Download PNG
          </button>
        </div>
      )}
    </div>
  )
}

// ── File download card ────────────────────────────────────────
function FileDownloadCard({ type, b64 }) {
  const isPdf  = type === 'pdf'
  const mime   = isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const ext    = isPdf ? 'pdf' : 'xlsx'
  const icon   = isPdf ? '📄' : '📊'
  const label  = isPdf ? 'PDF Report' : 'Excel Workbook'
  const color  = isPdf ? '#C81E1E' : '#057A55'

  const handleDownload = () => {
    try {
      const byteStr = atob(b64)
      const arr = new Uint8Array(byteStr.length)
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
      const blob = new Blob([arr], { type: mime })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `finadvisor-report-${Date.now()}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Download failed', e)
    }
  }

  return (
    <div style={{ marginTop: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '22px' }}>{icon}</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label} ready</div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'DM Mono, monospace' }}>Click to download .{ext}</div>
        </div>
      </div>
      <button onClick={handleDownload}
        style={{ background: color, color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
        ↓ Download
      </button>
    </div>
  )
}

// ── Remote image card (DALL-E URLs) ──────────────────────────
function RemoteImageCard({ url }) {
  const [loaded, setLoaded] = useState(false)
  const [error,  setError]  = useState(false)
  if (error) return null
  return (
    <div style={{ marginTop: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
      {!loaded && (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '12px', fontFamily: 'DM Mono, monospace' }}>
          Loading image...
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Generated financial image"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{ width: '100%', maxWidth: '600px', display: loaded ? 'block' : 'none', borderRadius: '8px' }}
      />
      {loaded && (
        <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '11px', color: 'var(--gold)', textDecoration: 'none', fontFamily: 'DM Mono, monospace' }}>
            ↓ Download image
          </a>
        </div>
      )}
    </div>
  )
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function MessageBubble({ message, isStreaming = false, onRegenerate = null }) {
  const isUser  = message.role === 'user'
  const content = message.content || ''
  const [feedback,   setFeedback]   = useState(message.feedback || null)
  const [submitting, setSubmitting] = useState(false)

  const submitFeedback = async (rating) => {
    if (feedback || submitting || !message.id || isStreaming) return
    setSubmitting(true)
    try {
      const token = localStorage.getItem('access_token')
      await fetch(`${API}/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message_id: message.id, rating })
      })
      setFeedback(rating)
    } catch {}
    setSubmitting(false)
  }

  const charts        = useMemo(() => isUser ? [] : extractCharts(content),       [content, isUser])
  const fileDownloads = useMemo(() => isUser ? [] : extractFiles(content),         [content, isUser])
  const remoteImages  = useMemo(() => isUser ? [] : extractRemoteImages(content),  [content, isUser])
  const hasSpecial    = charts.length > 0 || fileDownloads.length > 0 || remoteImages.length > 0
  const cleanContent  = useMemo(() => hasSpecial ? stripSpecialTokens(content) : content, [content, hasSpecial])
  const html          = useMemo(() => renderMarkdown(cleanContent), [cleanContent])

  return (
    <div className="fade-in" style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '16px', paddingLeft: isUser ? '48px' : '0', paddingRight: isUser ? '0' : '48px' }}>
      {!isUser && (
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold-dim), var(--bg-elevated))', border: '1px solid var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--gold)', flexShrink: 0, marginRight: '10px', marginTop: '2px' }}>◆</div>
      )}
      <div style={{ maxWidth: '100%', flex: 1 }}>
        <div style={{ background: isUser ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${isUser ? 'var(--border-bright)' : 'var(--border)'}`, borderRadius: isUser ? '10px 10px 2px 10px' : '2px 10px 10px 10px', padding: '12px 16px' }}>
          {isUser ? (
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{content}</p>
          ) : (
            <>
              <div className={`prose-chat${isStreaming ? ' typing-cursor' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
              {charts.map((b64, i)         => <ChartCard        key={`chart-${i}`}  b64={b64} />)}
              {fileDownloads.map((f, i)    => <FileDownloadCard key={`file-${i}`}   type={f.type} b64={f.b64} />)}
              {remoteImages.map((url, i)   => <RemoteImageCard  key={`img-${i}`}    url={url} />)}
            </>
          )}
        </div>

        {!isStreaming && !isUser && (
          <div style={{ marginTop: '6px', paddingLeft: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {message.created_at && (
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
              <button onClick={() => submitFeedback('up')} title="Good response"
                style={{ background: 'none', border: 'none', cursor: feedback ? 'default' : 'pointer', fontSize: '13px', opacity: feedback === 'up' ? 1 : feedback ? 0.3 : 0.5, transition: 'all 0.15s', padding: '2px 4px', borderRadius: '4px', color: feedback === 'up' ? 'var(--gold)' : 'var(--text-dim)' }}>
                👍
              </button>
              <button onClick={() => submitFeedback('down')} title="Bad response"
                style={{ background: 'none', border: 'none', cursor: feedback ? 'default' : 'pointer', fontSize: '13px', opacity: feedback === 'down' ? 1 : feedback ? 0.3 : 0.5, transition: 'all 0.15s', padding: '2px 4px', borderRadius: '4px', color: feedback === 'down' ? '#ff6b6b' : 'var(--text-dim)' }}>
                👎
              </button>
              {feedback && <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: '2px' }}>{feedback === 'up' ? 'Thanks! 🙏' : 'Got it, improving...'}</span>}
              {onRegenerate && (
                <button onClick={onRegenerate} title="Regenerate response"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', opacity: 0.4, transition: 'opacity 0.15s', padding: '2px 4px', color: 'var(--text-dim)', marginLeft: '4px' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}>
                  ↺ Regenerate
                </button>
              )}
            </div>
          </div>
        )}
        {!isStreaming && isUser && message.created_at && (
          <div style={{ marginTop: '4px', paddingLeft: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}