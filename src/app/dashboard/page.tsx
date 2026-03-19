'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fraunces, Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { setSession, clearSession } from '@/lib/session'
import type { Sala, Miembro } from '@/lib/types'
import type { PostgrestError } from '@supabase/supabase-js'

type DbResult<T> = { data: T | null; error: PostgrestError | null }
import type { User } from '@supabase/supabase-js'

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito = Nunito({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-body' })

const COLORES = [
  '#C05A3B', '#5A8869', '#C8823A', '#7B5EA7', '#2E86AB',
  '#E84855', '#3BB273', '#D4A017', '#6B4226', '#1A535C',
]

type MiembroConSala = Miembro & { salas: Sala }

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [memberships, setMemberships] = useState<MiembroConSala[]>([])
  const [loading, setLoading] = useState(true)

  // Create nido modal
  const [showCreate, setShowCreate] = useState(false)
  const [cNombreNido, setCNombreNido] = useState('')
  const [cCodigo, setCCodigo] = useState('')
  const [cNombre, setCNombre] = useState('')
  const [cLoading, setCLoading] = useState(false)
  const [cError, setCError] = useState('')
  const [cShowCodigo, setCShowCodigo] = useState(false)

useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/'); return }
      setUser(user)

      const { data } = await supabase
        .from('miembros')
        .select('*, salas(*)')
        .eq('user_id', user.id)
      setMemberships((data ?? []) as MiembroConSala[])
      setLoading(false)
    })
  }, [router])

  async function handleSignOut() {
    const supabase = createClient()
    clearSession()
    await supabase.auth.signOut()
    router.replace('/')
  }

  function enterSala(m: MiembroConSala) {
    setSession({
      salaId: m.salas.id,
      salaCodigo: m.salas.codigo,
      salaNombre: m.salas.nombre,
      miembroId: m.id,
      miembroNombre: m.nombre,
      miembroColor: m.color,
    })
    router.push(`/sala/${m.salas.codigo}`)
  }

