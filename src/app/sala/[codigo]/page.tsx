'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession, clearSession } from '@/lib/session'
import type { Miembro, Invitacion } from '@/lib/types'
import type { PostgrestError } from '@supabase/supabase-js'
import dynamic from 'next/dynamic'
import { registrarPush, estadoPush } from '@/lib/push'

const OnboardingModal = dynamic(() => import('@/components/OnboardingModal'), { ssr: false })

type DbResult<T> = { data: T | null; error: PostgrestError | null }

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito = Nunito({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-body' })

export default function SalaPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string
  const [session, setLocalSession] = useState(getSession())
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [copiado, setCopiado] = useState(false)

  // Menu dropdown
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLinkCopiado, setInviteLinkCopiado] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)

  // Leave confirmation
  const [showLeave, setShowLeave] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)

  // WhatsApp link
  const [showWpp, setShowWpp] = useState(false)
  const [wppCode, setWppCode] = useState('')
  const [wppLoading, setWppLoading] = useState(false)
  const [wppCopiado, setWppCopiado] = useState(false)

  // Onboarding + Push
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('unsupported')
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    const s = getSession()
    if (!s || s.salaCodigo !== codigo) { router.replace('/'); return }
    setLocalSession(s)

    const supabase = createClient()

    // Check Supabase auth
    supabase.auth.getSession().then(({ data: { session: authSession } }) => {
      if (!authSession) { clearSession(); router.replace('/'); return }
    })

    supabase.from('miembros').select().eq('sala_id', s.salaId).then(({ data }) => {
      if (data) setMiembros(data as Miembro[])
    })

    // Mostrar onboarding si es la primera vez
    const onboardedKey = `nido_onboarded_${s.miembroId}`
    if (!localStorage.getItem(onboardedKey)) {
      setTimeout(() => setShowOnboarding(true), 600)
    }

    // Estado de notificaciones push
    estadoPush().then(setPushStatus)
  }, [codigo, router])

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  function copiarCodigo() {
    navigator.clipboard.writeText(codigo)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function handleInvitar() {
    setInviteLoading(true); setShowInvite(true); setInviteLink('')
    const supabase = createClient()
    const s = getSession()
    if (!s) return

    const { data: inv } = await supabase
      .from('invitaciones')
      .insert({ sala_id: s.salaId, creado_por: s.miembroId })
      .select().single() as DbResult<Invitacion>

    if (inv) setInviteLink(`${window.location.origin}/invitar/${inv.token}`)
    setInviteLoading(false)
  }

  async function handleLeave() {
    setLeaveLoading(true)
    const supabase = createClient()
    const s = getSession()
    if (!s) return
    // Deslink user_id pero mantiene el miembro (para historial de gastos, etc.)
    await supabase.from('miembros').update({ user_id: null }).eq('id', s.miembroId)
    clearSession()
    router.replace('/dashboard')
  }

  async function handleConectarWpp() {
    setWppLoading(true); setShowWpp(true); setWppCode('')
    const s = getSession()
    if (!s) return
    const res = await fetch('/api/whatsapp/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ miembro_id: s.miembroId, sala_id: s.salaId }),
    })
    const data = await res.json()
    if (data.code) setWppCode(data.code)
    setWppLoading(false)
  }

  function copiarWppCode() {
    navigator.clipboard.writeText(wppCode)
    setWppCopiado(true)
    setTimeout(() => setWppCopiado(false), 2000)
  }

  async function handleSignOut() {
    const supabase = createClient()
    clearSession()
    await supabase.auth.signOut()
    router.replace('/')
  }

  function copiarInviteLink() {
    navigator.clipboard.writeText(inviteLink)
    setInviteLinkCopiado(true)
    setTimeout(() => setInviteLinkCopiado(false), 2000)
  }

  if (!session) return null

  const modulos = [
    { nombre: 'Aptos', descripcion: 'Buscar y comparar aptos', href: `/sala/${codigo}/pisos`, icono: '🏠', disponible: true, color: '#C05A3B' },
    { nombre: 'Gastos', descripcion: 'Gastos compartidos', href: `/sala/${codigo}/gastos`, icono: '💰', disponible: true, color: '#5A8869' },
    { nombre: 'Compras', descripcion: 'Lista de compras', href: `/sala/${codigo}/compras`, icono: '🛒', disponible: true, color: '#C8823A' },
    { nombre: 'Tareas', descripcion: 'Rotación de tareas', href: `/sala/${codigo}/tareas`, icono: '✅', disponible: false, color: '#A09080' },
  ]

  return (
    <div className={`${fraunces.variable} ${nunito.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes s-fadeup { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes s-in     { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes s-card   { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes s-modal  { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .s-root { min-height: 100vh; background: #FAF5EE; font-family: var(--font-body), 'Nunito', system-ui, sans-serif; color: #2A1A0E; }
        .s-bg-pattern {
          position: fixed; inset: 0;
          background-image: radial-gradient(circle at 15% 20%, rgba(192,90,59,0.05) 0%, transparent 40%),
            radial-gradient(circle at 85% 80%, rgba(200,130,58,0.05) 0%, transparent 40%);
          pointer-events: none; z-index: 0;
        }
        .s-wrap { position: relative; z-index: 1; max-width: 500px; margin: 0 auto; padding: 0 1.25rem 2rem; }

        /* Header */
        .s-header { display: flex; align-items: center; justify-content: space-between; padding: 1.75rem 0 1.5rem; animation: s-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; position: relative; z-index: 20; }
        .s-sala-name { font-family: var(--font-serif), 'Georgia', serif; font-size: 1.6rem; font-weight: 600; color: #2A1A0E; letter-spacing: -0.02em; }
        .s-code-btn { font-size: 0.8rem; color: #A07060; background: none; border: none; cursor: pointer; transition: color 0.18s; padding: 0; margin-top: 2px; font-family: var(--font-body), 'Nunito', sans-serif; }
        .s-code-btn:hover { color: #C05A3B; }
        .s-code-mono { font-weight: 700; letter-spacing: 0.05em; }
        .s-header-right { display: flex; align-items: center; gap: 10px; }

        /* Invite button */
        .s-invite-btn { display:flex; align-items:center; gap:5px; padding:7px 13px; background:#C05A3B; color:white; border:none; border-radius:999px; font-size:0.78rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:all 0.18s; }
        .s-invite-btn:hover { background:#A04730; transform:translateY(-1px); box-shadow:0 4px 12px rgba(192,90,59,0.3); }

        /* Avatar + menu */
        .s-menu-wrap { position: relative; }
        .s-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700; color: white; border: 2.5px solid rgba(255,255,255,0.6); box-shadow: 0 2px 8px rgba(0,0,0,0.12); cursor: pointer; transition: transform 0.15s; }
        .s-avatar:hover { transform: scale(1.05); }
        .s-dropdown { position:absolute; right:0; top:calc(100% + 8px); background:white; border:1.5px solid #EAD8C8; border-radius:14px; box-shadow:0 8px 28px rgba(150,80,40,0.12); min-width:180px; overflow:hidden; z-index:50; animation:s-modal 0.2s cubic-bezier(0.22,1,0.36,1) both; }
        .s-dropdown-item { display:flex; align-items:center; gap:9px; width:100%; padding:11px 16px; background:none; border:none; font-size:0.88rem; font-family:var(--font-body),'Nunito',sans-serif; color:#2A1A0E; cursor:pointer; text-align:left; transition:background 0.15s; }
        .s-dropdown-item:hover { background:#FFF8F5; }
        .s-dropdown-item.danger { color:#C04040; }
        .s-dropdown-item.danger:hover { background:#FFF1EC; }
        .s-dropdown-sep { height:1px; background:#EAD8C8; margin:4px 0; }
        .s-dropdown-label { padding:8px 16px 4px; font-size:0.68rem; font-weight:700; color:#B09080; text-transform:uppercase; letter-spacing:0.08em; }

        /* Members card */
        .s-miembros { background: white; border-radius: 18px; border: 1.5px solid #EAD8C8; padding: 1.1rem 1.25rem; margin-bottom: 1.5rem; animation: s-fadeup 0.5s 0.05s cubic-bezier(0.22, 1, 0.36, 1) both; box-shadow: 0 2px 12px rgba(150,80,40,0.06); }
        .s-miembros-label { font-size: 0.7rem; font-weight: 700; color: #B09080; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 10px; }
        .s-miembros-list { display: flex; gap: 14px; flex-wrap: wrap; }
        .s-miembro { display: flex; align-items: center; gap: 8px; }
        .s-miembro-av { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: white; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
        .s-miembro-name { font-size: 0.85rem; font-weight: 600; color: #2A1A0E; }
        .s-miembro-you { font-size: 0.72rem; color: #C05A3B; font-weight: 500; }

        /* Module grid */
        .s-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; animation: s-fadeup 0.5s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .s-mod { background: white; border-radius: 20px; border: 1.5px solid #EAD8C8; padding: 1.25rem 1.1rem; text-align: left; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s; box-shadow: 0 2px 12px rgba(150,80,40,0.06); animation: s-card 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; position: relative; overflow: hidden; }
        .s-mod::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 20px 20px 0 0; opacity: 0; transition: opacity 0.2s; }
        .s-mod:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(150,80,40,0.12); border-color: #D4B8A0; }
        .s-mod:hover::before { opacity: 1; }
        .s-mod:active { transform: translateY(-1px); }
        .s-mod.disabled { opacity: 0.5; cursor: not-allowed; }
        .s-mod.disabled:hover { transform: none; box-shadow: 0 2px 12px rgba(150,80,40,0.06); }
        .s-mod-icon { font-size: 1.8rem; margin-bottom: 8px; line-height: 1; }
        .s-mod-name { font-size: 0.95rem; font-weight: 700; color: #2A1A0E; margin-bottom: 3px; }
        .s-mod-desc { font-size: 0.75rem; color: #A07060; font-weight: 400; }
        .s-mod-soon { font-size: 0.72rem; color: #C05A3B; font-weight: 600; margin-top: 5px; }

        /* Invite modal */
        .s-overlay { position:fixed; inset:0; background:rgba(42,26,14,0.45); backdrop-filter:blur(4px); z-index:100; display:flex; align-items:flex-end; justify-content:center; }
        @media (min-width:480px) { .s-overlay { align-items:center; } }
        .s-modal { background:#FAF5EE; border-radius:24px 24px 0 0; width:100%; max-width:420px; padding:2rem 1.5rem 2.5rem; animation:s-modal 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        @media (min-width:480px) { .s-modal { border-radius:24px; } }
        .s-modal-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.4rem; color:#2A1A0E; margin-bottom:0.25rem; font-weight:600; }
        .s-modal-sub { font-size:0.84rem; color:#A07060; margin-bottom:1.25rem; line-height:1.5; }
        .s-link-box { background:white; border:1.5px solid #E0CAB8; border-radius:12px; padding:11px 14px; font-size:0.82rem; color:#6B4030; word-break:break-all; margin-bottom:12px; font-family:monospace; }
        .s-copy-btn { width:100%; padding:12px; background:#C05A3B; color:white; border:none; border-radius:12px; font-size:0.9rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:all 0.18s; display:flex; align-items:center; justify-content:center; gap:7px; }
        .s-copy-btn:hover { background:#A04730; }
        .s-copy-btn.copied { background:#5A8869; }
        .s-modal-note { font-size:0.75rem; color:#B09080; margin-top:10px; text-align:center; }
        .s-modal-close { width:100%; padding:11px; background:none; border:none; color:#A07060; font-size:0.86rem; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; margin-top:6px; transition:color 0.18s; }
        .s-modal-close:hover { color:#C05A3B; }

        /* Leave confirm */
        .s-leave-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.3rem; color:#2A1A0E; margin-bottom:0.3rem; font-weight:600; }
        .s-leave-sub { font-size:0.84rem; color:#A07060; margin-bottom:1.5rem; line-height:1.5; }
        .s-btn-danger { width:100%; padding:13px; background:#C04040; color:white; border:none; border-radius:12px; font-size:0.9rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:all 0.18s; display:flex; align-items:center; justify-content:center; gap:7px; }
        .s-btn-danger:hover:not(:disabled) { background:#A03030; }
        .s-btn-danger:disabled { opacity:0.55; cursor:not-allowed; }
        .s-spinner { width:14px; height:14px; border-radius:50%; border:2px solid rgba(255,255,255,0.35); border-top-color:white; animation:s-spin 0.7s linear infinite; }
        @keyframes s-spin { to { transform:rotate(360deg); } }

        @media (max-width: 480px) {
          .s-wrap { padding: 0 1rem 3rem; }
          .s-header { padding: 1.25rem 0 1.25rem; }
          .s-sala-name { font-size: 1.3rem; }
          .s-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
          .s-mod { padding: 1.1rem 0.9rem; border-radius: 16px; }
          .s-mod-icon { font-size: 1.5rem; margin-bottom: 6px; }
          .s-mod-name { font-size: 0.88rem; }
          .s-mod-desc { font-size: 0.7rem; }
          .s-miembros { padding: 0.9rem 1rem; }
          .s-invite-btn span { display:none; }
        }
        @media (max-width: 360px) {
          .s-wrap { padding: 0 0.75rem 3rem; }
          .s-sala-name { font-size: 1.1rem; }
          .s-header-right { gap: 6px; }
        }
      `}</style>

      <div className="s-root">
        <div className="s-bg-pattern" />
        <div className="s-wrap">

          <div className="s-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nido-icon.png" alt="nido" width="28" height="28" style={{ objectFit:'contain' }}/>
                <div className="s-sala-name">{session.salaNombre}</div>
              </div>
              <button className="s-code-btn" onClick={copiarCodigo}>
                Contraseña: <span className="s-code-mono">{codigo}</span>
                {copiado ? ' · ¡Copiada!' : ' · Copiar'}
              </button>
            </div>
            <div className="s-header-right">
              <button className="s-invite-btn" onClick={handleInvitar}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>Invitar</span>
              </button>
              <div className="s-menu-wrap" ref={menuRef}>
                <div
                  className="s-avatar"
                  style={{ backgroundColor: session.miembroColor }}
                  onClick={() => setMenuOpen(v => !v)}
                  role="button"
                  aria-label="Menú"
                >
                  {session.miembroNombre[0].toUpperCase()}
                </div>
                {menuOpen && (
                  <div className="s-dropdown">
                    <div className="s-dropdown-label">{session.miembroNombre}</div>
                    <button className="s-dropdown-item" onClick={() => { setMenuOpen(false); router.push('/dashboard') }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 12c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      Mis nidos
                    </button>
                    {(() => {
                      const miMiembro = miembros.find(m => m.id === session.miembroId)
                      const wppConectado = !!miMiembro?.whatsapp_phone
                      return wppConectado ? (
                        <div className="s-dropdown-item" style={{ cursor: 'default', opacity: 0.6 }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5C3.96 1.5 1.5 3.96 1.5 7c0 .94.24 1.83.66 2.6L1.5 12.5l2.98-.64A5.47 5.47 0 007 12.5c3.04 0 5.5-2.46 5.5-5.5S10.04 1.5 7 1.5z" stroke="#25D366" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5 5.5s.5 1 1.5 2 2 1.5 2 1.5" stroke="#25D366" strokeWidth="1.3" strokeLinecap="round"/></svg>
                          ✓ WhatsApp conectado
                        </div>
                      ) : (
                        <button className="s-dropdown-item" onClick={() => { setMenuOpen(false); handleConectarWpp() }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5C3.96 1.5 1.5 3.96 1.5 7c0 .94.24 1.83.66 2.6L1.5 12.5l2.98-.64A5.47 5.47 0 007 12.5c3.04 0 5.5-2.46 5.5-5.5S10.04 1.5 7 1.5z" stroke="#25D366" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5 5.5s.5 1 1.5 2 2 1.5 2 1.5" stroke="#25D366" strokeWidth="1.3" strokeLinecap="round"/></svg>
                          Conectar WhatsApp
                        </button>
                      )
                    })()}
                    {pushStatus !== 'unsupported' && (
                      <button
                        className="s-dropdown-item"
                        disabled={pushLoading || pushStatus === 'denied'}
                        onClick={async () => {
                          setMenuOpen(false)
                          if (pushStatus === 'granted') return
                          setPushLoading(true)
                          const ok = await registrarPush(session.miembroId, session.salaId)
                          if (ok) setPushStatus('granted')
                          setPushLoading(false)
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M7 1.5v1M7 11.5v1M2.5 7h-1M12.5 7h-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          <path d="M3.5 7c0-1.93 1.57-3.5 3.5-3.5S10.5 5.07 10.5 7v2.5H3.5V7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                          <path d="M5.5 9.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5" stroke="currentColor" strokeWidth="1.3"/>
                        </svg>
                        {pushStatus === 'granted' ? '✓ Notificaciones activas' : pushStatus === 'denied' ? 'Notificaciones bloqueadas' : pushLoading ? 'Activando...' : 'Activar notificaciones'}
                      </button>
                    )}
                    <div className="s-dropdown-sep"/>
                    <button className="s-dropdown-item danger" onClick={() => { setMenuOpen(false); setShowLeave(true) }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 7h7M9.5 4.5L12 7l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      Salir del nido
                    </button>
                    <button className="s-dropdown-item danger" onClick={handleSignOut}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8 7H1M4.5 4.5L2 7l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 2h4a1 1 0 011 1v8a1 1 0 01-1 1H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="s-miembros">
            <div className="s-miembros-label">Miembros · {miembros.length}</div>
            <div className="s-miembros-list">
              {miembros.map((m) => (
                <div key={m.id} className="s-miembro">
                  <div className="s-miembro-av" style={{ backgroundColor: m.color }}>
                    {m.nombre[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="s-miembro-name">{m.nombre}</div>
                    {m.id === session.miembroId && <div className="s-miembro-you">tú</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modules */}
          <div className="s-grid">
            {modulos.map((mod, idx) => (
              <button
                key={mod.nombre}
                onClick={() => mod.disponible && router.push(mod.href)}
                disabled={!mod.disponible}
                className={`s-mod${!mod.disponible ? ' disabled' : ''}`}
                style={{ animationDelay: `${0.1 + idx * 0.06}s` }}
              >
                <style>{`.s-mod:nth-child(${idx + 1})::before { background: ${mod.color}; }`}</style>
                <div className="s-mod-icon">{mod.icono}</div>
                <div className="s-mod-name">{mod.nombre}</div>
                <div className="s-mod-desc">{mod.descripcion}</div>
                {!mod.disponible && <div className="s-mod-soon">Próximamente</div>}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="s-overlay" onClick={e => { if (e.target === e.currentTarget) setShowInvite(false) }}>
          <div className="s-modal">
            <div className="s-modal-title">Invitar al nido 🔑</div>
            <div className="s-modal-sub">
              Compartí este link. Es válido por 7 días y puede usarse una sola vez.
            </div>
            {inviteLoading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:'1.5rem 0' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', border:'2.5px solid #C05A3B', borderTopColor:'transparent', animation:'s-spin 0.8s linear infinite' }}/>
              </div>
            ) : inviteLink ? (
              <>
                <div className="s-link-box">{inviteLink}</div>
                <button className={`s-copy-btn${inviteLinkCopiado ? ' copied' : ''}`} onClick={copiarInviteLink}>
                  {inviteLinkCopiado
                    ? <><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>¡Link copiado!</>
                    : <><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M9 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v5a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>Copiar link</>}
                </button>
                <div className="s-modal-note">Válido 7 días · Un solo uso</div>
              </>
            ) : (
              <div style={{ color:'#C04040', fontSize:'0.85rem' }}>Error al generar el link</div>
            )}
            <button className="s-modal-close" onClick={() => setShowInvite(false)}>Cerrar</button>
          </div>
        </div>
      )}

      {/* WhatsApp link modal */}
      {showWpp && (
        <div className="s-overlay" onClick={e => { if (e.target === e.currentTarget) setShowWpp(false) }}>
          <div className="s-modal">
            <div className="s-modal-title">Conectar WhatsApp 💬</div>
            <div className="s-modal-sub">
              Enviá este código al bot de Nido por WhatsApp. Expira en 15 minutos.
            </div>
            {wppLoading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:'1.5rem 0' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', border:'2.5px solid #25D366', borderTopColor:'transparent', animation:'s-spin 0.8s linear infinite' }}/>
              </div>
            ) : wppCode ? (
              <>
                <div style={{ background:'white', border:'1.5px solid #E0CAB8', borderRadius:12, padding:'20px 14px', textAlign:'center', marginBottom:12 }}>
                  <div style={{ fontSize:'0.72rem', color:'#B09080', marginBottom:6, letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:700 }}>Tu código</div>
                  <div style={{ fontSize:'2.2rem', fontWeight:800, letterSpacing:'0.3em', color:'#2A1A0E', fontFamily:'monospace' }}>{wppCode}</div>
                </div>
                <button
                  className={`s-copy-btn${wppCopiado ? ' copied' : ''}`}
                  style={{ background: wppCopiado ? '#5A8869' : '#25D366' }}
                  onClick={copiarWppCode}
                >
                  {wppCopiado ? '¡Código copiado!' : 'Copiar código'}
                </button>
                <div className="s-modal-note">Envialo al número del bot de Nido en WhatsApp</div>
              </>
            ) : (
              <div style={{ color:'#C04040', fontSize:'0.85rem' }}>Error al generar el código</div>
            )}
            <button className="s-modal-close" onClick={() => setShowWpp(false)}>Cerrar</button>
          </div>
        </div>
      )}

      {/* Onboarding */}
      {showOnboarding && session && miembros.length > 0 && (
        <OnboardingModal
          salaNombre={session.salaNombre}
          miembros={miembros}
          miembroId={session.miembroId}
          onClose={() => setShowOnboarding(false)}
        />
      )}

      {/* Leave confirmation */}
      {showLeave && (
        <div className="s-overlay" onClick={e => { if (e.target === e.currentTarget) setShowLeave(false) }}>
          <div className="s-modal">
            <div className="s-leave-title">¿Salir del nido? 🏚️</div>
            <div className="s-leave-sub">
              Vas a salir de <strong>{session.salaNombre}</strong>. Tu historial de gastos y actividad se mantiene. Podés volver a unirte si alguien te invita.
            </div>
            <button className="s-btn-danger" onClick={handleLeave} disabled={leaveLoading}>
              {leaveLoading ? <><span className="s-spinner"/>Saliendo...</> : 'Sí, salir del nido'}
            </button>
            <button className="s-modal-close" onClick={() => setShowLeave(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
