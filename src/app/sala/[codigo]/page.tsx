'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession, clearSession } from '@/lib/session'
import type { Miembro } from '@/lib/types'

const fraunces = Fraunces({
  weight: 'variable',
  subsets: ['latin'],
  variable: '--font-serif',
})
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
})

export default function SalaPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string
  const [session, setLocalSession] = useState(getSession())
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const s = getSession()
    if (!s || s.salaCodigo !== codigo) {
      router.replace('/')
      return
    }
    setLocalSession(s)

    const supabase = createClient()
    supabase
      .from('miembros')
      .select()
      .eq('sala_id', s.salaId)
      .then(({ data }) => {
        if (data) setMiembros(data as Miembro[])
      })
  }, [codigo, router])

  function handleSalir() {
    clearSession()
    router.replace('/')
  }

  function copiarCodigo() {
    navigator.clipboard.writeText(codigo)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
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

        .s-root {
          min-height: 100vh;
          background: #FAF5EE;
          font-family: var(--font-body), 'Nunito', system-ui, sans-serif;
          color: #2A1A0E;
        }
        .s-bg-pattern {
          position: fixed; inset: 0;
          background-image: radial-gradient(circle at 15% 20%, rgba(192,90,59,0.05) 0%, transparent 40%),
            radial-gradient(circle at 85% 80%, rgba(200,130,58,0.05) 0%, transparent 40%);
          pointer-events: none; z-index: 0;
        }
        .s-wrap {
          position: relative; z-index: 1;
          max-width: 500px; margin: 0 auto; padding: 0 1.25rem 4rem;
        }

        /* Header */
        .s-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.75rem 0 1.5rem;
          animation: s-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .s-sala-name {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1.6rem; font-weight: 600; color: #2A1A0E;
          letter-spacing: -0.02em;
        }
        .s-code-btn {
          font-size: 0.8rem; color: #A07060; background: none; border: none;
          cursor: pointer; transition: color 0.18s; padding: 0; margin-top: 2px;
          font-family: var(--font-body), 'Nunito', sans-serif;
        }
        .s-code-btn:hover { color: #C05A3B; }
        .s-code-mono { font-weight: 700; letter-spacing: 0.05em; }
        .s-header-right { display: flex; align-items: center; gap: 12px; }
        .s-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.85rem; font-weight: 700; color: white;
          border: 2.5px solid rgba(255,255,255,0.6);
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }
        .s-salir-btn {
          font-size: 0.82rem; color: #A07060; background: none; border: none;
          cursor: pointer; transition: color 0.18s;
          font-family: var(--font-body), 'Nunito', sans-serif;
        }
        .s-salir-btn:hover { color: #C04040; }

        /* Members card */
        .s-miembros {
          background: white; border-radius: 18px;
          border: 1.5px solid #EAD8C8;
          padding: 1.1rem 1.25rem; margin-bottom: 1.5rem;
          animation: s-fadeup 0.5s 0.05s cubic-bezier(0.22, 1, 0.36, 1) both;
          box-shadow: 0 2px 12px rgba(150,80,40,0.06);
        }
        .s-miembros-label {
          font-size: 0.7rem; font-weight: 700; color: #B09080;
          text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 10px;
        }
        .s-miembros-list { display: flex; gap: 14px; flex-wrap: wrap; }
        .s-miembro {
          display: flex; align-items: center; gap: 8px;
        }
        .s-miembro-av {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 700; color: white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }
        .s-miembro-name { font-size: 0.85rem; font-weight: 600; color: #2A1A0E; }
        .s-miembro-you { font-size: 0.72rem; color: #C05A3B; font-weight: 500; }

        /* Module grid */
        .s-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          animation: s-fadeup 0.5s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .s-mod {
          background: white; border-radius: 20px;
          border: 1.5px solid #EAD8C8;
          padding: 1.25rem 1.1rem;
          text-align: left; cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
          box-shadow: 0 2px 12px rgba(150,80,40,0.06);
          animation: s-card 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
          position: relative; overflow: hidden;
        }
        .s-mod::before {
          content: ''; position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          border-radius: 20px 20px 0 0;
          opacity: 0; transition: opacity 0.2s;
        }
        .s-mod:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(150,80,40,0.12); border-color: #D4B8A0; }
        .s-mod:hover::before { opacity: 1; }
        .s-mod:active { transform: translateY(-1px); }
        .s-mod.disabled { opacity: 0.5; cursor: not-allowed; }
        .s-mod.disabled:hover { transform: none; box-shadow: 0 2px 12px rgba(150,80,40,0.06); }

        .s-mod-icon { font-size: 1.8rem; margin-bottom: 8px; line-height: 1; }
        .s-mod-name { font-size: 0.95rem; font-weight: 700; color: #2A1A0E; margin-bottom: 3px; }
        .s-mod-desc { font-size: 0.75rem; color: #A07060; font-weight: 400; }
        .s-mod-soon { font-size: 0.72rem; color: #C05A3B; font-weight: 600; margin-top: 5px; }

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
        }
        @media (max-width: 360px) {
          .s-wrap { padding: 0 0.75rem 3rem; }
          .s-sala-name { font-size: 1.1rem; }
          .s-header-right { gap: 8px; }
          .s-salir-btn { font-size: 0.75rem; }
        }
      `}</style>

      <div className="s-root">
        <div className="s-bg-pattern" />
        <div className="s-wrap">

          {/* Header */}
          <div className="s-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 25 Q16 19.5 28 25" stroke="#C8823A" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M7 28 Q16 23.5 25 28" stroke="#C8823A" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
                  <ellipse cx="16" cy="20" rx="7" ry="8" fill="#FFF8F2" stroke="#EAC8B0" strokeWidth="1.5"/>
                  <path d="M13 18 L15.5 15 L18 18" stroke="#EAC8B0" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="16" cy="12" r="5.2" fill="#F5C842"/>
                  <circle cx="14.0" cy="11.2" r="0.95" fill="#2A1A0E"/>
                  <circle cx="18.0" cy="11.2" r="0.95" fill="#2A1A0E"/>
                  <path d="M14.6 13.2 L16 14.4 L17.4 13.2" fill="#E87830"/>
                </svg>
                <div className="s-sala-name">{session.salaNombre}</div>
              </div>
              <button className="s-code-btn" onClick={copiarCodigo}>
                Contraseña: <span className="s-code-mono">{codigo}</span>
                {copiado ? ' · ¡Copiada!' : ' · Copiar'}
              </button>
            </div>
            <div className="s-header-right">
              <div className="s-avatar" style={{ backgroundColor: session.miembroColor }}>
                {session.miembroNombre[0].toUpperCase()}
              </div>
              <button className="s-salir-btn" onClick={handleSalir}>Salir</button>
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
    </div>
  )
}
