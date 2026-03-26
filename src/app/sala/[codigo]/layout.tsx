'use client'

import { useEffect, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { NotifProvider, useNotif, fmtTimeAgo, notifAccentColor, type Notif } from '@/lib/notif-context'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase'
import MemberAvatar from '@/components/MemberAvatar'

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

function IconTareas() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M9 11l3 3 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.7"/>
    </svg>
  )
}

function IconPerfil() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M5 20c0-3.31 3.13-6 7-6s7 2.69 7 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  )
}

function SalaLayoutInner({ children }: { children: React.ReactNode }) {
  const params   = useParams()
  const pathname = usePathname()
  const router   = useRouter()
  const codigo   = params.codigo as string

  const [session] = useState(getSession)
  const { addNotif, loadNotifs, notifs, toasts, unreadCount, bellOpen, setBellOpen, clearNotifs, markAllRead } = useNotif()

  const tabs = [
    { label: 'Nido',    href: `/sala/${codigo}`,         icon: IconNido    },
    { label: 'Gastos',  href: `/sala/${codigo}/gastos`,  icon: IconGastos  },
    { label: 'Compras', href: `/sala/${codigo}/compras`, icon: IconCompras },
    { label: 'Tareas',  href: `/sala/${codigo}/tareas`,  icon: IconTareas  },
    { label: 'Aptos',   href: `/sala/${codigo}/pisos`,   icon: IconPisos   },
    { label: 'Perfil',  href: `/sala/${codigo}/perfil`,  icon: IconPerfil  },
  ]

  const isDetail = pathname.split('/').length > 4

  useEffect(() => {
    if (!session) return
    const supabase = createClient()

    // Cargar historial de actividad desde la DB
    supabase
      .from('actividad')
      .select('id, texto, icono, url, creado_en')
      .eq('sala_id', session.salaId)
      .order('creado_en', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data && data.length > 0) {
          loadNotifs(data.map(a => ({
            id: a.id,
            text: a.texto,
            icon: a.icono,
            url: a.url ?? undefined,
            ts: new Date(a.creado_en).getTime(),
          })))
        }
      })

    // Escuchar nuevos eventos de actividad en tiempo real
    const chActividad = supabase
      .channel(`actividad_${session.salaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actividad', filter: `sala_id=eq.${session.salaId}` }, (payload) => {
        const a = payload.new as { id: string; texto: string; icono: string; url: string | null; creado_en: string }
        addNotif(a.texto, a.icono, a.url ?? undefined, a.id)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(chActividad)
    }
  }, [session, addNotif, loadNotifs])

  function handleNotifClick(n: Notif) {
    if (n.url) {
      setBellOpen(false)
      router.push(n.url)
    }
  }

  return (
    <>
      <style>{`
        .sala-content {
          padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
        }

        .bnav {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 200;
          background: rgba(255, 252, 248, 0.94);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
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

        .bnav-item:active { transform: scale(0.92); }
        .bnav-item.active { color: #C05A3B; }

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

        .bnav-item.active .bnav-dot { opacity: 1; }

        @media (min-width: 768px) {
          .bnav { display: none; }
          .sala-content { padding-bottom: 0; }
        }

        /* ── Toasts ── */
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateY(0) scale(1); max-height: 60px; margin-bottom: 8px; }
          to   { opacity: 0; transform: translateY(-8px) scale(0.95); max-height: 0; margin-bottom: 0; }
        }

        /* ── Notification panel ── */
        @keyframes notif-panel-in {
          from { transform: translateY(-100%); opacity: 0.5; }
          to   { transform: translateY(0);     opacity: 1;   }
        }
        .notif-panel {
          animation: notif-panel-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .notif-item {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 1.25rem;
          border-bottom: 1px solid rgba(234,216,200,0.45);
          transition: background 0.15s;
          cursor: default;
          position: relative;
        }
        .notif-item.clickable { cursor: pointer; }
        .notif-item.clickable:active { background: rgba(192,90,59,0.05); }
        .notif-icon-wrap {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.1rem; flex-shrink: 0;
        }
        .notif-body { flex: 1; min-width: 0; }
        .notif-text {
          font-size: 0.82rem; color: #2A1A0E; line-height: 1.4;
          font-family: var(--font-nunito), Nunito, sans-serif;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .notif-time {
          font-size: 0.68rem; color: #B09080; margin-top: 2px;
          font-family: var(--font-nunito), Nunito, sans-serif;
        }
        .notif-arrow {
          color: #C8A898; flex-shrink: 0;
        }

        /* ── Desktop Sidebar ── */
        .sidebar {
          display: none;
          position: fixed; left: 0; top: 0; bottom: 0; width: 224px;
          background: rgba(255,252,248,0.97);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-right: 1.5px solid rgba(234,216,200,0.75);
          flex-direction: column;
          z-index: 200;
          box-shadow: 2px 0 24px rgba(42,26,14,0.05);
        }
        .sidebar-header { display:flex; align-items:center; gap:9px; padding:1.5rem 1.25rem 1rem; }
        .sidebar-brand { font-family:Georgia,'Times New Roman',serif; font-size:1.15rem; font-weight:600; color:#2A1A0E; letter-spacing:-0.02em; }
        .sidebar-sala { display:flex; align-items:center; gap:8px; padding:0 1.25rem 0.9rem; }
        .sidebar-sala-name { font-size:0.81rem; font-weight:600; color:#7A5540; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px; font-family:'Nunito',system-ui,sans-serif; }
        .sidebar-divider { height:1px; background:rgba(234,216,200,0.65); margin:0 1rem 0.6rem; }
        .sidebar-nav { display:flex; flex-direction:column; gap:2px; padding:0 0.6rem; }
        .sidebar-item {
          display:flex; align-items:center; gap:11px;
          padding:10px 13px; border-radius:12px; width:100%;
          border:none; background:none; cursor:pointer;
          color:#8A6050; font-size:0.875rem; font-weight:600; letter-spacing:-0.01em;
          font-family:'Nunito',system-ui,sans-serif;
          transition:background 0.15s, color 0.15s; text-align:left;
        }
        .sidebar-item:hover { background:rgba(192,90,59,0.07); color:#2A1A0E; }
        .sidebar-item.active { background:rgba(192,90,59,0.1); color:#C05A3B; }
        .sidebar-spacer { flex:1; min-height:8px; }
        .sidebar-footer { padding:0.6rem; border-top:1px solid rgba(234,216,200,0.6); display:flex; flex-direction:column; gap:2px; }
        .sidebar-badge { margin-left:auto; min-width:18px; height:18px; background:#C05A3B; color:white; border-radius:999px; font-size:0.58rem; font-weight:800; display:flex; align-items:center; justify-content:center; padding:0 4px; }
        .sidebar-user { display:flex; align-items:center; gap:10px; padding:8px 13px; border-radius:12px; }
        .sidebar-user-av { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.72rem; font-weight:700; color:white; flex-shrink:0; border:2px solid rgba(255,255,255,0.5); box-shadow:0 1px 4px rgba(0,0,0,0.1); }
        .sidebar-user-name { font-size:0.8rem; font-weight:600; color:#7A5540; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px; font-family:'Nunito',system-ui,sans-serif; }

        @media (min-width: 1024px) {
          .sidebar { display: flex; }
          .sala-content { padding-bottom: 0 !important; padding-left: 224px; }
          .bnav { display: none !important; }
          .notif-panel { left: 224px; right: auto !important; width: 360px; border-radius: 0 0 22px 22px; }
        }
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
          {/* Bell */}
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
                  position: 'absolute', top: -5, right: -5,
                  background: '#C05A3B', color: 'white',
                  borderRadius: '50%', minWidth: 17, height: 17,
                  fontSize: '0.52rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid rgba(255,252,248,0.94)',
                  padding: '0 3px',
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
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 240, background: 'rgba(42,26,14,0.35)', backdropFilter: 'blur(6px)' }}
            onClick={() => setBellOpen(false)}
          />
          <div
            className="notif-panel"
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 250,
              background: '#FFF8F2',
              borderRadius: '0 0 22px 22px',
              border: '1.5px solid #EAD8C8', borderTop: 'none',
              maxHeight: '72vh', display: 'flex', flexDirection: 'column',
              paddingTop: 'env(safe-area-inset-top, 0px)',
              boxShadow: '0 12px 48px rgba(42,26,14,0.18)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem 0.875rem',
              borderBottom: '1.5px solid #EAD8C8',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: '#C05A3B' }}>
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontWeight: 800, fontSize: '0.95rem', color: '#2A1A0E', letterSpacing: '-0.01em' }}>
                  Actividad
                </span>
                {notifs.length > 0 && (
                  <span style={{ fontSize: '0.7rem', color: '#A07060', background: '#F0E8DF', borderRadius: 6, padding: '2px 7px', fontWeight: 600, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                    {notifs.length}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {notifs.length > 0 && (
                  <button
                    onClick={clearNotifs}
                    style={{ fontSize: '0.72rem', color: '#A07060', background: 'none', border: '1px solid #E0C8B8', cursor: 'pointer', fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontWeight: 600, padding: '5px 10px', borderRadius: 8 }}
                  >
                    Limpiar
                  </button>
                )}
                <button
                  onClick={() => setBellOpen(false)}
                  style={{ width: 30, height: 30, borderRadius: 8, background: '#F0E8DF', border: '1px solid #E0C8B8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A07060' }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔔</div>
                  <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontWeight: 700, color: '#2A1A0E', fontSize: '0.9rem', marginBottom: 4 }}>Sin actividad aún</div>
                  <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', color: '#B09080', fontSize: '0.78rem', lineHeight: 1.5 }}>
                    Las notificaciones de gastos, pagos,<br/>aptos y miembros aparecerán aquí.
                  </div>
                </div>
              ) : notifs.map((n: Notif) => {
                const accent = notifAccentColor(n.icon)
                return (
                  <div
                    key={n.id}
                    className={`notif-item${n.url ? ' clickable' : ''}`}
                    onClick={() => handleNotifClick(n)}
                  >
                    {/* Colored left bar */}
                    <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: '0 3px 3px 0', background: accent, opacity: 0.7 }} />
                    {/* Icon bubble */}
                    <div className="notif-icon-wrap" style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
                      {n.icon}
                    </div>
                    {/* Text */}
                    <div className="notif-body">
                      <div className="notif-text">{n.text}</div>
                      <div className="notif-time">{fmtTimeAgo(n.ts)}</div>
                    </div>
                    {/* Arrow if navigable */}
                    {n.url && (
                      <svg className="notif-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nido-icon-192.png" alt="nido" width="26" height="26" style={{ display:'block', borderRadius:'6px' }}/>
          <span className="sidebar-brand">Nido</span>
        </div>

        {session?.salaNombre && (
          <div className="sidebar-sala">
            <span style={{ fontSize: '0.95rem' }}>🏠</span>
            <span className="sidebar-sala-name">{session.salaNombre}</span>
          </div>
        )}

        <div className="sidebar-divider"/>

        <nav className="sidebar-nav">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = pathname === tab.href
            return (
              <button
                key={tab.href}
                className={`sidebar-item${isActive ? ' active' : ''}`}
                onClick={() => router.push(tab.href)}
              >
                <Icon />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-spacer"/>

        <div className="sidebar-footer">
          <button
            className={`sidebar-item${bellOpen ? ' active' : ''}`}
            onClick={() => { setBellOpen(!bellOpen); if (!bellOpen) markAllRead() }}
          >
            <div style={{ position: 'relative', display: 'flex' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span>Actividad</span>
            {unreadCount > 0 && (
              <span className="sidebar-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
          {session && (
            <button
              className="sidebar-item"
              onClick={() => router.push(`/sala/${codigo}/perfil`)}
              style={{ padding: '8px 13px' }}
            >
              <MemberAvatar
                nombre={session.miembroNombre}
                color={session.miembroColor}
                gradiente={session.miembroGradiente}
                icono={session.miembroIcono}
                fotoUrl={session.miembroFotoUrl}
                size="sm"
                className="sidebar-user-av"
              />
              <span className="sidebar-user-name">{session.miembroNombre}</span>
            </button>
          )}
        </div>
      </aside>

      {/* ── TOASTS ── */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 400,
          display: 'flex', flexDirection: 'column', gap: 6,
          width: 'min(92vw, 360px)',
          pointerEvents: 'none',
        }}>
          {toasts.map((t: Notif) => {
            const accent = notifAccentColor(t.icon)
            return (
              <div
                key={t.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px',
                  borderRadius: 14,
                  background: 'rgba(42,26,14,0.93)',
                  color: 'white',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
                  backdropFilter: 'blur(12px)',
                  animation: 'toast-in 0.3s cubic-bezier(0.22,1,0.36,1)',
                  borderLeft: `3px solid ${accent}`,
                }}
              >
                <span style={{ fontSize: '1.05rem', flexShrink: 0 }}>{t.icon}</span>
                <span style={{ flex: 1, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{t.text}</span>
              </div>
            )
          })}
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
