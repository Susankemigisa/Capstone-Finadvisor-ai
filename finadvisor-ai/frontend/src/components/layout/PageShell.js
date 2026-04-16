'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'

/**
 * MobileHeader — shows a hamburger button on small screens.
 * Wrap your page content with this instead of using Sidebar directly.
 *
 * Usage (replace in every page):
 *   import PageShell from '@/components/layout/PageShell'
 *   <PageShell title="Budget">
 *     ... your page content ...
 *   </PageShell>
 */
export default function PageShell({ children, title, subtitle }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close menu on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-main)', minWidth: 0 }}>
        {/* Mobile top bar — only visible on small screens */}
        {isMobile && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            {/* Hamburger button */}
            <button
              onClick={() => setMobileOpen(true)}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                width: '36px',
                height: '36px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <span style={{ display: 'block', width: '16px', height: '2px', background: 'var(--text-secondary)', borderRadius: '1px' }} />
              <span style={{ display: 'block', width: '16px', height: '2px', background: 'var(--text-secondary)', borderRadius: '1px' }} />
              <span style={{ display: 'block', width: '16px', height: '2px', background: 'var(--text-secondary)', borderRadius: '1px' }} />
            </button>

            {/* Page title */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && (
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: '18px', fontStyle: 'italic', fontWeight: 400, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {title}
                </div>
              )}
            </div>

            {/* FinAdvisor logo */}
            <div style={{ fontFamily: 'DM Mono, monospace', color: 'var(--gold)', fontSize: '10px', letterSpacing: '0.1em', flexShrink: 0 }}>
              ◆ FA
            </div>
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}