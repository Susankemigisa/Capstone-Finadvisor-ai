'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function MicIcon({ recording }) {
  return recording ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="9" y="3" width="6" height="14" rx="3"/>
      <path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="14" rx="3" fill="currentColor" stroke="none"/>
      <path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6"/>
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.41 17.41a2 2 0 01-2.83-2.83l8.49-8.48"/>
    </svg>
  )
}

// Upload type options shown in the picker
const UPLOAD_TYPES = [
  { label: 'Image',    icon: '🖼️', accept: 'image/*',                                      hint: 'JPG, PNG, GIF, WebP' },
  { label: 'Document', icon: '📄', accept: '.pdf,.docx,.txt,.md',                           hint: 'PDF, Word, TXT, MD' },
  { label: 'Data',     icon: '📊', accept: '.csv,.xlsx,.xls',                               hint: 'CSV, Excel' },
  { label: 'Any file', icon: '📎', accept: 'image/*,.pdf,.docx,.txt,.md,.csv,.xlsx,.xls',   hint: 'All supported types' },
]

// Doc types the backend RAG pipeline accepts
const RAG_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.csv'])

export default function ChatInput({ onSend, disabled, placeholder = 'Ask about stocks, crypto, budgeting...' }) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('finadvisor-chat-draft') || ''
  })
  const [recording, setRecording] = useState(false)
  const [voiceSupported] = useState(() => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window))
  const [attachments, setAttachments] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [showUploadPicker, setShowUploadPicker] = useState(false)
  const [uploadingIds, setUploadingIds] = useState(new Set())
  const textareaRef = useRef(null)
  const recognitionRef = useRef(null)
  const fileInputRef = useRef(null)
  const pickerRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [value])

  // Close picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowUploadPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Upload a document file to /documents/upload for RAG indexing
  const uploadToRAG = useCallback(async (attachment) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
    if (!token) return null
    const formData = new FormData()
    formData.append('file', attachment.file)
    try {
      const res = await fetch(`${API}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        return data?.document?.id || data?.id || null
      }
    } catch {}
    return null
  }, [])

  const handleSend = useCallback(async () => {
    const text = value.trim()
    if ((!text && attachments.length === 0) || disabled) return

    // Upload document-type files to RAG pipeline before sending
    const ragIds = []
    const imageAttachments = []

    for (const att of attachments) {
      const ext = '.' + (att.name.split('.').pop() || '').toLowerCase()
      if (RAG_EXTENSIONS.has(ext)) {
        // Mark as uploading
        setUploadingIds(prev => new Set([...prev, att.name]))
        const docId = await uploadToRAG(att)
        setUploadingIds(prev => { const n = new Set(prev); n.delete(att.name); return n })
        if (docId) ragIds.push(docId)
      } else {
        // Images and other files passed as-is to the message
        imageAttachments.push(att)
      }
    }

    // Build message — mention uploaded docs so AI knows about them
    let finalMessage = text
    const fileNames = attachments.map(a => a.name).join(', ')
    if (ragIds.length > 0) {
      finalMessage = text
        ? `${text}\n\n[Uploaded to knowledge base: ${attachments.filter(a => RAG_EXTENSIONS.has('.' + a.name.split('.').pop().toLowerCase())).map(a => a.name).join(', ')}]`
        : `I've just uploaded: ${fileNames}. Please analyse it.`
    } else if (imageAttachments.length > 0) {
      finalMessage = text ? `${text}\n\n[Attached: ${fileNames}]` : `[Attached: ${fileNames}]`
    }

    onSend(finalMessage, imageAttachments)
    setValue('')
    setAttachments([])
    if (typeof window !== 'undefined') localStorage.removeItem('finadvisor-chat-draft')
  }, [value, attachments, disabled, onSend, uploadToRAG])

  const toggleVoice = useCallback(() => {
    if (!voiceSupported) return
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = ''
    recognition.onstart = () => setRecording(true)
    recognition.onend = () => setRecording(false)
    recognition.onerror = () => setRecording(false)
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('')
      setValue(transcript)
      if (e.results[e.results.length - 1].isFinal) {
        setTimeout(() => {
          if (transcript.trim()) {
            onSend(transcript.trim())
            setValue('')
            if (typeof window !== 'undefined') localStorage.removeItem('finadvisor-chat-draft')
          }
        }, 300)
      }
    }
    recognition.start()
  }, [recording, voiceSupported, onSend])

  const handleFiles = useCallback((files) => {
    const newAttachments = Array.from(files).map(f => ({
      name: f.name, size: f.size, type: f.type, file: f,
    }))
    setAttachments(prev => [...prev, ...newAttachments].slice(0, 5))
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const removeAttachment = (i) => setAttachments(prev => prev.filter((_, idx) => idx !== i))
  const formatSize = (b) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(0)}KB` : `${(b/1048576).toFixed(1)}MB`

  const openFilePicker = (accept) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept
      fileInputRef.current.click()
    }
    setShowUploadPicker(false)
  }

  const isUploading = uploadingIds.size > 0

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'relative' }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}>

      {/* Upload type picker */}
      {showUploadPicker && (
        <div ref={pickerRef} style={{ position: 'absolute', bottom: '100%', left: '16px', marginBottom: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 100, minWidth: '200px', boxShadow: '0 -4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em', padding: '4px 8px 2px' }}>ATTACH</div>
          {UPLOAD_TYPES.map(ut => (
            <button key={ut.label} onClick={() => openFilePicker(ut.accept)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{ut.icon}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{ut.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{ut.hint}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {attachments.map((a, i) => {
            const isDoc = RAG_EXTENSIONS.has('.' + (a.name.split('.').pop() || '').toLowerCase())
            const uploading = uploadingIds.has(a.name)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: `1px solid ${isDoc ? 'var(--gold-dim)' : 'var(--border)'}`, borderRadius: '6px', padding: '4px 8px', fontSize: '11px' }}>
                <span>{isDoc ? '📄' : '🖼️'}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{a.name}</span>
                <span style={{ color: 'var(--text-dim)' }}>({formatSize(a.size)})</span>
                {isDoc && <span style={{ color: 'var(--gold)', fontSize: '10px' }}>{uploading ? '⏳' : '→ AI'}</span>}
                <button onClick={() => removeAttachment(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '0', lineHeight: 1, fontSize: '13px' }}>✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Recording indicator */}
      {recording && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '6px 10px', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)', borderRadius: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff3c3c', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: '11px', color: '#ff6b6b', fontFamily: 'DM Mono, monospace' }}>Listening... speak now</span>
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', background: 'var(--bg-elevated)', border: `1px solid ${dragOver ? 'var(--gold)' : 'var(--border-bright)'}`, borderRadius: '10px', padding: '8px 8px 8px 14px', transition: 'border-color 0.15s' }}>

        {/* Attach button — shows picker */}
        <button onClick={() => setShowUploadPicker(v => !v)} disabled={disabled}
          title="Attach file"
          style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: showUploadPicker ? 'var(--bg-base)' : 'transparent', color: showUploadPicker ? 'var(--gold)' : 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'color 0.15s' }}
          onMouseEnter={e => { if (!showUploadPicker) e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { if (!showUploadPicker) e.currentTarget.style.color = 'var(--text-dim)' }}>
          <PaperclipIcon />
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />

        <textarea ref={textareaRef} value={value} onChange={e => {
            setValue(e.target.value)
            if (typeof window !== 'undefined') {
              if (e.target.value) localStorage.setItem('finadvisor-chat-draft', e.target.value)
              else localStorage.removeItem('finadvisor-chat-draft')
            }
          }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={recording ? 'Listening...' : placeholder} rows={1}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6, maxHeight: '160px', overflow: 'auto' }} />

        {voiceSupported && (
          <button onClick={toggleVoice} disabled={disabled}
            title={recording ? 'Stop recording' : 'Voice input'}
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: recording ? 'rgba(255,60,60,0.2)' : 'transparent', color: recording ? '#ff6b6b' : 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
            <MicIcon recording={recording} />
          </button>
        )}

        <button onClick={handleSend} disabled={disabled || isUploading || (!value.trim() && attachments.length === 0)}
          style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: (value.trim() || attachments.length > 0) && !disabled && !isUploading ? 'var(--gold)' : 'var(--border)', color: (value.trim() || attachments.length > 0) && !disabled && !isUploading ? '#0a0c10' : 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0, fontWeight: 700, transition: 'all 0.15s' }}>
          {isUploading ? '⏳' : '↑'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', padding: '0 2px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
          ⏎ send · ⇧⏎ newline{voiceSupported ? ' · 🎤 voice' : ''} · 📎 image / doc / data
        </span>
        {(disabled || isUploading) && (
          <span style={{ fontSize: '10px', color: 'var(--gold)', fontFamily: 'DM Mono, monospace' }}>
            {isUploading ? 'uploading...' : 'thinking...'}
          </span>
        )}
      </div>
    </div>
  )
}