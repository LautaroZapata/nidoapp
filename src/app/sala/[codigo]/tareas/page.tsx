'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import type { Tarea, Miembro } from '@/lib/types'

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

// ── ISO Week helpers ──────────────────────────────────────────────────────────

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function formatWeekLabel(isoWeek: string): string {
  const [year, wStr] = isoWeek.split('-W')
  const isCurrentWeek = isoWeek === getISOWeek(new Date())
  return isCurrentWeek
    ? `Esta semana (${parseInt(wStr)})`
    : `Semana ${parseInt(wStr)} · ${year}`
}

function addWeeks(isoWeek: string, delta: number): string {
  const [year, wStr] = isoWeek.split('-W')
  const d = new Date(Date.UTC(parseInt(year), 0, 1 + (parseInt(wStr) - 1) * 7))
  d.setUTCDate(d.getUTCDate() + delta * 7)
  return getISOWeek(d)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TareasPage() {
  const params  = useParams()
  const router  = useRouter()
  const codigo  = params.codigo as string

  const [session]   = useState(getSession)
  const [tareas, setTareas]     = useState<Tarea[]>([])
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [loading, setLoading]   = useState(true)
  const [semana, setSemana]     = useState(() => getISOWeek(new Date()))
  const [modalOpen, setModalOpen]   = useState(false)
  const [guardando, setGuardando]   = useState(false)
  const [toggling, setToggling]     = useState<string | null>(null)
  const [borrando, setBorrando]     = useState<string | null>(null)
  const [formNombre, setFormNombre]       = useState('')
  const [formAsignada, setFormAsignada]   = useState('')
  const [formError, setFormError]         = useState('')

  const cargarDatos = useCallback(async () => {
    if (!session) return
    const supabase = createClient()
    setLoading(true)
    const [{ data: tareasData }, { data: miembrosData }] = await Promise.all([
      supabase
        .from('tareas')
        .select()
        .eq('sala_id', session.salaId)
        .eq('semana', semana)
        .order('creado_en', { ascending: true }),
      supabase
        .from('miembros')
        .select()
        .eq('sala_id', session.salaId),
    ])
    if (tareasData) setTareas(tareasData as Tarea[])
    if (miembrosData) setMiembros(miembrosData as Miembro[])
    setLoading(false)
  }, [session, semana])

  useEffect(() => {
    if (!session || session.salaCodigo !== codigo) {
      router.replace('/')
      return
    }
    cargarDatos()
  }, [codigo, session, cargarDatos, router])

  // Realtime
  useEffect(() => {
    if (!session) return
    const supabase = createClient()
    const channel = supabase
      .channel(`tareas_${session.salaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tareas', filter: `sala_id=eq.${session.salaId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const t = payload.new as Tarea
            if (t.semana === semana) setTareas(prev => [...prev, t])
          } else if (payload.eventType === 'UPDATE') {
            setTareas(prev => prev.map(t => t.id === payload.new.id ? payload.new as Tarea : t))
          } else if (payload.eventType === 'DELETE') {
            setTareas(prev => prev.filter(t => t.id !== (payload.old as Tarea).id))
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session, semana])

  async function handleAgregar(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!formNombre.trim()) { setFormError('El nombre es obligatorio'); return }
    if (!formAsignada) { setFormError('Tenés que asignar la tarea a alguien'); return }
    if (!session) return
    setGuardando(true)
    const supabase = createClient()
    const { error } = await supabase.from('tareas').insert({
      sala_id: session.salaId,
      nombre: formNombre.trim(),
      asignada_a: formAsignada,
      semana,
      completada: false,
    })
    setGuardando(false)
    if (error) { setFormError('Error al guardar. Intentá de nuevo.'); return }
    setFormNombre('')
    setFormAsignada('')
    setModalOpen(false)
  }

  async function toggleCompletada(tarea: Tarea) {
    if (toggling || tarea.asignada_a !== session?.miembroId) return
    setToggling(tarea.id)
    const supabase = createClient()
    await supabase.from('tareas').update({ completada: !tarea.completada }).eq('id', tarea.id)
    setToggling(null)
  }

  async function eliminarTarea(id: string) {
    if (borrando) return
    setBorrando(id)
    const supabase = createClient()
    await supabase.from('tareas').delete().eq('id', id)
    setBorrando(null)
  }

  function getMiembro(id: string | null) {
    return miembros.find(m => m.id === id) ?? null
  }

  const pendientes  = tareas.filter(t => !t.completada)
  const completadas = tareas.filter(t => t.completada)

  return (
    <div className={`${fraunces.variable} ${nunito.variable}`} style={{ minHeight: '100dvh', background: '#FFF8F2' }}>
      <style>{`
        .tareas-page { max-width: 600px; margin: 0 auto; padding: 0 0 100px; }
        .tareas-header {
          padding: 1.5rem 1.25rem 0;
          display: flex; align-items: center; justify-content: space-between;
        }
        .tareas-title {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 1.5rem; font-weight: 700;
          color: #2A1A0E; letter-spacing: -0.03em;
        }
        .week-nav {
          display: flex; align-items: center; gap: 8px;
          padding: 0.75rem 1.25rem;
        }
        .week-btn {
          width: 32px; height: 32px; border-radius: 8px;
          border: 1.5px solid #EAD8C8; background: white;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #8A6050; transition: background 0.15s;
          flex-shrink: 0;
        }
        .week-btn:hover { background: #F5EDE6; }
        .week-label {
          flex: 1; text-align: center;
          font-family: 'Nunito', sans-serif; font-size: 0.85rem;
          font-weight: 700; color: #7A5540;
        }
        .section-title {
          font-family: 'Nunito', sans-serif; font-size: 0.72rem;
          font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
          color: #B09080; padding: 1rem 1.25rem 0.4rem;
        }
        .tarea-card {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 1.25rem;
          border-bottom: 1px solid rgba(234,216,200,0.5);
          transition: background 0.12s;
        }
        .tarea-card:last-child { border-bottom: none; }
        .tarea-check {
          width: 22px; height: 22px; border-radius: 50%;
          border: 2px solid #D4A899; background: white;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: all 0.15s;
        }
        .tarea-check.done { background: #C05A3B; border-color: #C05A3B; }
        .tarea-check.locked { border-color: #E0D0C8; background: #F5EDE8; cursor: not-allowed; }
        .tarea-check:not(.locked):active { transform: scale(0.88); }
        .tarea-nombre {
          flex: 1;
          font-family: 'Nunito', sans-serif; font-size: 0.92rem;
          font-weight: 600; color: #2A1A0E; line-height: 1.3;
        }
        .tarea-nombre.done { text-decoration: line-through; color: #B09080; }
        .tarea-avatar {
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.62rem; font-weight: 800; color: white; flex-shrink: 0;
          border: 2px solid rgba(255,255,255,0.5);
          box-shadow: 0 1px 4px rgba(0,0,0,0.12);
        }
        .tarea-del {
          width: 28px; height: 28px; border-radius: 7px;
          border: none; background: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #C8A898; transition: color 0.15s, background 0.15s;
          flex-shrink: 0;
        }
        .tarea-del:hover { color: #C05A3B; background: rgba(192,90,59,0.08); }
        .empty-state {
          text-align: center; padding: 3.5rem 1.5rem;
        }
        .fab {
          position: fixed; bottom: calc(72px + env(safe-area-inset-bottom, 0px));
          right: 1.25rem; z-index: 100;
          width: 52px; height: 52px; border-radius: 50%;
          background: #C05A3B; color: white; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; box-shadow: 0 4px 20px rgba(192,90,59,0.4);
          transition: transform 0.15s, box-shadow 0.15s;
          font-size: 1.5rem; font-weight: 300;
        }
        .fab:active { transform: scale(0.92); box-shadow: 0 2px 10px rgba(192,90,59,0.3); }
        @media (min-width: 1024px) {
          .fab { bottom: 1.5rem; right: calc(50% - 300px + 1.25rem); }
        }
        .modal-backdrop {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(42,26,14,0.45); backdrop-filter: blur(6px);
          display: flex; align-items: flex-end; justify-content: center;
        }
        @media (min-width: 640px) { .modal-backdrop { align-items: center; } }
        .modal-sheet {
          width: 100%; max-width: 480px;
          background: #FFF8F2; border-radius: 22px 22px 0 0;
          padding: 1.5rem 1.25rem 2rem;
          animation: sheet-in 0.28s cubic-bezier(0.22,1,0.36,1);
        }
        @media (min-width: 640px) { .modal-sheet { border-radius: 22px; } }
        @keyframes sheet-in {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .form-label {
          font-family: 'Nunito', sans-serif; font-size: 0.75rem;
          font-weight: 700; color: #8A6050; letter-spacing: 0.04em;
          text-transform: uppercase; margin-bottom: 6px; display: block;
        }
        .form-input {
          width: 100%; padding: 11px 13px; border-radius: 10px;
          border: 1.5px solid #EAD8C8; background: white;
          font-family: 'Nunito', sans-serif; font-size: 0.92rem;
          color: #2A1A0E; outline: none; box-sizing: border-box;
        }
        .form-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.1); }
        .btn-primary {
          width: 100%; padding: 13px;
          background: #C05A3B; color: white; border: none;
          border-radius: 12px; font-family: 'Nunito', sans-serif;
          font-size: 0.95rem; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-secondary {
          width: 100%; padding: 12px;
          background: none; color: #8A6050; border: 1.5px solid #EAD8C8;
          border-radius: 12px; font-family: 'Nunito', sans-serif;
          font-size: 0.9rem; font-weight: 600; cursor: pointer;
          margin-top: 8px;
        }
      `}</style>

      <div className="tareas-page">
        {/* Header */}
        <div className="tareas-header">
          <h1 className="tareas-title">Tareas</h1>
        </div>

        {/* Week navigation */}
        <div className="week-nav">
          <button className="week-btn" onClick={() => setSemana(w => addWeeks(w, -1))} aria-label="Semana anterior">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="week-label">{formatWeekLabel(semana)}</span>
          <button className="week-btn" onClick={() => setSemana(w => addWeeks(w, 1))} aria-label="Semana siguiente">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#B09080', fontFamily: 'Nunito, sans-serif', fontSize: '0.9rem' }}>
            Cargando…
          </div>
        ) : tareas.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🧹</div>
            <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, color: '#2A1A0E', fontSize: '1rem', marginBottom: 6 }}>
              No hay tareas esta semana
            </div>
            <div style={{ fontFamily: 'Nunito, sans-serif', color: '#B09080', fontSize: '0.82rem', lineHeight: 1.5 }}>
              Tocá + para agregar la primera tarea
            </div>
          </div>
        ) : (
          <>
            {/* Pendientes */}
            {pendientes.length > 0 && (
              <div style={{ background: 'white', borderRadius: 16, margin: '0 1rem 12px', border: '1.5px solid #EAD8C8', overflow: 'hidden' }}>
                <div className="section-title">Pendientes · {pendientes.length}</div>
                {pendientes.map(tarea => {
                  const miembro = getMiembro(tarea.asignada_a)
                  const esMia = tarea.asignada_a === session?.miembroId
                  return (
                    <div key={tarea.id} className="tarea-card">
                      <button
                        className={`tarea-check${esMia ? '' : ' locked'}`}
                        onClick={() => esMia && toggleCompletada(tarea)}
                        disabled={toggling === tarea.id || !esMia}
                        aria-label={esMia ? 'Marcar completada' : 'Solo el asignado puede completar esta tarea'}
                        title={esMia ? undefined : `Solo ${miembro?.nombre ?? 'el asignado'} puede completar esta tarea`}
                      >
                        {toggling === tarea.id && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                        {!esMia && (
                          <svg width="10" height="10" viewBox="0 0 12 14" fill="none">
                            <rect x="1" y="6" width="10" height="7" rx="1.5" stroke="#C8B0A8" strokeWidth="1.4"/>
                            <path d="M3 6V4a3 3 0 016 0v2" stroke="#C8B0A8" strokeWidth="1.4" strokeLinecap="round"/>
                          </svg>
                        )}
                      </button>
                      <span className="tarea-nombre">{tarea.nombre}</span>
                      {miembro && (
                        <div className="tarea-avatar" style={{ background: miembro.color }} title={miembro.nombre}>
                          {miembro.nombre[0].toUpperCase()}
                        </div>
                      )}
                      <button
                        className="tarea-del"
                        onClick={() => eliminarTarea(tarea.id)}
                        disabled={borrando === tarea.id}
                        aria-label="Eliminar"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5.5 6v4M8.5 6v4M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5l.7-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Completadas */}
            {completadas.length > 0 && (
              <div style={{ background: 'white', borderRadius: 16, margin: '0 1rem 12px', border: '1.5px solid #EAD8C8', overflow: 'hidden', opacity: 0.75 }}>
                <div className="section-title">Completadas · {completadas.length}</div>
                {completadas.map(tarea => {
                  const miembro = getMiembro(tarea.asignada_a)
                  const esMia = tarea.asignada_a === session?.miembroId
                  return (
                    <div key={tarea.id} className="tarea-card">
                      <button
                        className={`tarea-check done${esMia ? '' : ' locked'}`}
                        onClick={() => esMia && toggleCompletada(tarea)}
                        disabled={toggling === tarea.id || !esMia}
                        aria-label={esMia ? 'Marcar pendiente' : 'Solo el asignado puede cambiar esta tarea'}
                        title={esMia ? undefined : `Solo ${miembro?.nombre ?? 'el asignado'} puede cambiar esta tarea`}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <span className="tarea-nombre done">{tarea.nombre}</span>
                      {miembro && (
                        <div className="tarea-avatar" style={{ background: miembro.color }} title={miembro.nombre}>
                          {miembro.nombre[0].toUpperCase()}
                        </div>
                      )}
                      <button
                        className="tarea-del"
                        onClick={() => eliminarTarea(tarea.id)}
                        disabled={borrando === tarea.id}
                        aria-label="Eliminar"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5.5 6v4M8.5 6v4M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5l.7-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => { setModalOpen(true); setFormError('') }} aria-label="Agregar tarea">
        +
      </button>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal-sheet">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 700, color: '#2A1A0E', margin: 0 }}>
                Nueva tarea
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                style={{ width: 30, height: 30, borderRadius: 8, background: '#F0E8DF', border: '1px solid #E0C8B8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#A07060' }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </button>
            </div>

            <form onSubmit={handleAgregar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">Tarea</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Ej: Limpiar el baño"
                  value={formNombre}
                  onChange={e => setFormNombre(e.target.value)}
                  maxLength={80}
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label">Asignada a</label>
                <select
                  className="form-input"
                  value={formAsignada}
                  onChange={e => setFormAsignada(e.target.value)}
                  required
                >
                  <option value="">Elegir miembro…</option>
                  {miembros.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>

              {formError && (
                <p style={{ fontFamily: 'Nunito, sans-serif', fontSize: '0.8rem', color: '#C05A3B', margin: 0 }}>{formError}</p>
              )}

              <button className="btn-primary" type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Agregar tarea'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
