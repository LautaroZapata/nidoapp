'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fraunces, Nunito, DM_Mono } from 'next/font/google'
import { createClient } from '@/lib/supabase'

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito = Nunito({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-body' })
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-code' })

type Mode = 'login' | 'signup'

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

export default function Home() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(true)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'auth') setError('Error al autenticar. Intentá de nuevo.')

    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
      else setCheckingSession(false)
    })
  }, [router])

  async function handleGoogle() {
    setError(''); setGoogleLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!email.trim() || !password) { setError('Completá todos los campos'); return }
    if (mode === 'signup' && password !== passwordConfirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return }
    setLoading(true)
    const supabase = createClient()
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
        setLoading(false); return
      }
      router.replace('/dashboard')
    } else {
      const { error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) { setError(error.message); setLoading(false); return }
      setEmailSent(true); setLoading(false)
    }
  }

  function switchMode() {
    setMode(m => m === 'login' ? 'signup' : 'login')
    setError(''); setPassword(''); setPasswordConfirm(''); setEmailSent(false)
  }

  if (checkingSession) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#FAF5EE' }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'2.5px solid #C05A3B', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

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

        .n-panel {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 2.5rem 3rem; background: #FAF5EE; position: relative; overflow: hidden;
        }
        .n-panel::before { content:''; position:absolute; top:-100px; right:-100px; width:400px; height:400px; background:radial-gradient(circle,rgba(192,90,59,0.06) 0%,transparent 65%); pointer-events:none; }
        .n-panel::after  { content:''; position:absolute; bottom:-60px; left:-60px; width:300px; height:300px; background:radial-gradient(circle,rgba(200,130,58,0.05) 0%,transparent 65%); pointer-events:none; }
        .n-wrap { width: 100%; max-width: 380px; position: relative; z-index: 1; animation: n-stepin 0.4s cubic-bezier(0.22,1,0.36,1) both; }

        .n-mobile-brand { display: none; text-align: center; margin-bottom: 2.5rem; }
        .n-mobile-icon { width: 52px; height: 52px; border-radius: 16px; background: #C05A3B; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
        .n-mobile-title { font-family: var(--font-serif),'Georgia',serif; font-size: 2rem; color: #2A1A0E; letter-spacing: -0.02em; font-weight: 600; }
        .n-mobile-sub { font-size: 0.85rem; color: #A07060; margin-top: 4px; font-weight: 400; }

        .n-screen-title { font-family: var(--font-serif),'Georgia',serif; font-size: 1.9rem; color: #2A1A0E; margin: 0 0 0.3rem; letter-spacing: -0.025em; font-weight: 600; }
        .n-screen-sub { font-size: 0.88rem; color: #A07060; margin: 0 0 1.75rem; font-weight: 400; line-height: 1.5; }

        .n-google-btn {
          width: 100%; padding: 13px 20px; background: white; color: #2A1A0E;
          border: 1.5px solid #E0CAB8; border-radius: 14px;
          font-size: 0.95rem; font-weight: 600; font-family: var(--font-body),'Nunito',sans-serif;
          cursor: pointer; transition: all 0.18s;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          margin-bottom: 4px;
        }
        .n-google-btn:hover:not(:disabled) { border-color: #C05A3B; background: #FFF8F5; transform: translateY(-1.5px); box-shadow: 0 6px 16px rgba(192,90,59,0.1); }
        .n-google-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .n-field { margin-bottom: 14px; }
        .n-label { display: block; font-size: 0.7rem; font-weight: 700; color: #8A5A40; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.08em; }
        .n-input { width: 100%; padding: 12px 15px; background: white; border: 1.5px solid #E0CAB8; border-radius: 12px; font-size: 0.92rem; font-family: var(--font-body),'Nunito',sans-serif; color: #2A1A0E; outline: none; transition: border-color 0.18s, box-shadow 0.18s; }
        .n-input::placeholder { color: #C0A898; }
        .n-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3.5px rgba(192,90,59,0.12); }
        .n-pwd-wrap { position: relative; }
        .n-pwd-wrap .n-input { padding-right: 44px; }
        .n-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #B09080; padding: 4px; display: flex; align-items: center; transition: color 0.18s; }
        .n-eye:hover { color: #C05A3B; }

        .n-btn-primary { width: 100%; padding: 14px 20px; background: #C05A3B; color: white; border: none; border-radius: 14px; font-size: 0.95rem; font-weight: 600; font-family: var(--font-body),'Nunito',sans-serif; cursor: pointer; transition: background 0.18s, transform 0.15s, box-shadow 0.18s; display: flex; align-items: center; justify-content: center; gap: 8px; letter-spacing: -0.01em; }
        .n-btn-primary:hover:not(:disabled) { background: #A04730; transform: translateY(-1.5px); box-shadow: 0 10px 28px rgba(192,90,59,0.35); }
        .n-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

        .n-or { display: flex; align-items: center; gap: 12px; margin: 16px 0; color: #C8A898; font-size: 0.8rem; }
        .n-or::before, .n-or::after { content:''; flex:1; height:1px; background:#EAD8C8; }

        .n-error { display: flex; align-items: flex-start; gap: 7px; padding: 10px 13px; background: #FFF1EC; border: 1px solid #F5C5B0; border-radius: 10px; color: #B03A1A; font-size: 0.82rem; margin-bottom: 14px; line-height: 1.45; }
        .n-error svg { flex-shrink: 0; margin-top: 1px; }
        .n-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; animation: n-spin 0.7s linear infinite; flex-shrink: 0; }
        .n-spinner-dark { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(0,0,0,0.15); border-top-color: #2A1A0E; animation: n-spin 0.7s linear infinite; flex-shrink: 0; }

        .n-switch { text-align: center; margin-top: 18px; font-size: 0.84rem; color: #A07060; }
        .n-switch button { background: none; border: none; color: #C05A3B; font-weight: 600; cursor: pointer; font-family: var(--font-body),'Nunito',sans-serif; font-size: 0.84rem; padding: 0; }
        .n-switch button:hover { text-decoration: underline; }

        .n-success { padding: 20px; background: rgba(90,136,105,0.08); border: 1.5px solid rgba(90,136,105,0.25); border-radius: 14px; text-align: center; }
        .n-success-icon { font-size: 2rem; margin-bottom: 8px; }
        .n-success-title { font-family: var(--font-serif),'Georgia',serif; font-size: 1.2rem; color: #2A1A0E; margin-bottom: 6px; font-weight: 600; }
        .n-success-sub { font-size: 0.84rem; color: #5A8869; line-height: 1.5; }

        .n-secure { display: flex; align-items: center; gap: 5px; font-size: 0.68rem; color: #A09080; margin-top: 14px; justify-content: center; }

        @media (max-width: 860px) {
          .n-root { flex-direction: column; }
          .n-hero { display: none !important; }
          .n-panel { padding: 2.5rem 1.5rem; flex: none; min-height: 100vh; }
          .n-mobile-brand { display: block; }
        }
        @media (max-width: 480px) {
          .n-panel { padding: 2rem 1.25rem; }
          .n-input { font-size: 0.88rem; padding: 10px 13px; }
        }
      `}</style>

      <div className="n-root">

        {/* LEFT HERO */}
        <div className="n-hero">
          <div className="n-hero-texture" />
          <div className="n-hero-pattern" />
          <div className="n-orb" style={{ width:200, height:200, top:-60, right:-50, background:'radial-gradient(circle, rgba(255,200,150,0.15) 0%, transparent 70%)', animation:'n-float 9s ease-in-out infinite' }} />
          <div className="n-orb" style={{ width:130, height:130, bottom:100, left:-30, background:'radial-gradient(circle, rgba(255,180,120,0.12) 0%, transparent 70%)', animation:'n-floatB 7s ease-in-out 1s infinite' }} />
          <div className="n-float-card" style={{ top:'18%', right:'-10px', animation:'n-float 6s ease-in-out 0.5s infinite' }}>🏠 Nido listo ✓</div>
          <div className="n-float-card" style={{ bottom:'22%', right:'8%', animation:'n-floatB 8s ease-in-out 1.5s infinite' }}>🛒 Lista de compras</div>
          <div className="n-brand">
            <div className="n-logo-row">
              <div className="n-icon">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="5" y="15" width="22" height="15" rx="2" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
                  <path d="M3 16.5L16 4.5L29 16.5" stroke="rgba(255,215,150,0.88)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="13" y="22" width="6" height="8" rx="1.5" fill="rgba(255,200,150,0.25)" stroke="rgba(255,215,150,0.55)" strokeWidth="1.3"/>
                  <rect x="7" y="18.5" width="4.5" height="3.5" rx="1" fill="rgba(255,225,120,0.42)" stroke="rgba(255,215,150,0.48)" strokeWidth="1.1"/>
                  <rect x="20.5" y="18.5" width="4.5" height="3.5" rx="1" fill="rgba(255,225,120,0.42)" stroke="rgba(255,215,150,0.48)" strokeWidth="1.1"/>
                  <rect x="21" y="8" width="3.5" height="6.5" rx="1" fill="rgba(255,255,255,0.08)" stroke="rgba(255,215,150,0.38)" strokeWidth="1.1"/>
                  <circle cx="22.75" cy="6.5" r="1.3" fill="rgba(255,215,150,0.2)"/>
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

        {/* RIGHT PANEL */}
        <div className="n-panel">
          <div className="n-wrap">

            <div className="n-mobile-brand">
              <div className="n-mobile-icon">
                <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
                  <rect x="5" y="15" width="22" height="15" rx="2" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
                  <path d="M3 16.5L16 4.5L29 16.5" stroke="rgba(255,215,150,0.88)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="13" y="22" width="6" height="8" rx="1.5" fill="rgba(255,200,150,0.25)" stroke="rgba(255,215,150,0.55)" strokeWidth="1.3"/>
                  <rect x="7" y="18.5" width="4.5" height="3.5" rx="1" fill="rgba(255,225,120,0.42)" stroke="rgba(255,215,150,0.48)" strokeWidth="1.1"/>
                  <rect x="20.5" y="18.5" width="4.5" height="3.5" rx="1" fill="rgba(255,225,120,0.42)" stroke="rgba(255,215,150,0.48)" strokeWidth="1.1"/>
                </svg>
              </div>
              <div className="n-mobile-title">Nido</div>
              <div className="n-mobile-sub">Tu apto compartido, organizado</div>
            </div>

            {emailSent ? (
              <div className="n-success">
                <div className="n-success-icon">📬</div>
                <div className="n-success-title">Revisá tu email</div>
                <div className="n-success-sub">
                  Te mandamos un link de confirmación a <strong>{email}</strong>.<br />
                  Hacé click ahí para activar tu cuenta.
                </div>
                <button onClick={switchMode} style={{ marginTop:14, background:'none', border:'none', color:'#C05A3B', fontWeight:600, cursor:'pointer', fontSize:'0.84rem', fontFamily:'var(--font-body),Nunito,sans-serif' }}>
                  ← Volver al inicio de sesión
                </button>
              </div>
            ) : (
              <>
                <h2 className="n-screen-title">
                  {mode === 'login' ? 'Bienvenido a casa 🏠' : 'Crear cuenta'}
                </h2>
                <p className="n-screen-sub">
                  {mode === 'login'
                    ? 'Ingresá a tu cuenta para acceder a tu nido'
                    : 'Registrate para crear o unirte a un nido'}
                </p>

                {/* Google */}
                <button className="n-google-btn" onClick={handleGoogle} disabled={googleLoading}>
                  {googleLoading ? <span className="n-spinner-dark"/> : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                  )}
                  Continuar con Google
                </button>

                <div className="n-or">o</div>

                <form onSubmit={handleSubmit}>
                  <div className="n-field">
                    <label className="n-label">Email</label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="tu@email.com" className="n-input" autoFocus autoComplete="email"
                    />
                  </div>
                  <div className="n-field">
                    <label className="n-label">Contraseña</label>
                    <div className="n-pwd-wrap">
                      <input
                        type={showPass ? 'text' : 'password'} value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Mín. 6 caracteres" className="n-input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      />
                      <button type="button" className="n-eye" onClick={() => setShowPass(v => !v)}>
                        <EyeIcon open={showPass}/>
                      </button>
                    </div>
                  </div>
                  {mode === 'signup' && (
                    <div className="n-field">
                      <label className="n-label">Confirmar contraseña</label>
                      <input
                        type={showPass ? 'text' : 'password'} value={passwordConfirm}
                        onChange={e => setPasswordConfirm(e.target.value)}
                        placeholder="Repetí tu contraseña" className="n-input" autoComplete="new-password"
                      />
                      {passwordConfirm && password !== passwordConfirm && (
                        <div style={{ fontSize:'0.72rem', color:'#E84855', marginTop:4, fontWeight:600 }}>No coinciden</div>
                      )}
                    </div>
                  )}
                  {error && (
                    <div className="n-error">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="7" cy="9.5" r="0.6" fill="currentColor"/>
                      </svg>
                      {error}
                    </div>
                  )}
                  <button type="submit" className="n-btn-primary" disabled={loading}>
                    {loading
                      ? <><span className="n-spinner"/>{mode === 'login' ? 'Entrando...' : 'Creando cuenta...'}</>
                      : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                  </button>
                </form>

                <div className="n-switch">
                  {mode === 'login'
                    ? <>¿Sin cuenta? <button onClick={switchMode}>Crear una gratis →</button></>
                    : <>¿Ya tenés? <button onClick={switchMode}>Iniciar sesión</button></>}
                </div>

                <div className="n-secure">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L2 2.5v3c0 2.2 1.5 4.2 3.5 4.5C7.5 9.7 9 7.7 9 5.5v-3L5.5 1z" stroke="currentColor" strokeWidth="1.1"/></svg>
                  Autenticación segura con Supabase
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
