'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

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

export default function ChatInput({ onSend, disabled, placeholder = 'Ask about stocks, crypto, budgeting...' }) {
  const [value, setValue] = useState('')
  const [recording, setRecording] = useState(false)
  const [voiceSupported] = useState(() => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window))
  const [attachments, setAttachments] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef(null)
  const recognitionRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [value])

  const handleSend = useCallback(() => {
    const text = value.trim()
    if ((!text && attachments.length === 0) || disabled) return
    
    // Build message with attachments
    let finalMessage = text
    if (attachments.length > 0) {
      const fileNames = attachments.map(a => a.name).join(', ')
      finalMessage = text ? `${text}\n\n[Attached: ${fileNames}]` : `[Attached: ${fileNames}]`
    }
    
    onSend(finalMessage, attachments)
    setValue('')
    setAttachments([])
  }, [value, attachments, disabled, onSend])

  const toggleVoice = useCallback(() => {
    if (!voiceSupported) return

    if (recording) {
      recognitionRef.current?.stop()
      setRecording(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = '' // empty = auto-detect from browser language

    recognition.onstart = () => setRecording(true)
    recognition.onend = () => setRecording(false)
    recognition.onerror = () => setRecording(false)

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('')
      setValue(transcript)
      // Auto-send on final result
      if (e.results[e.results.length - 1].isFinal) {
        setTimeout(() => {
          if (transcript.trim()) {
            onSend(transcript.trim())
            setValue('')
          }
        }, 300)
      }
    }

    recognition.start()
  }, [recording, voiceSupported, onSend])

  const handleFiles = useCallback((files) => {
    const newAttachments = Array.from(files).map(f => ({
      name: f.name,
      size: f.size,
      type: f.type,
      file: f,
    }))
    setAttachments(prev => [...prev, ...newAttachments].slice(0, 5)) // max 5 files
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const removeAttachment = (i) => setAttachments(prev => prev.filter((_, idx) => idx !== i))

  const formatSize = (bytes) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes/1024).toFixed(0)}KB` : `${(bytes/1048576).toFixed(1)}MB`

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {attachments.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>📎 {a.name}</span>
              <span style={{ color: 'var(--text-dim)' }}>({formatSize(a.size)})</span>
              <button onClick={() => removeAttachment(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '0', lineHeight: 1, fontSize: '13px' }}>✕</button>
            </div>
          ))}
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

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', background: dragOver ? 'var(--bg-elevated)' : 'var(--bg-elevated)', border: `1px solid ${dragOver ? 'var(--gold)' : 'var(--border-bright)'}`, borderRadius: '10px', padding: '8px 8px 8px 14px', transition: 'border-color 0.15s' }}>
        
        {/* File attach button */}
        <button onClick={() => fileInputRef.current?.click()} disabled={disabled}
          title="Attach file"
          style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}>
          <PaperclipIcon />
        </button>
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.csv,.txt,.xlsx,.docx"
          style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />

        <textarea ref={textareaRef} value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={recording ? 'Listening...' : placeholder} rows={1}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6, maxHeight: '160px', overflow: 'auto' }} />

        {/* Voice button */}
        {voiceSupported && (
          <button onClick={toggleVoice} disabled={disabled}
            title={recording ? 'Stop recording' : 'Voice input (auto-detect language)'}
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: recording ? 'rgba(255,60,60,0.2)' : 'transparent', color: recording ? '#ff6b6b' : 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
            onMouseEnter={e => { if (!recording) e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { if (!recording) e.currentTarget.style.color = 'var(--text-dim)' }}>
            <MicIcon recording={recording} />
          </button>
        )}

        {/* Send button */}
        <button onClick={handleSend} disabled={disabled || (!value.trim() && attachments.length === 0)}
          style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: (value.trim() || attachments.length > 0) && !disabled ? 'var(--gold)' : 'var(--border)', color: (value.trim() || attachments.length > 0) && !disabled ? '#0a0c10' : 'var(--text-dim)', cursor: (value.trim() || attachments.length > 0) && !disabled ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0, fontWeight: 700, transition: 'all 0.15s' }}>↑</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', padding: '0 2px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
          ⏎ send · ⇧⏎ newline{voiceSupported ? ' · 🎤 voice' : ''} · 📎 attach
        </span>
        {disabled && <span style={{ fontSize: '10px', color: 'var(--gold)', fontFamily: 'DM Mono, monospace' }}>thinking...</span>}
      </div>
    </div>
  )
}