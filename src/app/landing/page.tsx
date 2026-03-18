'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fraunces, Nunito, DM_Mono } from 'next/font/google'

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito   = Nunito({ subsets: ['latin'], weight: ['300','400','500','600','700','800'], variable: '--font-body' })
const dmMono   = DM_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-mono' })

const CHAT_MESSAGES = [
  { from: 'user',  text: 'gasté 1200 en el super entre todos',      delay: 0 },
  { from: 'bot',   text: '¿Confirmo que Lauta pagó $1200 del super entre todos? Respondé si o no', delay: 900 },
  { from: 'user',  text: 'si',                                       delay: 1800 },
  { from: 'bot',   text: '✅ Gasto guardado correctamente.',          delay: 2700 },
  { from: 'user',  text: 'cuánto debo',                              delay: 3800 },
  { from: 'bot',   text: 'No debés nada 😊 Al contrario, te deben $800.', delay: 4700 },
]

function WppDemo() {
  const [visible, setVisible] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true) }, { threshold: 0.4 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    CHAT_MESSAGES.forEach((m, i) => {
      setTimeout(() => setVisible(i + 1), m.delay)
    })
  }, [started])

  return (
    <div ref={ref} style={{
      background: '#ECE5DD',
      borderRadius: 24,
      padding: '0 0 16px',
      maxWidth: 320,
      width: '100%',
      boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      fontFamily: 'var(--font-body), Nunito, sans-serif',
    }}>
      {/* Header */}
      <div style={{ background: '#075E54', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#C05A3B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>🐣</div>
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem' }}>Nido Bot</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem' }}>en línea</div>
        </div>
      </div>
      {/* Messages */}
      <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 280 }}>
        {CHAT_MESSAGES.slice(0, visible).map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start',
            animation: 'l-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
            <div style={{
              background: m.from === 'user' ? '#DCF8C6' : 'white',
              borderRadius: m.from === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              padding: '8px 12px',
              maxWidth: '82%',
              fontSize: '0.82rem',
              color: '#111',
              lineHeight: 1.45,
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {visible < CHAT_MESSAGES.length && started && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: 'white', borderRadius: '12px 12px 12px 2px', padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#999', animation: `l-bounce 1s ${i*0.2}s infinite` }}/>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const FEATURES = [
  {
    icon: '💬',
    title: 'Bot de WhatsApp con IA',
    desc: 'Registrá gastos, consultá balances y manejá la lista de compras directamente desde el grupo de WhatsApp. Sin abrir la app.',
    color: '#25D366',
    bg: 'rgba(37,211,102,0.08)',
    border: 'rgba(37,211,102,0.2)',
  },
  {
    icon: '💰',
    title: 'Gastos compartidos',
    desc: 'Dividí en partes iguales o personalizadas. Calculamos quién le debe a quién con la mínima cantidad de transferencias.',
    color: '#C05A3B',
    bg: 'rgba(192,90,59,0.08)',
    border: 'rgba(192,90,59,0.2)',
  },
  {
    icon: '🏠',
    title: 'Buscar piso juntos',
    desc: 'Guardá y votá los aptos que les gustan. Compará precios, m² y zonas sin perder ninguna opción en el camino.',
    color: '#C8823A',
    bg: 'rgba(200,130,58,0.08)',
    border: 'rgba(200,130,58,0.2)',
  },
  {
    icon: '🛒',
    title: 'Lista de compras',
    desc: 'Lista compartida en tiempo real. Cuando alguien tilda algo, todos lo ven al instante. Nunca más comprar lo que ya había.',
    color: '#5A8869',
    bg: 'rgba(90,136,105,0.08)',
    border: 'rgba(90,136,105,0.2)',
  },
]

const STEPS = [
  { n: '01', title: 'Creá tu nido', desc: 'Armá el grupo en segundos e invitá a tus compañeros con un link.' },
  { n: '02', title: 'Conectá WhatsApp', desc: 'Vinculá tu número con un código y el bot ya sabe quién sos.' },
  { n: '03', title: 'Viví sin drama', desc: 'Mandá gastos por chat, consultá balances y organizate sin esfuerzo.' },
]

export default function LandingPage() {
  const router = useRouter()

  return (
    <div className={`${fraunces.variable} ${nunito.variable} ${dmMono.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes l-up     { from { opacity:0; transform:translateY(32px); } to { opacity:1; transform:translateY(0); } }
        @keyframes l-in     { from { opacity:0; transform:translateX(-24px); } to { opacity:1; transform:translateX(0); } }
        @keyframes l-pop    { from { opacity:0; transform:scale(0.85); } to { opacity:1; transform:scale(1); } }
        @keyframes l-float  { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-10px); } }
        @keyframes l-bounce { 0%,100% { transform:translateY(0); opacity:0.4; } 50% { transform:translateY(-4px); opacity:1; } }
        @keyframes l-spin   { to { transform:rotate(360deg); } }
        @keyframes l-grain  { 0%,100% { transform:translate(0,0); } 25% { transform:translate(2px,-1px); } 50% { transform:translate(-1px,2px); } 75% { transform:translate(-2px,-1px); } }

        html { scroll-behavior: smooth; }

        .l-root {
          min-height: 100vh;
          background: #FAF5EE;
          font-family: var(--font-body), 'Nunito', system-ui, sans-serif;
          color: #2A1A0E;
          overflow-x: hidden;
        }

        /* ── NAV ── */
        .l-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 2rem;
          background: rgba(250,245,238,0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(192,90,59,0.1);
        }
        .l-nav-logo { display:flex; align-items:center; gap:9px; cursor:pointer; }
        .l-nav-logo-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.35rem; color:#2A1A0E; font-weight:700; letter-spacing:-0.02em; }
        .l-nav-btns { display:flex; align-items:center; gap:10px; }
        .l-nav-login { padding:8px 18px; background:none; border:1.5px solid #D4B8A0; border-radius:999px; font-size:0.84rem; font-weight:600; color:#6B4030; cursor:pointer; font-family:var(--font-body),'Nunito',sans-serif; transition:all 0.18s; }
        .l-nav-login:hover { border-color:#C05A3B; color:#C05A3B; }
        .l-nav-cta { padding:9px 20px; background:#C05A3B; border:none; border-radius:999px; font-size:0.84rem; font-weight:700; color:white; cursor:pointer; font-family:var(--font-body),'Nunito',sans-serif; transition:all 0.18s; }
        .l-nav-cta:hover { background:#A04730; transform:translateY(-1px); box-shadow:0 6px 20px rgba(192,90,59,0.35); }

        /* ── HERO ── */
        .l-hero {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          gap: 4rem;
          max-width: 1100px;
          margin: 0 auto;
          padding: 8rem 2rem 4rem;
          position: relative;
        }
        .l-hero-left { animation: l-in 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        .l-hero-tag {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(37,211,102,0.1); border: 1.5px solid rgba(37,211,102,0.3);
          border-radius: 999px; padding: 6px 14px;
          font-size: 0.75rem; font-weight: 700; color: #1A8A4A;
          margin-bottom: 1.5rem; letter-spacing: 0.04em; text-transform: uppercase;
        }
        .l-hero-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: clamp(2.6rem, 5vw, 4rem);
          line-height: 1.1;
          letter-spacing: -0.03em;
          color: #2A1A0E;
          margin-bottom: 1.25rem;
          font-weight: 700;
        }
        .l-hero-title em { font-style: normal; color: #C05A3B; }
        .l-hero-sub {
          font-size: 1.1rem;
          color: #7A5040;
          line-height: 1.65;
          margin-bottom: 2.5rem;
          max-width: 420px;
          font-weight: 400;
        }
        .l-hero-btns { display: flex; gap: 12px; flex-wrap: wrap; }
        .l-btn-primary {
          padding: 14px 28px; background: #C05A3B; color: white; border: none;
          border-radius: 999px; font-size: 0.95rem; font-weight: 700;
          font-family: var(--font-body),'Nunito',sans-serif; cursor: pointer;
          transition: all 0.2s; display: flex; align-items: center; gap: 8px;
        }
        .l-btn-primary:hover { background: #A04730; transform: translateY(-2px); box-shadow: 0 10px 32px rgba(192,90,59,0.4); }
        .l-btn-secondary {
          padding: 14px 28px; background: white; color: #2A1A0E;
          border: 1.5px solid #D4B8A0; border-radius: 999px;
          font-size: 0.95rem; font-weight: 600;
          font-family: var(--font-body),'Nunito',sans-serif; cursor: pointer;
          transition: all 0.2s;
        }
        .l-btn-secondary:hover { border-color: #C05A3B; color: #C05A3B; transform: translateY(-2px); }

        .l-hero-right {
          display: flex; justify-content: center; align-items: center;
          animation: l-up 0.8s 0.2s cubic-bezier(0.22,1,0.36,1) both;
        }
        .l-phone-wrap {
          animation: l-float 5s ease-in-out infinite;
          position: relative;
        }
        .l-phone-wrap::before {
          content: '';
          position: absolute; inset: -40px;
          background: radial-gradient(circle, rgba(192,90,59,0.12) 0%, transparent 70%);
          border-radius: 50%; z-index: -1;
        }

        .l-hero-stats {
          display: flex; gap: 2rem; margin-top: 2.5rem;
          padding-top: 2rem;
          border-top: 1px solid rgba(192,90,59,0.15);
        }
        .l-stat-val { font-family: var(--font-mono), monospace; font-size: 1.6rem; font-weight: 500; color: #C05A3B; }
        .l-stat-label { font-size: 0.75rem; color: #A07060; margin-top: 2px; }

        /* ── FEATURES ── */
        .l-features {
          background: white;
          padding: 6rem 2rem;
          position: relative;
          overflow: hidden;
        }
        .l-features::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(192,90,59,0.3), transparent);
        }
        .l-section-wrap { max-width: 1100px; margin: 0 auto; }
        .l-section-label {
          font-size: 0.7rem; font-weight: 800; letter-spacing: 0.12em;
          text-transform: uppercase; color: #C05A3B; margin-bottom: 12px;
        }
        .l-section-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: clamp(1.8rem, 3.5vw, 2.8rem);
          font-weight: 700; letter-spacing: -0.025em;
          color: #2A1A0E; margin-bottom: 0.5rem; line-height: 1.15;
        }
        .l-section-sub { font-size: 1rem; color: #8A6050; max-width: 520px; line-height: 1.6; margin-bottom: 3.5rem; }
        .l-features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 20px;
        }
        .l-feat-card {
          border-radius: 20px;
          padding: 1.75rem 1.5rem;
          border: 1.5px solid #EAD8C8;
          background: #FDFAF7;
          transition: transform 0.2s, box-shadow 0.2s;
          position: relative; overflow: hidden;
        }
        .l-feat-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(150,80,40,0.1); }
        .l-feat-icon {
          width: 52px; height: 52px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.5rem; margin-bottom: 1.1rem;
        }
        .l-feat-title { font-size: 1rem; font-weight: 700; color: #2A1A0E; margin-bottom: 8px; font-family: var(--font-serif), serif; }
        .l-feat-desc { font-size: 0.84rem; color: #8A6050; line-height: 1.6; }

        /* ── HOW IT WORKS ── */
        .l-how { padding: 6rem 2rem; background: #FAF5EE; }
        .l-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 2rem; margin-top: 3rem; }
        .l-step { position: relative; }
        .l-step-n {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 4rem; font-weight: 700; color: rgba(192,90,59,0.12);
          line-height: 1; margin-bottom: 0.5rem; letter-spacing: -0.05em;
        }
        .l-step-title { font-size: 1.1rem; font-weight: 700; color: #2A1A0E; margin-bottom: 8px; font-family: var(--font-serif), serif; }
        .l-step-desc { font-size: 0.87rem; color: #8A6050; line-height: 1.6; }
        .l-step-line {
          position: absolute; top: 28px; right: -1rem; width: calc(100% - 20px);
          height: 1px; background: linear-gradient(90deg, rgba(192,90,59,0.3), transparent);
        }

        /* ── WPP BANNER ── */
        .l-wpp-banner {
          background: linear-gradient(135deg, #0A3D2E 0%, #075E54 50%, #128C7E 100%);
          padding: 5rem 2rem;
          position: relative; overflow: hidden;
        }
        .l-wpp-banner::before {
          content: '';
          position: absolute; top: -50%; right: -10%;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(37,211,102,0.15) 0%, transparent 60%);
          pointer-events: none;
        }
        .l-wpp-inner {
          max-width: 1100px; margin: 0 auto;
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 4rem; align-items: center;
        }
        .l-wpp-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: clamp(1.8rem, 3vw, 2.6rem);
          font-weight: 700; color: white; line-height: 1.2;
          letter-spacing: -0.025em; margin-bottom: 1rem;
        }
        .l-wpp-title em { font-style: normal; color: #25D366; }
        .l-wpp-sub { font-size: 0.95rem; color: rgba(255,255,255,0.7); line-height: 1.65; margin-bottom: 2rem; }
        .l-wpp-features { display: flex; flex-direction: column; gap: 10px; }
        .l-wpp-feat {
          display: flex; align-items: center; gap: 10px;
          font-size: 0.87rem; color: rgba(255,255,255,0.85);
        }
        .l-wpp-check {
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(37,211,102,0.2); border: 1px solid rgba(37,211,102,0.4);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.65rem; color: #25D366; flex-shrink: 0;
        }

        /* ── CTA FINAL ── */
        .l-cta {
          padding: 7rem 2rem;
          text-align: center;
          position: relative; overflow: hidden;
          background: #FAF5EE;
        }
        .l-cta::before {
          content: '';
          position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(192,90,59,0.07) 0%, transparent 70%);
          pointer-events: none;
        }
        .l-cta-emoji { font-size: 3.5rem; margin-bottom: 1.5rem; display: block; animation: l-float 4s ease-in-out infinite; }
        .l-cta-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: clamp(2rem, 4vw, 3.2rem);
          font-weight: 700; letter-spacing: -0.03em;
          color: #2A1A0E; margin-bottom: 1rem; line-height: 1.15;
        }
        .l-cta-sub { font-size: 1rem; color: #8A6050; margin-bottom: 2.5rem; max-width: 420px; margin-left: auto; margin-right: auto; line-height: 1.6; }
        .l-cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

        /* ── FOOTER ── */
        .l-footer {
          padding: 2rem;
          text-align: center;
          border-top: 1px solid rgba(192,90,59,0.12);
          font-size: 0.8rem; color: #B09080;
        }

        @media (max-width: 768px) {
          .l-nav { padding: 0.85rem 1.25rem; }
          .l-hero { grid-template-columns: 1fr; gap: 3rem; padding-top: 6rem; text-align: center; }
          .l-hero-left { animation: l-up 0.7s cubic-bezier(0.22,1,0.36,1) both; }
          .l-hero-sub { margin-left: auto; margin-right: auto; }
          .l-hero-btns { justify-content: center; }
          .l-hero-stats { justify-content: center; }
          .l-hero-right { order: -1; }
          .l-wpp-inner { grid-template-columns: 1fr; gap: 2.5rem; }
          .l-step-line { display: none; }
          .l-nav-login { display: none; }
        }
      `}</style>

      <div className="l-root">

        {/* ── NAV ── */}
        <nav className="l-nav">
          <div className="l-nav-logo" onClick={() => router.push('/')}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect x="5" y="15" width="22" height="15" rx="2" fill="#FFF5EE" stroke="#DFC5B0" strokeWidth="1.5"/>
              <path d="M3 16.5L16 4.5L29 16.5" stroke="#C8823A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="13" y="22" width="6" height="8" rx="1.5" fill="#FDEBD8" stroke="#D4A880" strokeWidth="1.3"/>
            </svg>
            <span className="l-nav-logo-title">Nido</span>
          </div>
          <div className="l-nav-btns">
            <button className="l-nav-login" onClick={() => router.push('/')}>Iniciar sesión</button>
            <button className="l-nav-cta" onClick={() => router.push('/')}>Empezar gratis →</button>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section className="l-hero">
          <div className="l-hero-left">
            <div className="l-hero-tag">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1.5C3.515 1.5 1.5 3.515 1.5 6c0 .782.207 1.515.566 2.148L1.5 10.5l2.43-.556A4.47 4.47 0 006 10.5c2.485 0 4.5-2.015 4.5-4.5S8.485 1.5 6 1.5z" fill="#25D366"/>
              </svg>
              Nuevo · Bot de WhatsApp con IA
            </div>
            <h1 className="l-hero-title">
              Tu piso compartido,<br/>
              <em>sin el drama</em>
            </h1>
            <p className="l-hero-sub">
              Gastos divididos, lista de compras compartida y bot de WhatsApp con IA. Todo lo que necesitás para vivir con compañeros sin peleas.
            </p>
            <div className="l-hero-btns">
              <button className="l-btn-primary" onClick={() => router.push('/')}>
                Crear mi nido gratis
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button className="l-btn-secondary" onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}>
                Ver cómo funciona
              </button>
            </div>
            <div className="l-hero-stats">
              <div>
                <div className="l-stat-val">100%</div>
                <div className="l-stat-label">Gratis para empezar</div>
              </div>
              <div>
                <div className="l-stat-val">2 min</div>
                <div className="l-stat-label">Para crear tu nido</div>
              </div>
              <div>
                <div className="l-stat-val">0 apps</div>
                <div className="l-stat-label">Extra necesarias</div>
              </div>
            </div>
          </div>

          <div className="l-hero-right">
            <div className="l-phone-wrap">
              <WppDemo />
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section className="l-features">
          <div className="l-section-wrap">
            <div className="l-section-label">Funcionalidades</div>
            <h2 className="l-section-title">Todo lo que un piso<br/>compartido necesita</h2>
            <p className="l-section-sub">Desde buscar el apto hasta liquidar deudas al final del mes. Un solo lugar para todo.</p>
            <div className="l-features-grid">
              {FEATURES.map((f, i) => (
                <div key={i} className="l-feat-card">
                  <div className="l-feat-icon" style={{ background: f.bg, border: `1.5px solid ${f.border}` }}>
                    {f.icon}
                  </div>
                  <div className="l-feat-title">{f.title}</div>
                  <div className="l-feat-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="l-how" id="como-funciona">
          <div className="l-section-wrap">
            <div className="l-section-label">Cómo funciona</div>
            <h2 className="l-section-title">En tres pasos<br/>y listo</h2>
            <div className="l-steps">
              {STEPS.map((s, i) => (
                <div key={i} className="l-step">
                  <div className="l-step-n">{s.n}</div>
                  <div className="l-step-title">{s.title}</div>
                  <div className="l-step-desc">{s.desc}</div>
                  {i < STEPS.length - 1 && <div className="l-step-line"/>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WPP BANNER ── */}
        <section className="l-wpp-banner">
          <div className="l-wpp-inner">
            <div>
              <div style={{ fontSize:'0.7rem', fontWeight:800, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(37,211,102,0.8)', marginBottom:12 }}>
                Bot inteligente
              </div>
              <h2 className="l-wpp-title">
                Manejá todo<br/>
                desde <em>WhatsApp</em>
              </h2>
              <p className="l-wpp-sub">
                No hace falta abrir la app. Escribile al bot en lenguaje natural y él se encarga del resto. Confirma antes de guardar para que nunca haya errores.
              </p>
              <div className="l-wpp-features">
                {[
                  '"gasté 800 en el super entre todos" → gasto registrado',
                  '"falta papel y detergente" → lista de compras',
                  '"cuánto debo?" → responde con tu balance real',
                  'Confirmación antes de guardar cualquier cosa',
                ].map((t, i) => (
                  <div key={i} className="l-wpp-feat">
                    <div className="l-wpp-check">✓</div>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'center' }}>
              <WppDemo />
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="l-cta">
          <span className="l-cta-emoji">🐣</span>
          <h2 className="l-cta-title">¿Listo para vivir<br/>sin el caos?</h2>
          <p className="l-cta-sub">Creá tu nido en 2 minutos. Invitá a tus compañeros. Empezá a organizarte hoy.</p>
          <div className="l-cta-btns">
            <button className="l-btn-primary" onClick={() => router.push('/')}>
              Crear mi nido gratis →
            </button>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="l-footer">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:6 }}>
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
              <rect x="5" y="15" width="22" height="15" rx="2" fill="#FFF5EE" stroke="#DFC5B0" strokeWidth="1.5"/>
              <path d="M3 16.5L16 4.5L29 16.5" stroke="#C8823A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="13" y="22" width="6" height="8" rx="1.5" fill="#FDEBD8" stroke="#D4A880" strokeWidth="1.3"/>
            </svg>
            <span style={{ fontFamily:'var(--font-serif),Georgia,serif', fontWeight:600, color:'#2A1A0E' }}>Nido</span>
          </div>
          <div>Hecho con ❤️ para los que comparten más que el alquiler.</div>
        </footer>

      </div>
    </div>
  )
}
