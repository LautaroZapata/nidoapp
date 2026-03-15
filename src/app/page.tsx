'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fraunces, Nunito, DM_Mono } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession, setSession } from '@/lib/session'
import type { Sala, Miembro } from '@/lib/types'
import type { PostgrestError } from '@supabase/supabase-js'

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito = Nunito({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-body' })
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-code' })

type DbResult<T> = { data: T | null; error: PostgrestError | null }
type MiembroAuth = Miembro & { password_hash: string | null; salt: string | null }

const COLORES = [
  '#C05A3B', '#5A8869', '#C8823A', '#7B5EA7', '#2E86AB',
  '#E84855', '#3BB273', '#D4A017', '#6B4226', '#1A535C',
]

// ── Crypto helpers ─────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function makeSalt(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}
async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256(salt + ':' + password)
}
function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  if (pwd.length < 4) return { score: 0, label: 'Muy corta', color: '#E84855' }
  let s = 0
  if (pwd.length >= 8) s++
  if (/\d/.test(pwd)) s++
  if (/[A-Z]/.test(pwd) || /[^a-zA-Z0-9]/.test(pwd)) s++
  const labels = ['Débil', 'Regular', 'Buena', 'Fuerte']
  const colors = ['#E84855', '#C8823A', '#C8823A', '#5A8869']
  return { score: s + 1, label: labels[s], color: colors[s] }
}

// ── Step type ──────────────────────────────────────────────────────────────
type Paso =
  | 'e1'   // entrar: contraseña del nido
  | 'e2'   // entrar: tu nombre
  | 'e3n'  // entrar: nuevo → crear contraseña
  | 'e3e'  // entrar: existente → verificar contraseña
  | 'c1'   // crear: nombre + contraseña del nido
  | 'c2'   // crear: tu nombre + contraseña personal

