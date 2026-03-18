'use client'

import { useState, useEffect } from 'react'
import { Fraunces, Nunito } from 'next/font/google'
import type { Miembro } from '@/lib/types'

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito   = Nunito({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-body' })

interface Props {
  salaNombre: string
  miembros: Miembro[]
  miembroId: string
  onClose: () => void
}

const PASOS = [
  {
    icon: '🏠',
    titulo: (nombre: string) => `Bienvenido a ${nombre}`,
    desc: 'Tu nido está listo. Acá vas a poder organizar todo con tus compañeros sin dramas.',
  },
  {
    icon: '💸',
    titulo: () => 'Gastos compartidos',
    desc: 'Registrá gastos variables (se dividen entre todos) y fijos (alquiler, internet). El balance se calcula solo.',
  },
  {
    icon: '🛒',
    titulo: () => 'Lista de compras',
    desc: 'Agregá ítems a la lista compartida. Cuando alguien los compra, los marca como listos.',
  },
  {
    icon: '🤖',
    titulo: () => 'WhatsApp + IA',
    desc: 'Vinculá tu WhatsApp y registrá gastos con un mensaje. "Compré pan $80" y listo.',
  },
]

export default function OnboardingModal({ salaNombre, miembros, miembroId, onClose }: Props) {
  const [paso, setPaso] = useState(0)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function siguiente() {
    if (paso < PASOS.length - 1) {
      setPaso(p => p + 1)
    } else {
      cerrar()
    }
  }

  function cerrar() {
    setSaliendo(true)
    setTimeout(() => {
      localStorage.setItem(`nido_onboarded_${miembroId}`, '1')
      onClose()
    }, 280)
  }

  const p = PASOS[paso]
  const esUltimo = paso === PASOS.length - 1

  return (
    <div className={`${fraunces.variable} ${nunito.variable}`}>
      <style>{`
        @keyframes ob-in    { from { opacity: 0; transform: scale(0.96) translateY(16px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes ob-out   { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.96) translateY(12px); } }
        @keyframes ob-fade  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ob-slide { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes ob-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }

        .ob-overlay {
          position: fixed; inset: 0; z-index: 500;
          background: rgba(42,26,14,0.6); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 1.5rem;
          animation: ob-fade 0.25s ease both;
        }
        .ob-card {
          background: #FFF8F2; border: 1.5px solid #EAD8C8;
          border-radius: 28px; width: 100%; max-width: 420px;
          padding: 2.5rem 2rem 2rem;
          box-shadow: 0 24px 80px rgba(100,40,10,0.2);
          animation: ${saliendo ? 'ob-out' : 'ob-in'} 0.3s cubic-bezier(0.22,1,0.36,1) both;
          position: relative; overflow: hidden;
        }
        .ob-top-bar {
          position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #C05A3B, #E0843A);
        }
        .ob-skip {
          position: absolute; top: 1.2rem; right: 1.2rem;
          background: none; border: none; cursor: pointer;
          font-size: 0.72rem; color: #C0A898; font-weight: 600;
          font-family: var(--font-body), Nunito, sans-serif;
          padding: 4px 8px; border-radius: 6px;
          transition: color 0.15s, background 0.15s;
        }
        .ob-skip:hover { color: #8A6050; background: rgba(0,0,0,0.04); }

        .ob-icon {
          width: 72px; height: 72px; margin: 0 auto 1.4rem;
          border-radius: 20px; background: rgba(192,90,59,0.1);
          border: 1.5px solid rgba(192,90,59,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 2.2rem;
          animation: ob-pulse 0.5s ease both;
        }
        .ob-content { text-align: center; animation: ob-slide 0.3s ease both; }
        .ob-titulo {
          font-family: var(--font-serif), Georgia, serif;
          font-size: 1.55rem; font-weight: 700;
          letter-spacing: -0.03em; color: #2A1A0E;
          margin-bottom: 0.7rem; line-height: 1.15;
        }
        .ob-desc {
          font-size: 0.88rem; color: #7A5A48; line-height: 1.7;
          font-family: var(--font-body), Nunito, sans-serif;
          max-width: 300px; margin: 0 auto;
        }

        /* Miembros (solo paso 0) */
        .ob-miembros {
          display: flex; justify-content: center; gap: 10px;
          margin-top: 1.4rem; flex-wrap: wrap;
        }
        .ob-av {
          width: 40px; height: 40px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.85rem; font-weight: 700; color: white;
          border: 2px solid rgba(255,255,255,0.6);
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }
        .ob-av-name {
          font-size: 0.68rem; color: #8A6A58;
          text-align: center; margin-top: 4px;
          font-family: var(--font-body), Nunito, sans-serif;
          font-weight: 600;
        }

        /* Dots */
        .ob-dots {
          display: flex; justify-content: center; gap: 6px;
          margin: 1.6rem 0 1.4rem;
        }
        .ob-dot {
          height: 6px; border-radius: 3px;
          transition: all 0.3s ease;
          background: #E8D5C0;
        }
        .ob-dot.active { background: #C05A3B; width: 22px; }
        .ob-dot:not(.active) { width: 6px; }

        /* Botón */
        .ob-btn {
          width: 100%; padding: 14px;
          background: #C05A3B; color: white; border: none;
          border-radius: 14px; font-size: 0.92rem; font-weight: 700;
          font-family: var(--font-body), Nunito, sans-serif;
          cursor: pointer; letter-spacing: 0.01em;
          transition: background 0.18s, transform 0.15s, box-shadow 0.15s;
        }
        .ob-btn:hover { background: #A04730; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(192,90,59,0.35); }
        .ob-btn:active { transform: translateY(0); }
      `}</style>

      <div className="ob-overlay" onClick={e => { if (e.target === e.currentTarget) cerrar() }}>
        <div className="ob-card">
          <div className="ob-top-bar" />
          <button className="ob-skip" onClick={cerrar}>Saltar</button>

          <div className="ob-icon" key={paso}>{p.icon}</div>

          <div className="ob-content" key={`c-${paso}`}>
            <div className="ob-titulo">{p.titulo(salaNombre)}</div>
            <div className="ob-desc">{p.desc}</div>

            {paso === 0 && miembros.length > 0 && (
              <div className="ob-miembros">
                {miembros.map(m => (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      className="ob-av"
                      style={{
                        background: m.color,
                        outline: m.id === miembroId ? '3px solid #C05A3B' : 'none',
                        outlineOffset: 2,
                      }}
                    >
                      {m.nombre[0].toUpperCase()}
                    </div>
                    <div className="ob-av-name">{m.nombre}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ob-dots">
            {PASOS.map((_, i) => (
              <div key={i} className={`ob-dot${i === paso ? ' active' : ''}`} />
            ))}
          </div>

          <button className="ob-btn" onClick={siguiente}>
            {esUltimo ? '¡Empezar! →' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  )
}
