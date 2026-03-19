'use client'
import { useMemo, useState } from 'react'

// lightweight markdown parser used to display formatted AI chat responses in the UI
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

// Extract image URLs from message content
// Matches: URL: https://... or ![...](https://...) or bare https://...blob...png...
function extractImages(text) {
  if (!text) return []
  const urls = []
  
  // Match "URL: https://..." pattern from image tools
  const urlPattern = /URL:\s*(https?:\/\/[^\s\n]+)/g
  let m
  while ((m = urlPattern.exec(text)) !== null) urls.push(m[1].trim())
  
  // Match markdown images ![...](url)
  const mdPattern = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g
  while ((m = mdPattern.exec(text)) !== null) urls.push(m[1].trim())

  // Match bare oaidalleapiprodscus or dalle URLs
  const dallePattern = /(https?:\/\/(?:oaidalleapiprodscus|dalleprodsec)[^\s\n"')]+)/g
  while ((m = dallePattern.exec(text)) !== null) urls.push(m[1].trim())

  // Match any bare https URL ending in common image extensions or containing 'img' or 'image'
  const barePattern = /(https?:\/\/[^\s\n"')]+\.(?:png|jpg|jpeg|webp|gif)(?:[^\s\n"')]*)?)/gi
  while ((m = barePattern.exec(text)) !== null) urls.push(m[1].trim())
  
  return [...new Set(urls)] // deduplicate
}

// Remove image URLs from text so they don't show as raw links
function stripImageUrls(text) {
  return text
    .replace(/URL:\s*https?:\/\/[^\s\n]+/g, '')
    .replace(/!\[[^\]]*\]\(https?:\/\/[^\s)]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function ImageCard({ url }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

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
        alt="Generated financial chart"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{ width: '100%', maxWidth: '600px', display: loaded ? 'block' : 'none', borderRadius: '8px' }}
      />
      {loaded && (
        <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}>
          <a href={url} target="_blank" rel="noopener noreferrer" download
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
  const isUser = message.role === 'user'
  const content = message.content || ''
  const [feedback, setFeedback] = useState(message.feedback || null)
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
  
  const images = useMemo(() => isUser ? [] : extractImages(content), [content, isUser])
  const cleanedContent = useMemo(() => images.length > 0 ? stripImageUrls(content) : content, [content, images])
  const html = useMemo(() => renderMarkdown(cleanedContent), [cleanedContent])

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
              {images.map((url, i) => <ImageCard key={i} url={url} />)}
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