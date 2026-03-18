'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fraunces, Lora } from 'next/font/google'
import { createClient } from '@/lib/supabase'

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const lora     = Lora({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-body' })

type Mode = 'login' | 'signup'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2 14L14 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

export default function Home() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(true)
  const [mode, setMode]                       = useState<Mode>('login')
  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPass, setShowPass]               = useState(false)
  const [loading, setLoading]                 = useState(false)
  const [googleLoading, setGoogleLoading]     = useState(false)
  const [error, setError]                     = useState('')
  const [emailSent, setEmailSent]             = useState(false)

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
      if (error) { setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message); setLoading(false); return }
      router.replace('/dashboard')
    } else {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      if (error) { setError(error.message); setLoading(false); return }
      setEmailSent(true); setLoading(false)
    }
  }

  function switchMode() {
    setMode(m => m === 'login' ? 'signup' : 'login')
    setError(''); setPassword(''); setPasswordConfirm(''); setEmailSent(false)
  }

  if (checkingSession) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#F5EDE3' }}>
      <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #C05A3B', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div className={`${fraunces.variable} ${lora.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body { height:100%; }

        @keyframes fadeUp   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
        @keyframes slideIn  { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin     { to { transform:rotate(360deg); } }

        :root {
          --terra:   #C05A3B;
          --terra-d: #A34830;
          --brown:   #2A1A0E;
          --brown-m: #5C3A22;
          --brown-l: #9A7060;
          --cream:   #FAF5EE;
          --cream-d: #F2E8DC;
          --white:   #FFFEFB;
        }

        .l-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          font-family: var(--font-body), 'Lora', Georgia, serif;
          background: var(--cream);
        }

        /* ─── LEFT PANEL ─────────────────────── */
        .l-left {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 3rem 3.5rem 3rem 3.5rem;
          background: var(--brown);
          overflow: hidden;
          animation: fadeIn 0.5s ease both;
        }

        /* Arch decorative element */
        .l-arch {
          position: absolute;
          bottom: -60px;
          right: -60px;
          width: 340px;
          height: 340px;
          border-radius: 50% 50% 0 0;
          border: 1px solid rgba(192,90,59,0.12);
          pointer-events: none;
        }
        .l-arch::before {
          content: '';
          position: absolute;
          inset: 30px;
          border-radius: 50% 50% 0 0;
          border: 1px solid rgba(192,90,59,0.08);
        }
        .l-arch::after {
          content: '';
          position: absolute;
          inset: 65px;
          border-radius: 50% 50% 0 0;
          border: 1px solid rgba(192,90,59,0.05);
        }

        /* Thin terracotta top bar */
        .l-top-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--terra);
        }

        .l-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          animation: fadeUp 0.5s 0.05s ease both;
        }
        .l-brand-icon {
          width: 30px; height: 30px;
          background: rgba(192,90,59,0.12);
          border: 1px solid rgba(192,90,59,0.25);
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
        }
        .l-brand-name {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1rem;
          font-weight: 600;
          color: rgba(255,240,225,0.9);
          letter-spacing: 0.02em;
        }

        .l-middle {
          position: relative; z-index: 1;
          animation: fadeUp 0.5s 0.12s ease both;
        }

        .l-overline {
          font-size: 0.65rem;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--terra);
          margin-bottom: 1.4rem;
          font-family: var(--font-body), 'Lora', serif;
        }

        .l-headline {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: clamp(2.8rem, 4.5vw, 4.4rem);
          font-weight: 700;
          line-height: 1.0;
          letter-spacing: -0.04em;
          color: var(--cream);
          margin-bottom: 1.6rem;
        }
        .l-headline em {
          font-style: italic;
          color: var(--terra);
        }

        .l-desc {
          font-size: 0.9rem;
          color: rgba(250,245,238,0.42);
          line-height: 1.75;
          max-width: 280px;
          font-weight: 400;
          margin-bottom: 2.4rem;
        }

        /* Feature list — clean, no pills */
        .l-features {
          display: flex;
          flex-direction: column;
          gap: 0;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .l-feature {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-size: 0.82rem;
          color: rgba(250,245,238,0.55);
          font-family: var(--font-body), 'Lora', serif;
          letter-spacing: 0.01em;
        }
        .l-feature-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--terra);
          opacity: 0.7;
          flex-shrink: 0;
        }

        .l-bottom {
          position: relative; z-index: 1;
          animation: fadeIn 0.5s 0.3s ease both;
        }
        .l-footer-text {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.15);
          letter-spacing: 0.04em;
        }

        /* ─── RIGHT PANEL ────────────────────── */
        .l-right {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem 3.5rem;
          background: var(--cream);
          position: relative;
        }

        .l-landing-btn {
          position: absolute;
          top: 1.5rem; right: 1.5rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--brown-l);
          background: none; border: none; cursor: pointer;
          font-family: var(--font-body), 'Lora', serif;
          letter-spacing: 0.03em;
          transition: color 0.15s;
          padding: 4px 0;
          border-bottom: 1px solid transparent;
        }
        .l-landing-btn:hover { color: var(--terra); border-bottom-color: var(--terra); }

        .l-form-wrap {
          width: 100%;
          max-width: 340px;
          animation: slideIn 0.5s 0.1s ease both;
        }

        .l-form-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1.9rem;
          font-weight: 700;
          letter-spacing: -0.035em;
          color: var(--brown);
          margin-bottom: 3px;
          line-height: 1.15;
        }
        .l-form-sub {
          font-size: 0.85rem;
          color: var(--brown-l);
          margin-bottom: 1.8rem;
          font-weight: 400;
          line-height: 1.5;
        }

        /* Google */
        .l-google {
          width: 100%;
          padding: 11px 16px;
          background: var(--white);
          border: 1.5px solid #E0CFC0;
          border-radius: 8px;
          font-size: 0.87rem;
          font-weight: 500;
          font-family: var(--font-body), 'Lora', serif;
          color: var(--brown);
          cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 9px;
          letter-spacing: 0.01em;
        }
        .l-google:hover:not(:disabled) {
          border-color: var(--terra);
          box-shadow: 0 2px 12px rgba(192,90,59,0.1);
          transform: translateY(-1px);
        }
        .l-google:disabled { opacity: 0.5; cursor: not-allowed; }

        .l-divider {
          display: flex; align-items: center; gap: 12px;
          margin: 16px 0;
          font-size: 0.7rem;
          color: #C8A898;
          font-weight: 400;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .l-divider::before, .l-divider::after {
          content: ''; flex: 1; height: 1px;
          background: #E8D8C8;
        }

        /* Fields */
        .l-field { margin-bottom: 10px; }
        .l-label {
          display: block;
          font-size: 0.68rem;
          font-weight: 600;
          color: var(--brown-m);
          margin-bottom: 5px;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          font-family: var(--font-body), 'Lora', serif;
        }
        .l-input {
          width: 100%;
          padding: 10px 13px;
          background: var(--white);
          border: 1.5px solid #E0CFC0;
          border-radius: 8px;
          font-size: 0.88rem;
          font-family: var(--font-body), 'Lora', serif;
          color: var(--brown);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .l-input::placeholder { color: #C8B0A0; }
        .l-input:focus {
          border-color: var(--terra);
          box-shadow: 0 0 0 3px rgba(192,90,59,0.08);
        }
        .l-pwd-wrap { position: relative; }
        .l-pwd-wrap .l-input { padding-right: 40px; }
        .l-eye {
          position: absolute; right: 11px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #B8988A; padding: 4px;
          display: flex; align-items: center;
          transition: color 0.15s;
        }
        .l-eye:hover { color: var(--terra); }

        /* Submit */
        .l-submit {
          width: 100%;
          padding: 12px 20px;
          background: var(--terra);
          color: var(--white);
          border: none;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: var(--font-body), 'Lora', serif;
          cursor: pointer;
          transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          letter-spacing: 0.01em;
          margin-top: 6px;
        }
        .l-submit:hover:not(:disabled) {
          background: var(--terra-d);
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(192,90,59,0.3);
        }
        .l-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Error */
        .l-error {
          display: flex; align-items: flex-start; gap: 7px;
          padding: 9px 11px;
          background: #FFF3EE;
          border: 1px solid rgba(192,90,59,0.2);
          border-radius: 7px;
          color: #A83A1A;
          font-size: 0.79rem;
          margin-bottom: 10px;
          line-height: 1.45;
          font-family: var(--font-body), 'Lora', serif;
        }

        .l-spinner {
          width: 13px; height: 13px;
          border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        .l-spinner-dark {
          width: 13px; height: 13px;
          border-radius: 50%;
          border: 1.5px solid rgba(42,26,14,0.15);
          border-top-color: var(--brown);
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        .l-switch {
          text-align: center;
          margin-top: 16px;
          font-size: 0.82rem;
          color: var(--brown-l);
          font-family: var(--font-body), 'Lora', serif;
        }
        .l-switch button {
          background: none; border: none;
          color: var(--terra);
          font-weight: 600;
          cursor: pointer;
          font-family: var(--font-body), 'Lora', serif;
          font-size: 0.82rem;
          padding: 0;
          border-bottom: 1px solid rgba(192,90,59,0.3);
          transition: border-color 0.15s;
        }
        .l-switch button:hover { border-color: var(--terra); }

        /* Success */
        .l-success {
          padding: 22px;
          text-align: center;
          background: #F5F9F6;
          border: 1.5px solid rgba(90,136,105,0.2);
          border-radius: 10px;
        }
        .l-success-icon { font-size: 2rem; margin-bottom: 10px; display: block; }
        .l-success-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1.2rem;
          color: var(--brown);
          margin-bottom: 7px;
          font-weight: 700;
        }
        .l-success-sub {
          font-size: 0.83rem;
          color: #5A8869;
          line-height: 1.6;
          font-family: var(--font-body), 'Lora', serif;
        }

        /* Match mismatch inline */
        .l-mismatch {
          font-size: 0.71rem;
          color: #C03A1A;
          margin-top: 3px;
          font-weight: 500;
          font-family: var(--font-body), 'Lora', serif;
        }

        /* Mobile */
        @media (max-width: 860px) {
          .l-root { grid-template-columns: 1fr; }
          .l-left { display: none; }
          .l-right { min-height: 100vh; padding: 2.5rem 1.5rem; }
          .l-form-wrap { max-width: 400px; }
        }
      `}</style>

      <div className="l-root">

        {/* ── LEFT ── */}
        <div className="l-left">
          <div className="l-top-bar" />
          <div className="l-arch" />

          <div className="l-brand">
            <div className="l-brand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 11.5L12 3.5L21 11.5" stroke="rgba(192,90,59,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 10V20C5 20.55 5.45 21 6 21H10V15H14V21H18C18.55 21 19 20.55 19 20V10" stroke="rgba(192,90,59,0.7)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="l-brand-name">Nido</span>
          </div>

          <div className="l-middle">
            <div className="l-overline">Para pisos compartidos</div>
            <h1 className="l-headline">
              Vivir juntos,<br/>
              <em>sin dramas.</em>
            </h1>
            <p className="l-desc">
              Gastos, compras y convivencia. Todo en un lugar, con un bot de WhatsApp que entiende cómo hablás.
            </p>
            <div className="l-features">
              <div className="l-feature"><div className="l-feature-dot"/>Bot de WhatsApp con IA</div>
              <div className="l-feature"><div className="l-feature-dot"/>Gastos divididos en segundos</div>
              <div className="l-feature"><div className="l-feature-dot"/>Lista de compras compartida</div>
              <div className="l-feature"><div className="l-feature-dot"/>100% gratis, sin tarjeta</div>
            </div>
          </div>

          <div className="l-bottom">
            <div className="l-footer-text">© {new Date().getFullYear()} Nido · Para convivir mejor</div>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="l-right">
          <button className="l-landing-btn" onClick={() => router.push('/landing')}>
            ¿Qué es Nido? →
          </button>

          <div className="l-form-wrap">
            {emailSent ? (
              <div className="l-success">
                <span className="l-success-icon">📬</span>
                <div className="l-success-title">Revisá tu email</div>
                <div className="l-success-sub">
                  Mandamos un link de confirmación a <strong>{email}</strong>.<br/>
                  Hacé click ahí para activar tu cuenta.
                </div>
                <button onClick={switchMode} style={{ marginTop:14, background:'none', border:'none', color:'#C05A3B', fontWeight:600, cursor:'pointer', fontSize:'0.83rem', fontFamily:'var(--font-body),Lora,serif', borderBottom:'1px solid rgba(192,90,59,0.3)' }}>
                  ← Volver al login
                </button>
              </div>
            ) : (
              <>
                <h2 className="l-form-title">
                  {mode === 'login' ? 'Bienvenido de vuelta' : 'Crear cuenta'}
                </h2>
                <p className="l-form-sub">
                  {mode === 'login'
                    ? 'Entrá a tu nido para ver cómo están las cosas'
                    : 'Empezá gratis, sin tarjeta de crédito'}
                </p>

                <button className="l-google" onClick={handleGoogle} disabled={googleLoading}>
                  {googleLoading ? <span className="l-spinner-dark"/> : (
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                  )}
                  Continuar con Google
                </button>

                <div className="l-divider">o</div>

                <form onSubmit={handleSubmit}>
                  <div className="l-field">
                    <label className="l-label">Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className="l-input" autoFocus autoComplete="email"/>
                  </div>
                  <div className="l-field">
                    <label className="l-label">Contraseña</label>
                    <div className="l-pwd-wrap">
                      <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mín. 6 caracteres" className="l-input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/>
                      <button type="button" className="l-eye" onClick={() => setShowPass(v => !v)}>
                        <EyeIcon open={showPass}/>
                      </button>
                    </div>
                  </div>
                  {mode === 'signup' && (
                    <div className="l-field">
                      <label className="l-label">Confirmar contraseña</label>
                      <input type={showPass ? 'text' : 'password'} value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="Repetí tu contraseña" className="l-input" autoComplete="new-password"/>
                      {passwordConfirm && password !== passwordConfirm && (
                        <div className="l-mismatch">No coinciden</div>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="l-error">
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink:0, marginTop:1 }}>
                        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="7" cy="9.5" r="0.6" fill="currentColor"/>
                      </svg>
                      {error}
                    </div>
                  )}

                  <button type="submit" className="l-submit" disabled={loading}>
                    {loading
                      ? <><span className="l-spinner"/>{mode === 'login' ? 'Entrando...' : 'Creando cuenta...'}</>
                      : mode === 'login' ? 'Entrar al nido →' : 'Crear mi nido gratis →'}
                  </button>
                </form>

                <div className="l-switch">
                  {mode === 'login'
                    ? <>¿Sin cuenta? <button onClick={switchMode}>Crear una gratis</button></>
                    : <>¿Ya tenés cuenta? <button onClick={switchMode}>Iniciar sesión</button></>}
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