// ── Eye icon ───────────────────────────────────────────────────────────────
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2 14L14 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter()
  const [paso, setPaso] = useState<Paso>('e1')
  const [checkingSession, setCheckingSession] = useState(true)

  // Accumulated data
  const [salaFound, setSalaFound] = useState<Sala | null>(null)
  const [miembroFound, setMiembroFound] = useState<MiembroAuth | null>(null)
  const [isMigracion, setIsMigracion] = useState(false) // existing user without hash

  // Entrar inputs
  const [ePassNido, setEPassNido] = useState('')
  const [eNombre, setENombre] = useState('')
  const [ePass, setEPass] = useState('')
  const [ePassConfirm, setEPassConfirm] = useState('')
  const [eShowPass, setEShowPass] = useState(false)

  // Crear inputs
  const [cNombreNido, setCNombreNido] = useState('')
  const [cPassNido, setCPassNido] = useState('')
  const [cNombre, setCNombre] = useState('')
  const [cPass, setCPass] = useState('')
  const [cPassConfirm, setCPassConfirm] = useState('')
  const [cShowPass, setCShowPass] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (session) router.replace(`/sala/${session.salaCodigo}`)
    else setCheckingSession(false)
  }, [router])

  if (checkingSession) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#FAF5EE' }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'2.5px solid #C05A3B', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── Reset helpers ──────────────────────────────────────────────────────
  function goCrear() {
    setError(''); setCNombreNido(''); setCPassNido(''); setCNombre(''); setCPass(''); setCPassConfirm(''); setCShowPass(false)
    setPaso('c1')
  }
  function goEntrar() {
    setError(''); setEPassNido(''); setENombre(''); setEPass(''); setEPassConfirm(''); setEShowPass(false)
    setSalaFound(null); setMiembroFound(null); setIsMigracion(false)
    setPaso('e1')
  }

  // ── Entrar handlers ────────────────────────────────────────────────────
  async function handleE1(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!ePassNido.trim()) { setError('Ingresá la contraseña del nido'); return }
    setLoading(true)
    const { data: sala } = await createClient()
      .from('salas').select().eq('codigo', ePassNido.trim()).single() as DbResult<Sala>
    if (!sala) { setError('No existe ningún nido con esa contraseña'); setLoading(false); return }
    setSalaFound(sala)
    setPaso('e2')
    setLoading(false)
  }

  async function handleE2(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!eNombre.trim()) { setError('Ingresá tu nombre'); return }
    setLoading(true)
    const nombreNorm = eNombre.trim().toLowerCase()
    const { data: m } = await createClient()
      .from('miembros').select().eq('sala_id', salaFound!.id).eq('nombre', nombreNorm).single() as DbResult<MiembroAuth>
    if (!m) {
      setMiembroFound(null); setIsMigracion(false); setPaso('e3n')
    } else if (!m.password_hash) {
      setMiembroFound(m); setIsMigracion(true); setPaso('e3n')
    } else {
      setMiembroFound(m); setIsMigracion(false); setPaso('e3e')
    }
    setLoading(false)
  }

  async function handleRegistrar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (ePass.length < 6) { setError('Mínimo 6 caracteres'); return }
    if (ePass !== ePassConfirm) { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    const salt = makeSalt()
    const hash = await hashPassword(ePass, salt)
    const nombreNorm = eNombre.trim().toLowerCase()
    const supabase = createClient()

    if (isMigracion && miembroFound) {
      // Existing user setting password for the first time
      await supabase.from('miembros').update({ password_hash: hash, salt }).eq('id', miembroFound.id)
      finishSession(salaFound!, miembroFound)
    } else {
      // Brand new member
      const { data: todos } = await supabase.from('miembros').select('id').eq('sala_id', salaFound!.id)
      const colorIndex = (todos?.length ?? 0) % COLORES.length
      const { data: nuevo, error: err } = await supabase
        .from('miembros')
        .insert({ sala_id: salaFound!.id, nombre: nombreNorm, color: COLORES[colorIndex], password_hash: hash, salt })
        .select().single() as DbResult<Miembro>
      if (err || !nuevo) {
        setError(err?.code === '23505' ? 'Ese nombre ya está en uso en este nido' : 'Error al crear tu cuenta')
        setLoading(false); return
      }
      finishSession(salaFound!, nuevo)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!ePass) { setError('Ingresá tu contraseña'); return }
    setLoading(true)
    const m = miembroFound!
    const hash = await hashPassword(ePass, m.salt!)
    if (hash !== m.password_hash) { setError('Contraseña incorrecta'); setLoading(false); return }
    finishSession(salaFound!, m)
  }

  function finishSession(sala: Sala, m: Miembro) {
    setSession({ salaId: sala.id, salaCodigo: sala.codigo, salaNombre: sala.nombre, miembroId: m.id, miembroNombre: m.nombre, miembroColor: m.color })
    router.push(`/sala/${sala.codigo}`)
  }

  // ── Crear handlers ─────────────────────────────────────────────────────
  async function handleC1(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!cNombreNido.trim()) { setError('Ingresá el nombre del nido'); return }
    if (cPassNido.trim().length < 3) { setError('La contraseña del nido debe tener mínimo 3 caracteres'); return }
    setLoading(true)
    const { data: existe } = await createClient().from('salas').select('id').eq('codigo', cPassNido.trim()).single()
    if (existe) { setError('Esa contraseña ya está en uso. Elegí otra.'); setLoading(false); return }
    setPaso('c2'); setLoading(false)
  }

  async function handleC2(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!cNombre.trim()) { setError('Ingresá tu nombre'); return }
    if (cPass.length < 6) { setError('Mínimo 6 caracteres'); return }
    if (cPass !== cPassConfirm) { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    const salt = makeSalt()
    const hash = await hashPassword(cPass, salt)
    const supabase = createClient()
    const { data: sala, error: sErr } = await supabase
      .from('salas').insert({ codigo: cPassNido.trim(), nombre: cNombreNido.trim() })
      .select().single() as DbResult<Sala>
    if (sErr || !sala) { setError('Error al crear el nido'); setLoading(false); return }
    const { data: miembro, error: mErr } = await supabase
      .from('miembros')
      .insert({ sala_id: sala.id, nombre: cNombre.trim().toLowerCase(), color: COLORES[0], password_hash: hash, salt })
      .select().single() as DbResult<Miembro>
    if (mErr || !miembro) { setError('Error al crear tu cuenta'); setLoading(false); return }
    finishSession(sala, miembro)
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const eStrength = passwordStrength(ePass)
  const cStrength = passwordStrength(cPass)
  const isEntrar = paso.startsWith('e')
  const isCrear = paso.startsWith('c')
  const entrarStep = paso === 'e1' ? 1 : paso === 'e2' ? 2 : 3
  const crearStep = paso === 'c1' ? 1 : 2

  return (
    <div className={`${fraunces.variable} ${nunito.variable} ${dmMono.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        @keyframes n-spin    { to { transform: rotate(360deg); } }
        @keyframes n-fadeup  { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes n-slidein { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes n-stepin  { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes n-float   { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-10px) rotate(-2deg); } }
        @keyframes n-floatB  { 0%,100% { transform: translateY(0) rotate(3deg); } 50% { transform: translateY(-7px) rotate(3deg); } }

        .n-root { min-height: 100vh; display: flex; font-family: var(--font-body), 'Nunito', system-ui, sans-serif; background: #FAF5EE; }

        /* ── LEFT HERO ── */
        .n-hero {
          width: 48%; position: relative; display: flex; flex-direction: column;
          justify-content: center; padding: 4rem; overflow: hidden;
          background: linear-gradient(150deg, #C05A3B 0%, #8B3620 55%, #6B2510 100%);
        }
        .n-hero-texture {
          position: absolute; inset: 0;
          background-image: radial-gradient(circle at 20% 30%, rgba(255,200,150,0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(255,150,100,0.1) 0%, transparent 45%);
          pointer-events: none;
        }
        .n-hero-pattern {
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
          pointer-events: none;
        }
        .n-orb { position: absolute; border-radius: 50%; pointer-events: none; }
        .n-brand { position: relative; z-index: 2; animation: n-slidein 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        .n-logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 2.5rem; }
        .n-icon {
          width: 48px; height: 48px; background: rgba(255,255,255,0.2);
          border: 1.5px solid rgba(255,255,255,0.3); border-radius: 14px;
          display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px); flex-shrink: 0;
        }
        .n-wordmark { font-family: var(--font-serif), 'Georgia', serif; font-size: 1.8rem; color: white; letter-spacing: -0.02em; font-weight: 400; }
        .n-headline {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: clamp(2.4rem, 4vw, 3.6rem); font-weight: 600; line-height: 1.1;
          color: white; margin: 0 0 1.2rem; letter-spacing: -0.02em;
          animation: n-slidein 0.7s 0.1s cubic-bezier(0.22,1,0.36,1) both;
        }
        .n-headline em { font-style: italic; font-weight: 300; color: rgba(255,220,180,0.95); }
        .n-sub { font-size: 1rem; color: rgba(255,255,255,0.65); font-weight: 400; line-height: 1.7; max-width: 280px; animation: n-fadeup 0.7s 0.2s cubic-bezier(0.22,1,0.36,1) both; }
        .n-features { display: flex; flex-direction: column; gap: 10px; margin-top: 2.5rem; animation: n-fadeup 0.7s 0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .n-feat { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.7); font-weight: 400; }
        .n-feat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: rgba(255,220,180,0.7); }
        .n-people { display: flex; align-items: center; margin-top: 3rem; animation: n-fadeup 0.7s 0.42s cubic-bezier(0.22,1,0.36,1) both; }
        .n-av { width: 40px; height: 40px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; font-size: 1.15rem; margin-right: -12px; background: rgba(255,255,255,0.15); backdrop-filter: blur(4px); }
        .n-people-label { margin-left: 22px; font-size: 0.8rem; color: rgba(255,255,255,0.5); font-weight: 300; }
        .n-float-card { position: absolute; border-radius: 12px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); backdrop-filter: blur(6px); padding: 10px 14px; font-size: 0.75rem; color: rgba(255,255,255,0.8); font-family: var(--font-body), sans-serif; pointer-events: none; }

        /* ── RIGHT PANEL ── */
        .n-panel {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 2.5rem 3rem; background: #FAF5EE; position: relative; overflow: hidden;
        }
        .n-panel::before { content:''; position:absolute; top:-100px; right:-100px; width:400px; height:400px; background:radial-gradient(circle,rgba(192,90,59,0.06) 0%,transparent 65%); pointer-events:none; }
        .n-panel::after  { content:''; position:absolute; bottom:-60px; left:-60px; width:300px; height:300px; background:radial-gradient(circle,rgba(200,130,58,0.05) 0%,transparent 65%); pointer-events:none; }
        .n-wrap { width: 100%; max-width: 380px; position: relative; z-index: 1; }

        /* Mobile brand */
        .n-mobile-brand { display: none; text-align: center; margin-bottom: 2.5rem; }
        .n-mobile-icon { width: 52px; height: 52px; border-radius: 16px; background: #C05A3B; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
        .n-mobile-title { font-family: var(--font-serif),'Georgia',serif; font-size: 2rem; color: #2A1A0E; letter-spacing: -0.02em; font-weight: 600; }
        .n-mobile-sub { font-size: 0.85rem; color: #A07060; margin-top: 4px; font-weight: 400; }

        /* ── Step dots ── */
        .n-steps { display: flex; align-items: center; gap: 6px; margin-bottom: 1.75rem; }
        .n-step-dot { width: 8px; height: 8px; border-radius: 50%; background: #E8D5C0; transition: all 0.3s; }
        .n-step-dot.active { background: #C05A3B; width: 22px; border-radius: 4px; }
        .n-step-dot.done { background: #5A8869; }

        /* ── Context chip ── */
        .n-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 12px; border-radius: 999px; margin-bottom: 1.25rem;
          font-size: 0.78rem; font-weight: 600;
        }
        .n-chip-nido { background: rgba(90,136,105,0.1); border: 1px solid rgba(90,136,105,0.25); color: #3A7050; }
        .n-chip-user { background: rgba(192,90,59,0.08); border: 1px solid rgba(192,90,59,0.2); color: #A04730; }

        /* ── Form elements ── */
        .n-step { animation: n-stepin 0.32s cubic-bezier(0.22,1,0.36,1) both; }
        .n-screen-title { font-family: var(--font-serif),'Georgia',serif; font-size: 1.9rem; color: #2A1A0E; margin: 0 0 0.3rem; letter-spacing: -0.025em; font-weight: 600; }
        .n-screen-sub { font-size: 0.88rem; color: #A07060; margin: 0 0 1.75rem; font-weight: 400; line-height: 1.5; }
        .n-field { margin-bottom: 14px; }
        .n-label { display: block; font-size: 0.7rem; font-weight: 700; color: #8A5A40; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.08em; }
        .n-input { width: 100%; padding: 12px 15px; background: white; border: 1.5px solid #E0CAB8; border-radius: 12px; font-size: 0.92rem; font-family: var(--font-body),'Nunito',sans-serif; color: #2A1A0E; outline: none; transition: border-color 0.18s, box-shadow 0.18s; }
        .n-input::placeholder { color: #C0A898; }
        .n-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3.5px rgba(192,90,59,0.12); }

        /* Password with eye */
        .n-pwd-wrap { position: relative; }
        .n-pwd-wrap .n-input { padding-right: 44px; }
        .n-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #B09080; padding: 4px; display: flex; align-items: center; transition: color 0.18s; }
        .n-eye:hover { color: #C05A3B; }

        /* Strength bar */
        .n-strength { margin-top: 6px; }
        .n-strength-bar { height: 3px; border-radius: 2px; background: #EAD8C8; overflow: hidden; }
        .n-strength-fill { height: 100%; border-radius: 2px; transition: width 0.3s, background 0.3s; }
        .n-strength-label { font-size: 0.68rem; font-weight: 600; margin-top: 3px; }

        /* Buttons */
        .n-btn-primary { width: 100%; padding: 14px 20px; background: #C05A3B; color: white; border: none; border-radius: 14px; font-size: 0.95rem; font-weight: 600; font-family: var(--font-body),'Nunito',sans-serif; cursor: pointer; transition: background 0.18s, transform 0.15s, box-shadow 0.18s; display: flex; align-items: center; justify-content: center; gap: 8px; letter-spacing: -0.01em; }
        .n-btn-primary:hover:not(:disabled) { background: #A04730; transform: translateY(-1.5px); box-shadow: 0 10px 28px rgba(192,90,59,0.35); }
        .n-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .n-btn-secondary { width: 100%; padding: 13px 20px; background: white; color: #C05A3B; border: 1.5px solid #E8C5B0; border-radius: 14px; font-size: 0.95rem; font-weight: 600; font-family: var(--font-body),'Nunito',sans-serif; cursor: pointer; transition: all 0.18s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .n-btn-secondary:hover { background: #FFF5EE; border-color: #C05A3B; transform: translateY(-1.5px); box-shadow: 0 6px 16px rgba(192,90,59,0.13); }

        .n-or { display: flex; align-items: center; gap: 12px; margin: 14px 0; color: #C8A898; font-size: 0.8rem; }
        .n-or::before, .n-or::after { content:''; flex:1; height:1px; background:#EAD8C8; }

        .n-error { display: flex; align-items: flex-start; gap: 7px; padding: 10px 13px; background: #FFF1EC; border: 1px solid #F5C5B0; border-radius: 10px; color: #B03A1A; font-size: 0.82rem; margin-bottom: 14px; line-height: 1.45; }
        .n-error svg { flex-shrink: 0; margin-top: 1px; }
        .n-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; animation: n-spin 0.7s linear infinite; flex-shrink: 0; }
        .n-back { width: 100%; padding: 9px; background: none; border: none; color: #B09080; font-size: 0.83rem; font-family: var(--font-body),'Nunito',sans-serif; cursor: pointer; transition: color 0.18s; margin-top: 4px; }
        .n-back:hover { color: #C05A3B; }

        /* Security badge */
        .n-secure { display: flex; align-items: center; gap: 5px; font-size: 0.68rem; color: #A09080; margin-top: 10px; justify-content: center; }

        @media (max-width: 860px) {
          .n-root { flex-direction: column; }
          .n-hero { display: none !important; }
          .n-panel { padding: 2.5rem 1.5rem; flex: none; min-height: 100vh; }
          .n-mobile-brand { display: block; }
        }
        @media (max-width: 480px) {
          .n-panel { padding: 2rem 1.25rem; }
          .n-title { font-size: clamp(1.6rem, 7vw, 2.2rem); }
          .n-input { font-size: 0.88rem; padding: 10px 13px; }
          .n-submit { padding: 12px; font-size: 0.88rem; }
          .n-tabs { font-size: 0.82rem; }
        }
        @media (max-width: 360px) {
          .n-panel { padding: 1.5rem 1rem; }
          .n-title { font-size: 1.5rem; }
        }
      `}</style>

      <div className="n-root">

        {/* ── LEFT HERO ── */}
        <div className="n-hero">
          <div className="n-hero-texture" />
          <div className="n-hero-pattern" />
          <div className="n-orb" style={{ width:200, height:200, top:-60, right:-50, background:'radial-gradient(circle, rgba(255,200,150,0.15) 0%, transparent 70%)', animation:'n-float 9s ease-in-out infinite' }} />
          <div className="n-orb" style={{ width:130, height:130, bottom:100, left:-30, background:'radial-gradient(circle, rgba(255,180,120,0.12) 0%, transparent 70%)', animation:'n-floatB 7s ease-in-out 1s infinite' }} />

          <div className="n-float-card" style={{ top:'18%', right:'-10px', animation:'n-float 6s ease-in-out 0.5s infinite' }}>🐣 Nido encontrado ✓</div>
          <div className="n-float-card" style={{ bottom:'22%', right:'8%', animation:'n-floatB 8s ease-in-out 1.5s infinite' }}>🛒 Lista de compras</div>

          <div className="n-brand">
            <div className="n-logo-row">
              <div className="n-icon">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M4 25 Q16 19.5 28 25" stroke="rgba(255,215,150,0.75)" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M7 28 Q16 23.5 25 28" stroke="rgba(255,215,150,0.6)" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M4 25 Q2 22 5 19.5" stroke="rgba(255,215,150,0.5)" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M28 25 Q30 22 27 19.5" stroke="rgba(255,215,150,0.5)" strokeWidth="1.4" strokeLinecap="round"/>
                  <ellipse cx="16" cy="20" rx="7" ry="8" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                  <path d="M13 18 L15.5 15 L18 18" stroke="rgba(255,255,255,0.55)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="16" cy="12" r="5.2" fill="#F5C842"/>
                  <circle cx="14.0" cy="11.2" r="0.95" fill="#2A1A0E"/>
                  <circle cx="18.0" cy="11.2" r="0.95" fill="#2A1A0E"/>
                  <path d="M14.6 13.2 L16 14.4 L17.4 13.2" fill="#E87830"/>
                  <path d="M11.2 13.5 Q10 15.5 11.5 17" stroke="#E8B830" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.7"/>
                </svg>
              </div>
              <span className="n-wordmark">Nido</span>
            </div>
            <h1 className="n-headline">Tu nido,<br /><em>organizado</em><br />para todos.</h1>
            <p className="n-sub">Gastos, compras y aptos.<br />Todo en un lugar para los que viven juntos.</p>
            <div className="n-features">
              <div className="n-feat"><span className="n-feat-dot" />Búsqueda y votación de aptos</div>
              <div className="n-feat"><span className="n-feat-dot" />Gastos compartidos sin drama</div>
              <div className="n-feat"><span className="n-feat-dot" />Lista de compras en tiempo real</div>
            </div>
            <div className="n-people">
              <div className="n-av">👨</div>
              <div className="n-av">👩</div>
              <div className="n-av">👨</div>
              <div className="n-av">👩</div>
              <span className="n-people-label">Para cualquier número de personas</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="n-panel">
          <div className="n-wrap">

            {/* Mobile brand */}
            <div className="n-mobile-brand">
              <div className="n-mobile-icon">
                <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
                  <path d="M4 25 Q16 19.5 28 25" stroke="rgba(255,215,150,0.75)" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M7 28 Q16 23.5 25 28" stroke="rgba(255,215,150,0.6)" strokeWidth="2" strokeLinecap="round"/>
                  <ellipse cx="16" cy="20" rx="7" ry="8" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                  <path d="M13 18 L15.5 15 L18 18" stroke="rgba(255,255,255,0.55)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="16" cy="12" r="5.2" fill="#F5C842"/>
                  <circle cx="14.0" cy="11.2" r="0.95" fill="#2A1A0E"/>
                  <circle cx="18.0" cy="11.2" r="0.95" fill="#2A1A0E"/>
                  <path d="M14.6 13.2 L16 14.4 L17.4 13.2" fill="#E87830"/>
                </svg>
              </div>
              <div className="n-mobile-title">Nido</div>
              <div className="n-mobile-sub">Tu apto compartido, organizado</div>
            </div>

            {/* ══ ENTRAR: PASO 1 — contraseña del nido ══ */}
            {paso === 'e1' && (
              <div className="n-step">
                <h2 className="n-screen-title">¡Bienvenido! 🐣</h2>
                <p className="n-screen-sub">Ingresá la contraseña de tu nido para continuar</p>
                <form onSubmit={handleE1}>
                  <div className="n-field">
                    <label className="n-label">Contraseña del nido</label>
                    <div className="n-pwd-wrap">
                      <input type={eShowPass ? 'text' : 'password'} value={ePassNido} onChange={e => setEPassNido(e.target.value)} placeholder="La que eligieron al crear el nido" className="n-input" autoFocus autoComplete="off"/>
                      <button type="button" className="n-eye" onClick={() => setEShowPass(!eShowPass)}><EyeIcon open={eShowPass}/></button>
                    </div>
                  </div>
                  {error && <ErrorMsg msg={error}/>}
                  <button type="submit" className="n-btn-primary" disabled={loading}>
                    {loading ? <><Spinner/>Buscando...</> : 'Continuar →'}
                  </button>
                </form>
                <div className="n-or">o</div>
                <button className="n-btn-secondary" onClick={goCrear}>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M7.5 4.5v6M4.5 7.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Crear nido nuevo
                </button>
                <div className="n-secure">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L2 2.5v3c0 2.2 1.5 4.2 3.5 4.5C7.5 9.7 9 7.7 9 5.5v-3L5.5 1z" stroke="currentColor" strokeWidth="1.1"/></svg>
                  Contraseñas protegidas con SHA-256
                </div>
              </div>
            )}

            {/* ══ ENTRAR: PASO 2 — tu nombre ══ */}
            {paso === 'e2' && (
              <div className="n-step">
                <div className="n-chip n-chip-nido">🐣 {salaFound?.nombre} · ✓</div>
                <div className="n-steps">
                  <div className="n-step-dot done"/>
                  <div className="n-step-dot active"/>
                  <div className="n-step-dot"/>
                </div>
                <h2 className="n-screen-title">¿Quién sos?</h2>
                <p className="n-screen-sub">Ingresá el nombre con el que te registraste (o uno nuevo si sos el primero)</p>
                <form onSubmit={handleE2}>
                  <div className="n-field">
                    <label className="n-label">Tu nombre</label>
                    <input type="text" value={eNombre} onChange={e => setENombre(e.target.value)} placeholder="lauta, caro, pepito..." className="n-input" autoFocus autoComplete="off"/>
                  </div>
                  {error && <ErrorMsg msg={error}/>}
                  <button type="submit" className="n-btn-primary" disabled={loading}>
                    {loading ? <><Spinner/>Buscando...</> : 'Continuar →'}
                  </button>
                </form>
                <button className="n-back" onClick={() => { setError(''); setPaso('e1') }}>← Cambiar contraseña</button>
              </div>
            )}

            {/* ══ ENTRAR: PASO 3 — nuevo usuario ══ */}
            {paso === 'e3n' && (
              <div className="n-step">
                <div className="n-chip n-chip-nido">🐣 {salaFound?.nombre}</div>
                <div className="n-steps">
                  <div className="n-step-dot done"/>
                  <div className="n-step-dot done"/>
                  <div className="n-step-dot active"/>
                </div>
                <h2 className="n-screen-title">
                  {isMigracion ? '🔑 Creá tu contraseña' : `🥚 Hola, ${eNombre.toLowerCase()}!`}
                </h2>
                <p className="n-screen-sub">
                  {isMigracion
                    ? 'Tu cuenta existe. Ahora necesitás elegir una contraseña personal.'
                    : 'Primera vez en este nido. Elegí una contraseña solo tuya.'}
                </p>
                <div className="n-chip n-chip-user" style={{ marginBottom: '1.5rem' }}>
                  <span style={{ width:20, height:20, borderRadius:'50%', background:'#C05A3B', color:'white', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', fontWeight:700 }}>{eNombre[0]?.toUpperCase()}</span>
                  {eNombre.trim().toLowerCase()}
                </div>
                <form onSubmit={handleRegistrar}>
                  <div className="n-field">
                    <label className="n-label">Tu contraseña personal</label>
                    <div className="n-pwd-wrap">
                      <input type={eShowPass ? 'text' : 'password'} value={ePass} onChange={e => setEPass(e.target.value)} placeholder="Mín. 6 caracteres" className="n-input" autoFocus/>
                      <button type="button" className="n-eye" onClick={() => setEShowPass(!eShowPass)}><EyeIcon open={eShowPass}/></button>
                    </div>
                    {ePass && (
                      <div className="n-strength">
                        <div className="n-strength-bar"><div className="n-strength-fill" style={{ width:`${(eStrength.score/3)*100}%`, background:eStrength.color }}/></div>
                        <div className="n-strength-label" style={{ color:eStrength.color }}>{eStrength.label}</div>
                      </div>
                    )}
                  </div>
                  <div className="n-field">
                    <label className="n-label">Confirmar contraseña</label>
                    <input type={eShowPass ? 'text' : 'password'} value={ePassConfirm} onChange={e => setEPassConfirm(e.target.value)} placeholder="Repetí tu contraseña" className="n-input"/>
                    {ePassConfirm && ePass !== ePassConfirm && (
                      <div style={{ fontSize:'0.72rem', color:'#E84855', marginTop:4, fontWeight:600 }}>No coinciden</div>
                    )}
                  </div>
                  {error && <ErrorMsg msg={error}/>}
                  <button type="submit" className="n-btn-primary" disabled={loading}>
                    {loading ? <><Spinner/>{isMigracion ? 'Guardando...' : 'Uniéndome...'}</> : isMigracion ? 'Guardar contraseña' : 'Unirme al nido'}
                  </button>
                </form>
                <button className="n-back" onClick={() => { setError(''); setEPass(''); setEPassConfirm(''); setPaso('e2') }}>← Cambiar nombre</button>
              </div>
            )}

            {/* ══ ENTRAR: PASO 3 — usuario existente ══ */}
            {paso === 'e3e' && (
              <div className="n-step">
                <div className="n-chip n-chip-nido">🐣 {salaFound?.nombre}</div>
                <div className="n-steps">
                  <div className="n-step-dot done"/>
                  <div className="n-step-dot done"/>
                  <div className="n-step-dot active"/>
                </div>
                <h2 className="n-screen-title">👋 ¡Hola de nuevo!</h2>
                <p className="n-screen-sub">Ingresá tu contraseña personal para entrar</p>
                <div className="n-chip n-chip-user" style={{ marginBottom: '1.5rem' }}>
                  <span style={{ width:20, height:20, borderRadius:'50%', background: miembroFound?.color ?? '#C05A3B', color:'white', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', fontWeight:700 }}>{eNombre[0]?.toUpperCase()}</span>
                  {eNombre.trim().toLowerCase()}
                </div>
                <form onSubmit={handleLogin}>
                  <div className="n-field">
                    <label className="n-label">Tu contraseña personal</label>
                    <div className="n-pwd-wrap">
                      <input type={eShowPass ? 'text' : 'password'} value={ePass} onChange={e => setEPass(e.target.value)} placeholder="Tu contraseña" className="n-input" autoFocus/>
                      <button type="button" className="n-eye" onClick={() => setEShowPass(!eShowPass)}><EyeIcon open={eShowPass}/></button>
                    </div>
                  </div>
                  {error && <ErrorMsg msg={error}/>}
                  <button type="submit" className="n-btn-primary" disabled={loading}>
                    {loading ? <><Spinner/>Verificando...</> : 'Entrar al nido'}
                  </button>
                </form>
                <button className="n-back" onClick={() => { setError(''); setEPass(''); setPaso('e2') }}>← No soy {eNombre.trim().toLowerCase()}</button>
              </div>
            )}

            {/* ══ CREAR: PASO 1 — datos del nido ══ */}
            {paso === 'c1' && (
              <div className="n-step">
                <div className="n-steps">
                  <div className="n-step-dot active"/>
                  <div className="n-step-dot"/>
                </div>
                <h2 className="n-screen-title">Crear nido 🏡</h2>
                <p className="n-screen-sub">Elegí el nombre y una contraseña para tu nido</p>
                <form onSubmit={handleC1}>
                  <div className="n-field">
                    <label className="n-label">Nombre del nido</label>
                    <input type="text" value={cNombreNido} onChange={e => setCNombreNido(e.target.value)} placeholder="Ej: Casa Palermo, El Nidito..." className="n-input" autoFocus/>
                  </div>
                  <div className="n-field">
                    <label className="n-label">Contraseña del nido</label>
                    <div className="n-pwd-wrap">
                      <input type={cShowPass ? 'text' : 'password'} value={cPassNido} onChange={e => setCPassNido(e.target.value)} placeholder="La que compartirás con tus compañeros" className="n-input" autoComplete="off"/>
                      <button type="button" className="n-eye" onClick={() => setCShowPass(!cShowPass)}><EyeIcon open={cShowPass}/></button>
                    </div>
                  </div>
                  {error && <ErrorMsg msg={error}/>}
                  <button type="submit" className="n-btn-primary" disabled={loading}>
                    {loading ? <><Spinner/>Verificando...</> : 'Continuar →'}
                  </button>
                </form>
                <button className="n-back" onClick={goEntrar}>← Volver</button>
              </div>
            )}

            {/* ══ CREAR: PASO 2 — tu cuenta ══ */}
            {paso === 'c2' && (
              <div className="n-step">
                <div className="n-chip n-chip-nido">🐣 {cNombreNido}</div>
                <div className="n-steps">
                  <div className="n-step-dot done"/>
                  <div className="n-step-dot active"/>
                </div>
                <h2 className="n-screen-title">Tu cuenta</h2>
                <p className="n-screen-sub">Elegí tu nombre y una contraseña personal. Serás el primer miembro del nido.</p>
                <form onSubmit={handleC2}>
                  <div className="n-field">
                    <label className="n-label">Tu nombre</label>
                    <input type="text" value={cNombre} onChange={e => setCNombre(e.target.value)} placeholder="Ej: lauta, caro, pepito..." className="n-input" autoFocus autoComplete="off"/>
                  </div>
                  <div className="n-field">
                    <label className="n-label">Tu contraseña personal</label>
                    <div className="n-pwd-wrap">
                      <input type={cShowPass ? 'text' : 'password'} value={cPass} onChange={e => setCPass(e.target.value)} placeholder="Mín. 6 caracteres" className="n-input"/>
                      <button type="button" className="n-eye" onClick={() => setCShowPass(!cShowPass)}><EyeIcon open={cShowPass}/></button>
                    </div>
                    {cPass && (
                      <div className="n-strength">
                        <div className="n-strength-bar"><div className="n-strength-fill" style={{ width:`${(cStrength.score/3)*100}%`, background:cStrength.color }}/></div>
                        <div className="n-strength-label" style={{ color:cStrength.color }}>{cStrength.label}</div>
                      </div>
                    )}
                  </div>
                  <div className="n-field">
                    <label className="n-label">Confirmar contraseña</label>
                    <input type={cShowPass ? 'text' : 'password'} value={cPassConfirm} onChange={e => setCPassConfirm(e.target.value)} placeholder="Repetí tu contraseña" className="n-input"/>
                    {cPassConfirm && cPass !== cPassConfirm && (
                      <div style={{ fontSize:'0.72rem', color:'#E84855', marginTop:4, fontWeight:600 }}>No coinciden</div>
                    )}
                  </div>
                  {error && <ErrorMsg msg={error}/>}
                  <button type="submit" className="n-btn-primary" disabled={loading}>
                    {loading ? <><Spinner/>Creando nido...</> : '✓ Crear mi nido'}
                  </button>
                </form>
                <button className="n-back" onClick={() => { setError(''); setPaso('c1') }}>← Cambiar datos del nido</button>
                <div className="n-secure">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L2 2.5v3c0 2.2 1.5 4.2 3.5 4.5C7.5 9.7 9 7.7 9 5.5v-3L5.5 1z" stroke="currentColor" strokeWidth="1.1"/></svg>
                  Contraseñas protegidas con SHA-256
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Small components ────────────────────────────────────────────────────────
function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="n-error">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="7" cy="9.5" r="0.6" fill="currentColor"/>
      </svg>
      {msg}
    </div>
  )
}
function Spinner() {
  return <span className="n-spinner"/>
}