async function handleCrearNido(e: React.FormEvent) {
    e.preventDefault(); setCError('')
    if (!cNombreNido.trim()) { setCError('Ingresá el nombre del nido'); return }
    if (cCodigo.trim().length < 3) { setCError('La contraseña del nido debe tener mínimo 3 caracteres'); return }
    if (!cNombre.trim()) { setCError('Ingresá tu nombre en el nido'); return }
    setCLoading(true)

    const supabase = createClient()

    // Verificar límite Free: máximo 1 nido creado
    const { data: nidosPropios } = await supabase
      .from('salas').select('id, plan_type').eq('owner_user_id', user!.id)
    const nidosExistentes = nidosPropios ?? []
    const tieneProActivo = nidosExistentes.some(s => s.plan_type === 'pro')
    if (!tieneProActivo && nidosExistentes.length >= 1) {
      setCError('Con el plan Free solo podés tener 1 nido. Upgrade a Pro para crear más.')
      setCLoading(false); return
    }

    const { data: existe } = await supabase.from('salas').select('id').eq('codigo', cCodigo.trim()).single()
    if (existe) { setCError('Esa contraseña ya está en uso. Elegí otra.'); setCLoading(false); return }

    const { data: sala, error: sErr } = await supabase
      .from('salas').insert({ codigo: cCodigo.trim(), nombre: cNombreNido.trim(), owner_user_id: user!.id })
      .select().single() as DbResult<Sala>
    if (sErr || !sala) { setCError('Error al crear el nido'); setCLoading(false); return }

    const { data: miembro, error: mErr } = await supabase
      .from('miembros')
      .insert({ sala_id: sala.id, nombre: cNombre.trim().toLowerCase(), color: COLORES[0], user_id: user!.id })
      .select().single() as DbResult<Miembro>
    if (mErr || !miembro) { setCError('Error al crear tu cuenta'); setCLoading(false); return }

    setSession({
      salaId: sala.id, salaCodigo: sala.codigo, salaNombre: sala.nombre,
      miembroId: miembro.id, miembroNombre: miembro.nombre, miembroColor: miembro.color,
    })
    router.push(`/sala/${sala.codigo}`)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#FAF5EE' }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'2.5px solid #C05A3B', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div className={`${fraunces.variable} ${nunito.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes d-spin  { to { transform: rotate(360deg); } }
        @keyframes d-up    { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes d-in    { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
        @keyframes d-modal { from { opacity:0; transform:translateY(24px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }

        .d-root { min-height: 100vh; background: #FAF5EE; font-family: var(--font-body),'Nunito',system-ui,sans-serif; color: #2A1A0E; }
        .d-bg { position:fixed; inset:0; background-image:radial-gradient(circle at 15% 20%, rgba(192,90,59,0.05) 0%, transparent 40%), radial-gradient(circle at 85% 80%, rgba(200,130,58,0.05) 0%, transparent 40%); pointer-events:none; z-index:0; }
        .d-wrap { position:relative; z-index:1; max-width:480px; margin:0 auto; padding:0 1.25rem 4rem; }
        @media (min-width: 1024px) {
          .d-wrap { max-width: none; padding: 0 3rem 4rem; }
          .d-desktop-cols { display: grid; grid-template-columns: 1fr 380px; gap: 2rem; align-items: start; }
        }

        .d-header { display:flex; align-items:center; justify-content:space-between; padding:1.75rem 0 2rem; animation:d-in 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .d-logo { display:flex; align-items:center; gap:8px; }
        .d-logo-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.5rem; color:#2A1A0E; letter-spacing:-0.02em; font-weight:600; }
        .d-signout { font-size:0.82rem; color:#A07060; background:none; border:none; cursor:pointer; transition:color 0.18s; font-family:var(--font-body),'Nunito',sans-serif; }
        .d-signout:hover { color:#C04040; }

        .d-greeting { margin-bottom:2rem; animation:d-up 0.5s 0.05s cubic-bezier(0.22,1,0.36,1) both; }
        .d-greeting-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.75rem; color:#2A1A0E; letter-spacing:-0.02em; font-weight:600; margin-bottom:4px; }
        .d-greeting-sub { font-size:0.87rem; color:#A07060; }

        .d-section-label { font-size:0.7rem; font-weight:700; color:#B09080; text-transform:uppercase; letter-spacing:0.09em; margin-bottom:10px; }

        .d-sala-card {
          background:white; border-radius:18px; border:1.5px solid #EAD8C8;
          padding:1.1rem 1.25rem; margin-bottom:10px;
          display:flex; align-items:center; justify-content:space-between;
          cursor:pointer; transition:all 0.2s;
          box-shadow:0 2px 12px rgba(150,80,40,0.06);
          animation:d-up 0.5s cubic-bezier(0.22,1,0.36,1) both;
          width:100%; text-align:left;
        }
        .d-sala-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(150,80,40,0.12); border-color:#D4B8A0; }
        .d-sala-info { display:flex; align-items:center; gap:12px; }
        .d-sala-av { width:42px; height:42px; border-radius:12px; background:#C05A3B; display:flex; align-items:center; justify-content:center; font-size:1.2rem; flex-shrink:0; }
        .d-sala-name { font-size:1rem; font-weight:700; color:#2A1A0E; margin-bottom:2px; font-family:var(--font-serif),'Georgia',serif; }
        .d-sala-meta { font-size:0.78rem; color:#A07060; }
        .d-sala-arrow { color:#D4B8A0; flex-shrink:0; }

        .d-empty { background:white; border-radius:18px; border:1.5px solid #EAD8C8; padding:2rem 1.5rem; text-align:center; margin-bottom:1.5rem; animation:d-up 0.5s 0.1s cubic-bezier(0.22,1,0.36,1) both; }
        .d-empty-icon { font-size:2.5rem; margin-bottom:10px; }
        .d-empty-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.1rem; color:#2A1A0E; margin-bottom:6px; font-weight:600; }
        .d-empty-sub { font-size:0.84rem; color:#A07060; line-height:1.5; }

        .d-btn-primary { width:100%; padding:14px 20px; background:#C05A3B; color:white; border:none; border-radius:14px; font-size:0.95rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:background 0.18s,transform 0.15s,box-shadow 0.18s; display:flex; align-items:center; justify-content:center; gap:8px; }
        .d-btn-primary:hover:not(:disabled) { background:#A04730; transform:translateY(-1.5px); box-shadow:0 10px 28px rgba(192,90,59,0.35); }
        .d-btn-primary:disabled { opacity:0.55; cursor:not-allowed; }
        .d-btn-secondary { width:100%; padding:13px 20px; background:white; color:#8A5A40; border:1.5px solid #E0CAB8; border-radius:14px; font-size:0.9rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:all 0.18s; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:10px; }
        .d-btn-secondary:hover { border-color:#C05A3B; color:#C05A3B; background:#FFF8F5; transform:translateY(-1px); }

        /* Modal */
        .d-overlay { position:fixed; inset:0; background:rgba(42,26,14,0.45); backdrop-filter:blur(4px); z-index:500; display:flex; align-items:flex-end; justify-content:center; padding-bottom:env(safe-area-inset-bottom,0px); }
        @media (min-width:480px) { .d-overlay { align-items:center; padding-bottom:0; } }
        .d-modal { background:#FAF5EE; border-radius:24px 24px 0 0; width:100%; max-width:440px; padding:2rem 1.5rem 2.5rem; animation:d-modal 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        @media (min-width:480px) { .d-modal { border-radius:24px; } }
        .d-modal-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.5rem; color:#2A1A0E; margin-bottom:0.25rem; font-weight:600; }
        .d-modal-sub { font-size:0.85rem; color:#A07060; margin-bottom:1.5rem; }
        .d-field { margin-bottom:14px; }
        .d-label { display:block; font-size:0.7rem; font-weight:700; color:#8A5A40; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.08em; }
        .d-input { width:100%; padding:12px 15px; background:white; border:1.5px solid #E0CAB8; border-radius:12px; font-size:0.92rem; font-family:var(--font-body),'Nunito',sans-serif; color:#2A1A0E; outline:none; transition:border-color 0.18s,box-shadow 0.18s; }
        .d-input::placeholder { color:#C0A898; }
        .d-input:focus { border-color:#C05A3B; box-shadow:0 0 0 3.5px rgba(192,90,59,0.12); }
        .d-pwd-wrap { position:relative; }
        .d-pwd-wrap .d-input { padding-right:44px; }
        .d-eye { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#B09080; padding:4px; display:flex; align-items:center; }
        .d-error { display:flex; align-items:flex-start; gap:7px; padding:10px 13px; background:#FFF1EC; border:1px solid #F5C5B0; border-radius:10px; color:#B03A1A; font-size:0.82rem; margin-bottom:14px; line-height:1.45; }
        .d-spinner { width:15px; height:15px; border-radius:50%; border:2px solid rgba(255,255,255,0.35); border-top-color:white; animation:d-spin 0.7s linear infinite; flex-shrink:0; }
        .d-cancel { width:100%; padding:12px; background:none; border:none; color:#A07060; font-size:0.88rem; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; margin-top:6px; transition:color 0.18s; }
        .d-cancel:hover { color:#C05A3B; }

      `}</style>

      <div className="d-root">
        <div className="d-bg"/>
        <div className="d-wrap">

          <div className="d-header">
            <div className="d-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/nido-icon-192.png" alt="nido" width="26" height="26" style={{ display:'block', borderRadius:'6px' }}/>
              <span className="d-logo-title">Nido</span>
            </div>
            <button className="d-signout" onClick={handleSignOut}>Cerrar sesión</button>
          </div>

          <div className="d-greeting">
            <div className="d-greeting-title">Hola 👋</div>
            <div className="d-greeting-sub">{user?.email}</div>
          </div>

          <div className="d-desktop-cols">
          <div>
          {memberships.length > 0 ? (
            <div style={{ marginBottom:'1.5rem' }}>
              <div className="d-section-label">Tus nidos</div>
              {memberships.map((m, i) => (
                <button
                  key={m.id}
                  className="d-sala-card"
                  style={{ animationDelay:`${i * 0.06}s` }}
                  onClick={() => enterSala(m)}
                >
                  <div className="d-sala-info">
                    <div className="d-sala-av">🏠</div>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div className="d-sala-name">{m.salas.nombre}</div>
                        {m.salas.plan_type === 'pro' && (
                          <span style={{ fontSize:'0.6rem', fontWeight:700, background:'linear-gradient(135deg,#C8823A,#C05A3B)', color:'white', padding:'2px 7px', borderRadius:20, letterSpacing:'0.05em', flexShrink:0 }}>PRO</span>
                        )}
                      </div>
                      <div className="d-sala-meta">Como <strong>{m.nombre}</strong></div>
                    </div>
                  </div>
                  <svg className="d-sala-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M6.5 4.5L11.5 9L6.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
          ) : (
            <div className="d-empty">
              <div className="d-empty-icon">🏡</div>
              <div className="d-empty-title">Sin nido por ahora</div>
              <div className="d-empty-sub">
                Creá uno nuevo o pedile a alguien que te invite con un link.
              </div>
            </div>
          )}

          </div>{/* end left col */}
          <div>{/* right col: actions */}
          {memberships.length === 0 ? (
            <>
              <button className="d-btn-primary" onClick={() => { setShowCreate(true); setCError('') }}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M7.5 4.5v6M4.5 7.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Crear nido nuevo
              </button>
            </>
          ) : (
            <div style={{
              background: 'white', border: '1.5px solid #EAD8C8', borderRadius: 14,
              padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>🔒</div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2A1A0E', marginBottom: 2 }}>
                  Ya pertenecés a un nido
                </div>
                <div style={{ fontSize: '0.78rem', color: '#A07060', lineHeight: 1.4 }}>
                  Para crear o unirte a otro, primero salí del nido actual desde su página de inicio.
                </div>
              </div>
            </div>
          )}
          </div>{/* end right col */}
          </div>{/* end desktop-cols */}

        </div>
      </div>

{/* Create nido modal */}
      {showCreate && (
        <div className="d-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="d-modal">
            <div className="d-modal-title">Crear nido 🏠</div>
            <div className="d-modal-sub">Configurá tu nido y empezá a invitar a tus compañeros</div>
            <form onSubmit={handleCrearNido}>
              <div className="d-field">
                <label className="d-label">Nombre del nido</label>
                <input type="text" value={cNombreNido} onChange={e => setCNombreNido(e.target.value)}
                  placeholder="Ej: Casa Palermo, El Nidito..." className="d-input" autoFocus/>
              </div>
              <div className="d-field">
                <label className="d-label">Contraseña del nido</label>
                <div className="d-pwd-wrap">
                  <input type={cShowCodigo ? 'text' : 'password'} value={cCodigo}
                    onChange={e => setCCodigo(e.target.value)}
                    placeholder="La que usarán como referencia" className="d-input" autoComplete="off"/>
                  <button type="button" className="d-eye" onClick={() => setCShowCodigo(v => !v)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="#B09080" strokeWidth="1.4"/>
                      <circle cx="8" cy="8" r="2" stroke="#B09080" strokeWidth="1.4"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="d-field">
                <label className="d-label">Tu nombre en el nido</label>
                <input type="text" value={cNombre} onChange={e => setCNombre(e.target.value)}
                  placeholder="Ej: lauta, caro, pepito..." className="d-input" autoComplete="off"/>
              </div>
              {cError && (
                <div className="d-error">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="7" cy="9.5" r="0.6" fill="currentColor"/>
                  </svg>
                  {cError}
                </div>
              )}
              <button type="submit" className="d-btn-primary" disabled={cLoading}>
                {cLoading
                  ? <><span className="d-spinner"/>Creando...</>
                  : '✓ Crear mi nido'}
              </button>
            </form>
            <button className="d-cancel" onClick={() => setShowCreate(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
