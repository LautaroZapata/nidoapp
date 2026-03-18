'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { NotifProvider, useNotif, fmtTimeAgo, type Notif } from '@/lib/notif-context'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase'
import type { Miembro } from '@/lib/types'

function IconNido() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 10.5L12 3L21 10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 9.5V19C5 19.55 5.45 20 6 20H10V14H14V20H18C18.55 20 19 19.55 19 19V9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconGastos() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M12 7v1m0 8v1M9.5 9.5C9.5 8.67 10.67 8 12 8s2.5.67 2.5 1.5S13.33 11 12 11s-2.5.67-2.5 1.5S10.67 16 12 16s2.5-.67 2.5-1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  )
}

function IconCompras() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  )
}

function IconPisos() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M2 13h20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M8 13v8M16 13v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

function SalaLayoutInner({ children }: { children: React.ReactNode }) {
  const params   = useParams()
  const pathname = usePathname()
  const router   = useRouter()
  const codigo   = params.codigo as string

  const [session] = useState(getSession)
  const miembrosRef = useRef<Miembro[]>([])
  const { addNotif, notifs, toasts, unreadCount, bellOpen, setBellOpen, clearNotifs, markAllRead } = useNotif()

  const tabs = [
    { label: 'Nido',    href: `/sala/${codigo}`,         icon: IconNido    },
    { label: 'Gastos',  href: `/sala/${codigo}/gastos`,  icon: IconGastos  },
    { label: 'Compras', href: `/sala/${codigo}/compras`, icon: IconCompras },
    { label: 'Aptos',   href: `/sala/${codigo}/pisos`,   icon: IconPisos   },
  ]

  // No mostrar nav en páginas de detalle (ej: pisos/[id])
  const isDetail = pathname.split('/').length > 4

  useEffect(() => {
    if (!session) return
    const supabase = createClient()
    // Cargar miembros para tener nombres en notificaciones
    supabase.from('miembros').select().eq('sala_id', session.salaId).then(({ data }) => {
      if (data) miembrosRef.current = data as Miembro[]
    })
    const chGastos = supabase
      .channel(`notif_gastos_${session.salaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos', filter: `sala_id=eq.${session.salaId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const g = payload.new as { descripcion: string; importe: number; pagado_por: string }
          const quien = miembrosRef.current.find(m => m.id === g.pagado_por)?.nombre ?? 'Alguien'
          addNotif(`${quien} añadió: ${g.descripcion} ($${g.importe.toLocaleString('es-UY')})`, '💸')
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as { descripcion?: string }
          if (old.descripcion) addNotif(`Gasto eliminado: ${old.descripcion}`, '🗑️')
        }
      })
      .subscribe()
    const chPagos = supabase
      .channel(`notif_pagos_${session.salaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos', filter: `sala_id=eq.${session.salaId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const p = payload.new as { de_id: string; a_id: string; importe: number }
          const ms = miembrosRef.current
          const fromM = ms.find(m => m.id === p.de_id)?.nombre
          const toM = ms.find(m => m.id === p.a_id)?.nombre
          const texto = fromM && toM
            ? `${fromM} le pagó $${p.importe.toLocaleString('es-UY')} a ${toM}`
            : 'Pago registrado'
          addNotif(texto, '💰')
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(chGastos)
      supabase.removeChannel(chPagos)
    }
  }, [session, addNotif])

  return (
    <>
      <style>{`
        .sala-content {
          padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
        }

        /* Bottom Nav */
        .bnav {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 200;
          background: rgba(255, 252, 248, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid rgba(192, 90, 59, 0.1);
          display: flex;
          padding-bottom: env(safe-area-inset-bottom, 0px);
          box-shadow: 0 -4px 24px rgba(42, 26, 14, 0.07);
        }

        .bnav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          padding: 10px 4px 11px;
          background: none;
          border: none;
          cursor: pointer;
          color: #B09080;
          transition: color 0.15s, transform 0.15s;
          -webkit-tap-highlight-color: transparent;
          font-family: var(--font-nunito), 'Nunito', sans-serif;
        }

        .bnav-item:active {
          transform: scale(0.92);
        }

        .bnav-item.active {
          color: #C05A3B;
        }

        .bnav-label {
          font-size: 0.62rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          line-height: 1;
        }

        .bnav-dot {
          width: 4px; height: 4px;
          border-radius: 50%;
          background: #C05A3B;
          margin-top: 1px;
          opacity: 0;
          transition: opacity 0.15s;
        }

        .bnav-item.active .bnav-dot {
          opacity: 1;
        }

        /* Solo en desktop ocultar el bottom nav */
        @media (min-width: 768px) {
          .bnav { display: none; }
          .sala-content { padding-bottom: 0; }
        }

        @keyframes toast-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      <div className="sala-content">
        {children}
      </div>

      {!isDetail && (
        <nav className="bnav">
          {tabs.map(tab => {
            const isActive = pathname === tab.href
            const Icon = tab.icon
            return (
              <button
                key={tab.href}
                className={`bnav-item${isActive ? ' active' : ''}`}
                onClick={() => router.push(tab.href)}
                aria-label={tab.label}
              >
                <Icon />
                <span className="bnav-label">{tab.label}</span>
                <div className="bnav-dot" />
              </button>
            )
          })}
          <button
            className={`bnav-item${bellOpen ? ' active' : ''}`}
            onClick={() => { setBellOpen(!bellOpen); if (!bellOpen) markAllRead() }}
            aria-label="Notificaciones"
          >
            <div style={{ position: 'relative' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#C05A3B', color: 'white',
                  borderRadius: '50%', width: 16, height: 16,
                  fontSize: '0.55rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid white',
                }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </div>
            <span className="bnav-label">Actividad</span>
            <div className="bnav-dot" />
          </button>
        </nav>
      )}

      {/* ── NOTIFICATION PANEL ── */}
      {bellOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 240, background: 'rgba(42,26,14,0.3)', backdropFilter: 'blur(4px)' }} onClick={() => setBellOpen(false)} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 250,
            background: '#FFF8F2', borderRadius: '20px 20px 0 0',
            border: '1.5px solid #EAD8C8', borderBottom: 'none',
            maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            boxShadow: '0 -8px 40px rgba(42,26,14,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid #EAD8C8' }}>
              <span style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#2A1A0E' }}>Actividad reciente</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {notifs.length > 0 && (
                  <button onClick={clearNotifs} style={{ fontSize: '0.75rem', color: '#A07060', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontWeight: 600, padding: '4px 8px', borderRadius: 8, transition: 'color 0.15s' }}>
                    Limpiar
                  </button>
                )}
                <button onClick={() => setBellOpen(false)} style={{ width: 28, height: 28, borderRadius: 8, background: '#F0E8DF', border: '1px solid #E0C8B8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A07060' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem 0' }}>
              {notifs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#B09080', fontSize: '0.85rem', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                  Sin actividad aún
                </div>
              ) : notifs.map((n: Notif) => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 1.25rem', borderBottom: '1px solid rgba(234,216,200,0.5)' }}>
                  <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{n.icon}</span>
                  <span style={{ flex: 1, fontSize: '0.82rem', color: '#3A2010', lineHeight: 1.4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>{n.text}</span>
                  <span style={{ fontSize: '0.7rem', color: '#B09080', flexShrink: 0, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>{fmtTimeAgo(n.ts)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── TOASTS ── */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 16, zIndex: 400, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
          {toasts.map((t: Notif) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 14,
              background: 'rgba(42,26,14,0.9)', color: 'white',
              fontSize: '0.82rem', fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              backdropFilter: 'blur(8px)',
              animation: 'toast-in 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{t.icon}</span>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default function SalaLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotifProvider>
      <SalaLayoutInner>{children}</SalaLayoutInner>
    </NotifProvider>
  )
}
