'use client'

import { useEffect } from 'react'

type Props = {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title = '¿Estás seguro?',
  message,
  confirmLabel = 'Eliminar',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  const accentColor = danger ? '#B03A1A' : '#C05A3B'
  const accentBg = danger ? 'rgba(176,58,26,0.1)' : 'rgba(192,90,59,0.1)'
  const accentBorder = danger ? 'rgba(176,58,26,0.2)' : 'rgba(192,90,59,0.2)'

  return (
    <>
      <style>{`
        @keyframes cm-overlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cm-card {
          from { opacity: 0; transform: scale(0.9) translateY(16px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);    }
        }
      `}</style>
      <div
        onClick={e => e.target === e.currentTarget && onCancel()}
        style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(42,26,14,0.6)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
          animation: 'cm-overlay 0.18s ease both',
        }}
      >
        <div
          style={{
            background: '#FFF8F2',
            borderRadius: 22,
            padding: '1.75rem',
            width: '100%',
            maxWidth: 360,
            border: '1.5px solid #EAD8C8',
            boxShadow: '0 24px 72px rgba(42,26,14,0.22)',
            animation: 'cm-card 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          {/* Icono */}
          <div style={{
            width: 50, height: 50, borderRadius: 15,
            background: accentBg,
            border: `1.5px solid ${accentBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', marginBottom: '1.1rem',
          }}>
            {danger ? '🗑️' : '⚠️'}
          </div>

          {/* Título */}
          <div style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: '1.2rem', fontWeight: 600, color: '#2A1A0E',
            letterSpacing: '-0.022em', marginBottom: '0.45rem',
          }}>
            {title}
          </div>

          {/* Mensaje */}
          <div style={{
            fontFamily: 'var(--font-body), Nunito, sans-serif',
            fontSize: '0.875rem', color: '#7A5540', lineHeight: 1.58,
            marginBottom: '1.6rem',
          }}>
            {message}
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                flex: 1, padding: '11px 16px', borderRadius: 12,
                background: '#F0E8DF', border: '1.5px solid #E0C8B8',
                color: '#7A5540', cursor: 'pointer',
                fontFamily: 'var(--font-body), Nunito, sans-serif',
                fontSize: '0.875rem', fontWeight: 700,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E5D5C5' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F0E8DF' }}
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              style={{
                flex: 1, padding: '11px 16px', borderRadius: 12,
                background: accentColor, border: 'none',
                color: 'white', cursor: 'pointer',
                fontFamily: 'var(--font-body), Nunito, sans-serif',
                fontSize: '0.875rem', fontWeight: 700,
                boxShadow: `0 4px 16px ${danger ? 'rgba(176,58,26,0.38)' : 'rgba(192,90,59,0.38)'}`,
                transition: 'background 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = danger ? '#8C2E15' : '#A04730'
                el.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = accentColor
                el.style.transform = 'translateY(0)'
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
