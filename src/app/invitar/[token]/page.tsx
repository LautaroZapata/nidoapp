'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { setSession } from '@/lib/session'
import type { Sala, Invitacion, Miembro } from '@/lib/types'
import type { PostgrestError } from '@supabase/supabase-js'

type DbResult<T> = { data: T | null; error: PostgrestError | null }
import type { User } from '@supabase/supabase-js'

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito = Nunito({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-body' })

const COLORES = [
  '#C05A3B', '#5A8869', '#C8823A', '#7B5EA7', '#2E86AB',
  '#E84855', '#3BB273', '#D4A017', '#6B4226', '#1A535C',
]

export default function InvitarPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<{ sala: Sala; invitacion: Invitacion } | null>(null)
  const [inviteError, setInviteError] = useState('')

  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Auth form
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Join form
  const [nombre, setNombre] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  // Nido actual del usuario (para advertir que lo abandonará)
  const [nidoActual, setNidoActual] = useState<{ id: string; nombre: string; miembroId: string } | null>(null)
  const [confirmandoCambio, setConfirmandoCambio] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // Listen for auth state (handles post-OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
      // Verificar si el usuario ya pertenece a un nido
      if (session?.user) {
        const { data: miembroExistente } = await supabase
          .from('miembros')
          .select('id, sala_id, salas(id, nombre)')
          .eq('user_id', session.user.id)
          .not('user_id', 'is', null)
          .single()
        if (miembroExistente) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const me = miembroExistente as any
          const sala = me.salas
          setNidoActual({ id: sala?.id, nombre: sala?.nombre ?? 'tu nido actual', miembroId: me.id })
        }
      }
    })

    // Fetch invite
    async function fetchInvite() {
      const now = new Date().toISOString()
      const { data: inv } = await supabase
        .from('invitaciones')
        .select()
        .eq('token', token)
        .is('usado_en', null)
        .gt('expires_at', now)
        .single() as { data: Invitacion | null }

      if (!inv) { setInviteError('Esta invitación no es válida o ya expiró.'); setLoading(false); return }

      const { data: sala } = await supabase.from('salas').select().eq('id', inv.sala_id).single() as { data: Sala | null }
      if (!sala) { setInviteError('No se encontró el nido.'); setLoading(false); return }

      setInvite({ sala, invitacion: inv })
      setLoading(false)
    }
    fetchInvite()

    return () => subscription.unsubscribe()
  }, [token])

  async function handleGoogle() {
    setAuthError(''); setGoogleLoading(true)
    const supabase = createClient()
    const next = encodeURIComponent(`/invitar/${token}`)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    })
    if (error) { setAuthError(error.message); setGoogleLoading(false) }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault(); setAuthError('')
    if (!email.trim() || !password) { setAuthError('Completá todos los campos'); return }
    if (password.length < 6) { setAuthError('Mínimo 6 caracteres'); return }
    setAuthSubmitting(true)
    const supabase = createClient()
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) { setAuthError('Email o contraseña incorrectos'); setAuthSubmitting(false); return }
    } else {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) { setAuthError(error.message); setAuthSubmitting(false); return }
    }
    setAuthSubmitting(false)
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault(); setJoinError('')
    if (!nombre.trim()) { setJoinError('Ingresá tu nombre'); return }
    if (!invite || !user) return

    // Si pertenece a otro nido distinto, pedir confirmación primero
    if (nidoActual && nidoActual.id !== invite.sala.id && !confirmandoCambio) {
      setConfirmandoCambio(true)
      return
    }

    setJoining(true)
    const supabase = createClient()

    // Si confirmó el cambio, desvincular del nido anterior
    if (nidoActual && nidoActual.id !== invite.sala.id) {
      await supabase.from('miembros').update({ user_id: null }).eq('id', nidoActual.miembroId)
    }

    // Check if already a member of this sala
    const { data: existing } = await supabase
      .from('miembros').select('*').eq('sala_id', invite.sala.id).eq('user_id', user.id).single() as DbResult<Miembro>
    if (existing) {
      setSession({
        salaId: invite.sala.id, salaCodigo: invite.sala.codigo, salaNombre: invite.sala.nombre,
        miembroId: existing.id, miembroNombre: existing.nombre, miembroColor: existing.color,
      })
      router.push(`/sala/${invite.sala.codigo}`)
      return
    }

    // Verificar límite de miembros según el plan del nido (server-side via API)
    const planRes = await fetch(`/api/billing/plan?salaId=${invite.sala.id}`)
    if (planRes.ok) {
      const planData = await planRes.json()
      const { data: todosCheck } = await supabase
        .from('miembros').select('id').eq('sala_id', invite.sala.id)
      const cantMiembros = todosCheck?.length ?? 0
      const maxMiembros = planData.limites?.maxMiembros  // null = ilimitado (pro), number = límite (free)
      if (maxMiembros != null && cantMiembros >= maxMiembros) {
        setJoinError(`Este nido ya alcanzó el límite de ${maxMiembros} miembros del plan Free. El dueño del nido debe upgradear a Pro para agregar más.`)
        setJoining(false); return
      }
    }

    // Get color based on member count
    const { data: todos } = await supabase.from('miembros').select('id').eq('sala_id', invite.sala.id)
    const colorIndex = ((todos?.length ?? 0)) % COLORES.length

    const { data: miembro, error: mErr } = await supabase
      .from('miembros')
      .insert({
        sala_id: invite.sala.id,
        nombre: nombre.trim().toLowerCase(),
        color: COLORES[colorIndex],
        user_id: user.id,
      })
      .select().single() as DbResult<Miembro>
    if (mErr || !miembro) {
      setJoinError(mErr?.code === '23505' ? 'Ese nombre ya está en uso en este nido' : 'Error al unirte')
      setJoining(false); return
    }

    // Mark invite as used
    await supabase.from('invitaciones').update({ usado_en: new Date().toISOString() }).eq('id', invite.invitacion.id as string)

    setSession({
      salaId: invite.sala.id, salaCodigo: invite.sala.codigo, salaNombre: invite.sala.nombre,
      miembroId: miembro.id, miembroNombre: miembro.nombre, miembroColor: miembro.color,
    })
    router.push(`/sala/${invite.sala.codigo}`)
  }

  const isLoading = loading || authLoading

  return (
    <div className={`${fraunces.variable} ${nunito.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes i-spin { to { transform: rotate(360deg); } }
        @keyframes i-up   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

        .i-root { min-height:100vh; background:#FAF5EE; font-family:var(--font-body),'Nunito',system-ui,sans-serif; color:#2A1A0E; display:flex; align-items:center; justify-content:center; padding:1.5rem; }
        .i-bg { position:fixed; inset:0; background-image:radial-gradient(circle at 20% 20%, rgba(192,90,59,0.06) 0%, transparent 40%); pointer-events:none; }
        .i-card { background:white; border-radius:24px; border:1.5px solid #EAD8C8; padding:2.5rem 2rem; width:100%; max-width:400px; box-shadow:0 4px 24px rgba(150,80,40,0.08); animation:i-up 0.5s cubic-bezier(0.22,1,0.36,1) both; position:relative; z-index:1; }

        .i-logo { display:flex; align-items:center; gap:8px; margin-bottom:2rem; }
        .i-logo-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.2rem; color:#2A1A0E; letter-spacing:-0.02em; font-weight:600; }

        .i-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.7rem; color:#2A1A0E; margin-bottom:0.3rem; font-weight:600; letter-spacing:-0.02em; }
        .i-sub { font-size:0.86rem; color:#A07060; margin-bottom:1.75rem; line-height:1.5; }

        .i-sala-chip { display:inline-flex; align-items:center; gap:8px; background:rgba(192,90,59,0.08); border:1.5px solid rgba(192,90,59,0.2); border-radius:12px; padding:8px 14px; margin-bottom:1.5rem; }
        .i-sala-chip-name { font-family:var(--font-serif),'Georgia',serif; font-size:1rem; color:#2A1A0E; font-weight:600; }

        .i-google-btn { width:100%; padding:12px 20px; background:white; color:#2A1A0E; border:1.5px solid #E0CAB8; border-radius:12px; font-size:0.92rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:all 0.18s; display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:4px; }
        .i-google-btn:hover:not(:disabled) { border-color:#C05A3B; background:#FFF8F5; transform:translateY(-1px); box-shadow:0 4px 12px rgba(192,90,59,0.1); }
        .i-google-btn:disabled { opacity:0.55; cursor:not-allowed; }

        .i-or { display:flex; align-items:center; gap:12px; margin:14px 0; color:#C8A898; font-size:0.78rem; }
        .i-or::before, .i-or::after { content:''; flex:1; height:1px; background:#EAD8C8; }

        .i-field { margin-bottom:12px; }
        .i-label { display:block; font-size:0.68rem; font-weight:700; color:#8A5A40; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.08em; }
        .i-input { width:100%; padding:11px 14px; background:#FDFAF7; border:1.5px solid #E0CAB8; border-radius:11px; font-size:0.9rem; font-family:var(--font-body),'Nunito',sans-serif; color:#2A1A0E; outline:none; transition:border-color 0.18s,box-shadow 0.18s; }
        .i-input::placeholder { color:#C0A898; }
        .i-input:focus { border-color:#C05A3B; box-shadow:0 0 0 3px rgba(192,90,59,0.1); background:white; }

        .i-btn { width:100%; padding:13px 20px; background:#C05A3B; color:white; border:none; border-radius:12px; font-size:0.93rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:background 0.18s,transform 0.15s,box-shadow 0.18s; display:flex; align-items:center; justify-content:center; gap:8px; }
        .i-btn:hover:not(:disabled) { background:#A04730; transform:translateY(-1px); box-shadow:0 8px 24px rgba(192,90,59,0.3); }
        .i-btn:disabled { opacity:0.55; cursor:not-allowed; }

        .i-error { display:flex; align-items:flex-start; gap:7px; padding:9px 12px; background:#FFF1EC; border:1px solid #F5C5B0; border-radius:9px; color:#B03A1A; font-size:0.8rem; margin-bottom:12px; line-height:1.4; }
        .i-spinner { width:14px; height:14px; border-radius:50%; border:2px solid rgba(255,255,255,0.35); border-top-color:white; animation:i-spin 0.7s linear infinite; }
        .i-spinner-dark { width:14px; height:14px; border-radius:50%; border:2px solid rgba(0,0,0,0.15); border-top-color:#2A1A0E; animation:i-spin 0.7s linear infinite; }

        .i-auth-switch { text-align:center; margin-top:14px; font-size:0.82rem; color:#A07060; }
        .i-auth-switch button { background:none; border:none; color:#C05A3B; font-weight:600; cursor:pointer; font-family:var(--font-body),'Nunito',sans-serif; font-size:0.82rem; }

        .i-err-card { text-align:center; }
        .i-err-icon { font-size:3rem; margin-bottom:12px; }
        .i-err-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.3rem; color:#2A1A0E; margin-bottom:8px; font-weight:600; }
        .i-err-sub { font-size:0.85rem; color:#A07060; line-height:1.5; }

        .i-user-info { display:flex; align-items:center; gap:8px; background:rgba(90,136,105,0.08); border:1px solid rgba(90,136,105,0.2); border-radius:10px; padding:8px 12px; margin-bottom:1.25rem; font-size:0.82rem; color:#3A7050; }

        @media (max-width: 420px) {
          .i-root { padding: 1rem 0.75rem; align-items: flex-start; padding-top: 2rem; }
          .i-card { padding: 1.75rem 1.25rem; border-radius: 18px; }
          .i-title { font-size: 1.4rem; }
          .i-sala-chip { padding: 6px 10px; }
          .i-sala-chip-name { font-size: 0.9rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .i-google-btn { padding: 11px 16px; font-size: 0.88rem; }
          .i-btn { padding: 12px 16px; }
        }
      `}</style>

      <div className="i-bg"/>
      <div className="i-root">
        <div className="i-card">
          <div className="i-logo">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <rect x="5" y="15" width="22" height="15" rx="2" fill="#FFF5EE" stroke="#DFC5B0" strokeWidth="1.5"/>
              <path d="M3 16.5L16 4.5L29 16.5" stroke="#C8823A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="13" y="22" width="6" height="8" rx="1.5" fill="#FDEBD8" stroke="#D4A880" strokeWidth="1.3"/>
              <rect x="7" y="18.5" width="4.5" height="3.5" rx="1" fill="rgba(255,210,100,0.5)" stroke="#D4C070" strokeWidth="1.1"/>
              <rect x="20.5" y="18.5" width="4.5" height="3.5" rx="1" fill="rgba(255,210,100,0.5)" stroke="#D4C070" strokeWidth="1.1"/>
            </svg>
            <span className="i-logo-title">Nido</span>
          </div>

          {isLoading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:'2rem 0' }}>
              <div style={{ width:32, height:32, borderRadius:'50%', border:'2.5px solid #C05A3B', borderTopColor:'transparent', animation:'i-spin 0.8s linear infinite' }}/>
            </div>
          ) : inviteError ? (
            <div className="i-err-card">
              <div className="i-err-icon">🏚️</div>
              <div className="i-err-title">Invitación no válida</div>
              <div className="i-err-sub">{inviteError}</div>
              <button onClick={() => router.push('/')} style={{ marginTop:16, background:'none', border:'none', color:'#C05A3B', fontWeight:600, cursor:'pointer', fontSize:'0.85rem', fontFamily:'var(--font-body),Nunito,sans-serif' }}>
                Ir al inicio →
              </button>
            </div>
          ) : !user ? (
            // Not logged in: show auth form
            <>
              <div className="i-sala-chip">
                <span>🏠</span>
                <span className="i-sala-chip-name">{invite!.sala.nombre}</span>
              </div>
              <div className="i-title">{authMode === 'login' ? '¡Te invitaron!' : 'Crear cuenta'}</div>
              <div className="i-sub">
                {authMode === 'login'
                  ? `Iniciá sesión para unirte a ${invite!.sala.nombre}`
                  : `Registrate para unirte a ${invite!.sala.nombre}`}
              </div>

              <button className="i-google-btn" onClick={handleGoogle} disabled={googleLoading}>
                {googleLoading ? <span className="i-spinner-dark"/> : (
                  <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                )}
                Continuar con Google
              </button>

              <div className="i-or">o</div>

              <form onSubmit={handleAuth}>
                <div className="i-field">
                  <label className="i-label">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className="i-input" autoFocus/>
                </div>
                <div className="i-field">
                  <label className="i-label">Contraseña</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mín. 6 caracteres" className="i-input"/>
                </div>
                {authError && (
                  <div className="i-error">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="7" cy="9.5" r="0.6" fill="currentColor"/></svg>
                    {authError}
                  </div>
                )}
                <button type="submit" className="i-btn" disabled={authSubmitting}>
                  {authSubmitting ? <><span className="i-spinner"/>{authMode === 'login' ? 'Entrando...' : 'Creando...'}</> : authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                </button>
              </form>
              <div className="i-auth-switch">
                {authMode === 'login'
                  ? <>¿Sin cuenta? <button onClick={() => { setAuthMode('signup'); setAuthError('') }}>Crear una →</button></>
                  : <>¿Ya tenés? <button onClick={() => { setAuthMode('login'); setAuthError('') }}>Iniciar sesión</button></>}
              </div>
            </>
          ) : confirmandoCambio ? (
            // Confirmación de cambio de nido
            <>
              <div style={{ textAlign:'center', marginBottom:'1rem', fontSize:'2.5rem' }}>🏚️</div>
              <div className="i-title" style={{ fontSize:'1.3rem' }}>¿Cambiar de nido?</div>
              <div className="i-sub">
                Ya estás en <strong>{nidoActual?.nombre}</strong>. Si te unís a <strong>{invite!.sala.nombre}</strong>, salís del nido anterior automáticamente. Tu historial se mantiene.
              </div>
              <button className="i-btn" onClick={() => { setConfirmandoCambio(false); document.querySelector<HTMLFormElement>('form')?.requestSubmit() }} style={{ marginBottom:8 }}>
                Sí, cambiar a {invite!.sala.nombre}
              </button>
              <button onClick={() => setConfirmandoCambio(false)} style={{ width:'100%', padding:11, background:'none', border:'none', color:'#A07060', fontSize:'0.86rem', fontFamily:'var(--font-body),Nunito,sans-serif', cursor:'pointer' }}>
                Cancelar
              </button>
            </>
          ) : (
            // Logged in: show join confirmation
            <>
              <div className="i-sala-chip">
                <span>🏠</span>
                <span className="i-sala-chip-name">{invite!.sala.nombre}</span>
              </div>
              <div className="i-title">Unirte al nido</div>
              <div className="i-sub">Elegí el nombre con el que te van a ver tus compañeros</div>

              <div className="i-user-info">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M5 7l1.5 1.5L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Sesión activa: {user.email}
              </div>

              <form onSubmit={handleJoin}>
                <div className="i-field">
                  <label className="i-label">Tu nombre en el nido</label>
                  <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                    placeholder="Ej: lauta, caro, pepito..." className="i-input" autoFocus autoComplete="off"/>
                </div>
                {joinError && (
                  <div className="i-error">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="7" cy="9.5" r="0.6" fill="currentColor"/></svg>
                    {joinError}
                  </div>
                )}
                <button type="submit" className="i-btn" disabled={joining}>
                  {joining ? <><span className="i-spinner"/>Uniéndome...</> : `Unirme a ${invite!.sala.nombre}`}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
