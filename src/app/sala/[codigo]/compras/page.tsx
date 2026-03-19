'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import type { ItemCompra, Miembro } from '@/lib/types'
import { notificarSala } from '@/lib/push'
import { ConfirmModal } from '@/components/ConfirmModal'

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

const FORM_INIT = { nombre: '', cantidad: 1 }

export default function ComprasPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [session] = useState(getSession)
  const [items, setItems] = useState<ItemCompra[]>([])
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [formError, setFormError] = useState('')
  const [realtimeOk, setRealtimeOk] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [pendientesPag, setPendientesPag] = useState(25)
  const [completadosPag, setCompletadosPag] = useState(10)
  const [confirmDialog, setConfirmDialog] = useState<{ title?: string; message: string; onConfirm: () => void } | null>(null)

  const cargarDatos = useCallback(async () => {
    if (!session) return
    const supabase = createClient()
    setLoading(true)
    const [{ data: itemsData }, { data: miembrosData }] = await Promise.all([
      supabase.from('items_compra').select().eq('sala_id', session.salaId).order('creado_en', { ascending: true }),
      supabase.from('miembros').select().eq('sala_id', session.salaId).not('user_id', 'is', null),
    ])
    if (itemsData) setItems(itemsData as ItemCompra[])
    if (miembrosData) setMiembros(miembrosData as Miembro[])
    setLoading(false)
  }, [session])

  useEffect(() => {
    if (!session || session.salaCodigo !== codigo) {
      router.replace('/')
      return
    }
    cargarDatos()
  }, [codigo, session, cargarDatos, router])

  useEffect(() => {
    if (!session) return
    const supabase = createClient()
    const channel = supabase
      .channel(`compras_${session.salaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items_compra', filter: `sala_id=eq.${session.salaId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setItems(prev => [...prev, payload.new as ItemCompra])
          } else if (payload.eventType === 'UPDATE') {
            setItems(prev => prev.map(i => i.id === payload.new.id ? payload.new as ItemCompra : i))
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(i => i.id !== payload.old.id))
          }
        }
      )
      .subscribe((status) => {
        setRealtimeOk(status === 'SUBSCRIBED')
      })
    return () => { supabase.removeChannel(channel) }
  }, [session])

  async function handleAñadir(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.nombre.trim()) { setFormError('El nombre del producto es obligatorio'); return }
    setGuardando(true)
    const supabase = createClient()
    const { error } = await supabase.from('items_compra').insert({
      sala_id: session!.salaId,
      nombre: form.nombre.trim(),
      cantidad: form.cantidad,
      añadido_por: session!.miembroId,
    })
    if (error) { setFormError('Error al añadir el ítem'); setGuardando(false); return }
    const quien = miembros.find(m => m.id === session!.miembroId)?.nombre ?? 'Alguien'
    notificarSala({
      salaId: session!.salaId,
      excluirMiembroId: session!.miembroId,
      titulo: '🛒 Nueva compra',
      cuerpo: `${quien} agregó: ${form.nombre.trim()}${form.cantidad > 1 ? ` (x${form.cantidad})` : ''}`,
      url: `/sala/${codigo}/compras`,
    })
    setModalOpen(false)
    setGuardando(false)
    setForm(FORM_INIT)
  }

  async function handleToggle(item: ItemCompra) {
    if (toggling) return
    setToggling(item.id)
    const supabase = createClient()
    await supabase.from('items_compra').update({ completado: !item.completado }).eq('id', item.id)
    setToggling(null)
  }

  async function handleEliminar(id: string) {
    setBorrando(id)
    const supabase = createClient()
    const { error } = await supabase.from('items_compra').delete().eq('id', id)
    if (error) {
      setFormError('Error al eliminar el ítem')
    }
    setBorrando(null)
  }

  function handleLimpiarCompletados() {
    const ids = items.filter(i => i.completado).map(i => i.id)
    if (ids.length === 0) return
    setConfirmDialog({
      title: 'Limpiar completados',
      message: `Se eliminarán ${ids.length} ítem${ids.length !== 1 ? 's' : ''} completado${ids.length !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        setConfirmDialog(null)
        const supabase = createClient()
        await supabase.from('items_compra').delete().in('id', ids)
      },
    })
  }

  if (!session) return null

  const pendientes = items.filter(i => !i.completado)
  const completados = items.filter(i => i.completado)

  const liderEntry = miembros.length > 0
    ? miembros
        .map(m => ({ m, count: items.filter(i => i.añadido_por === m.id).length }))
        .sort((a, b) => b.count - a.count)[0]
    : null
  const lider = liderEntry && liderEntry.count > 0 ? liderEntry : null

  function getMiembro(id: string | null) {
    return miembros.find(m => m.id === id) ?? null
  }

  return (
    <div className={`${fraunces.variable} ${nunito.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes c-spin    { to { transform: rotate(360deg); } }
        @keyframes c-fadeup  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes c-in      { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes c-card    { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes c-modal   { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes c-overlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes c-shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
        @keyframes c-pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes c-check   { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        .c-root {
          min-height: 100vh;
          background: #FAF5EE;
          font-family: var(--font-body), 'Nunito', system-ui, sans-serif;
          color: #2A1A0E;
          position: relative;
        }
        .c-bg {
          position: fixed; inset: 0;
          background-image: radial-gradient(circle at 10% 15%, rgba(200,130,58,0.05) 0%, transparent 40%),
            radial-gradient(circle at 90% 85%, rgba(90,136,105,0.04) 0%, transparent 40%);
          pointer-events: none; z-index: 0;
        }
        .c-wrap {
          position: relative; z-index: 1;
          max-width: 760px; margin: 0 auto; padding: 0 1.5rem 5rem;
        }
        @media (min-width: 1024px) {
          .c-wrap { max-width: none; padding: 0 2.5rem 5rem; }
          .c-desktop-cols { display: grid; grid-template-columns: 3fr 2fr; gap: 2.5rem; align-items: start; }
        }

        /* ── Header ── */
        .c-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.75rem 0 2rem;
          animation: c-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .c-header-left { display: flex; align-items: center; gap: 1rem; }
        .c-back {
          width: 36px; height: 36px; border-radius: 10px;
          background: white; border: 1.5px solid #E8D5C0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.18s, border-color 0.18s;
          color: #A07060; box-shadow: 0 1px 4px rgba(150,80,40,0.08);
        }
        .c-back:hover { background: #FFF5EE; border-color: #C05A3B; color: #C05A3B; }
        .c-header-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; color: #2A1A0E;
        }
        .c-header-sub { font-size: 0.75rem; color: #A07060; font-weight: 400; margin-top: 1px; }
        .c-header-right { display: flex; align-items: center; gap: 10px; }
        .c-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.8rem; font-weight: 700; color: white;
          border: 2px solid rgba(255,255,255,0.6);
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }
        .c-add-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 18px; background: #C8823A; color: white; border: none;
          border-radius: 12px; font-size: 0.83rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
        }
        .c-add-btn:hover { background: #A86828; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(200,130,58,0.35); }
        .c-add-btn:active { transform: translateY(0); }

        /* Realtime badge */
        .c-realtime {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 11px; border-radius: 999px;
          background: rgba(46,125,82,0.1); border: 1px solid rgba(46,125,82,0.2);
          font-size: 0.72rem; font-weight: 600; color: #2E7D52;
        }
        .c-realtime-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #2E7D52;
          animation: c-pulse 1.8s ease-in-out infinite;
        }

        /* ── Stats ── */
        .c-stats {
          display: flex; gap: 1rem; margin-bottom: 1.75rem;
          animation: c-fadeup 0.5s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .c-stat {
          flex: 1; background: white;
          border: 1.5px solid #EAD8C8;
          border-radius: 16px; padding: 1rem 1.25rem;
          display: flex; flex-direction: column; gap: 3px;
          box-shadow: 0 2px 8px rgba(150,80,40,0.06);
        }
        .c-stat-val { font-family: var(--font-serif), serif; font-size: 1.5rem; color: #2A1A0E; letter-spacing: -0.03em; line-height: 1.2; font-weight: 600; }
        .c-stat-label { font-size: 0.7rem; color: #B09080; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }

        /* ── Skeleton ── */
        .c-skeleton {
          background: linear-gradient(90deg, #F0E8DF 25%, #E8DDD4 50%, #F0E8DF 75%);
          background-size: 200% 100%; animation: c-shimmer 1.5s infinite; border-radius: 10px;
        }

        /* ── Section header ── */
        .c-section-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px; margin-top: 1.5rem;
        }
        .c-section-label {
          font-size: 0.7rem; font-weight: 700;
          color: #B09080; text-transform: uppercase; letter-spacing: 0.09em;
          display: flex; align-items: center; gap: 7px;
        }
        .c-section-count {
          padding: 2px 8px; border-radius: 999px; font-size: 0.65rem; font-weight: 700;
          background: #F0E4D8; color: #A07060;
        }
        .c-clear-btn {
          font-size: 0.73rem; font-weight: 600; color: #B09080;
          background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 7px;
          font-family: var(--font-body), 'Nunito', sans-serif;
          transition: color 0.18s, background 0.18s;
        }
        .c-clear-btn:hover { color: #C04040; background: rgba(192,64,64,0.08); }

        /* ── Item list ── */
        .c-list { display: flex; flex-direction: column; gap: 6px; }
        .c-item {
          background: white; border: 1.5px solid #EAD8C8;
          border-radius: 14px; padding: 0.85rem 1.1rem;
          display: flex; align-items: center; gap: 0.9rem;
          animation: c-card 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
          transition: background 0.18s, border-color 0.18s;
          box-shadow: 0 2px 6px rgba(150,80,40,0.05);
        }
        .c-item:hover { background: #FFFAF5; border-color: #D4B8A0; }
        .c-item.done { opacity: 0.6; }
        .c-item.done:hover { opacity: 0.75; }

        /* Checkbox */
        .c-check-wrap {
          width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
          border: 1.5px solid #D0B8A8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: border-color 0.18s, background 0.18s;
          background: white;
        }
        .c-check-wrap:hover { border-color: #C8823A; background: rgba(200,130,58,0.08); }
        .c-check-wrap.checked {
          background: #5A8869; border-color: #5A8869;
          animation: c-check 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .c-check-wrap.loading { opacity: 0.5; pointer-events: none; }

        /* Item body */
        .c-item-body { flex: 1; min-width: 0; }
        .c-item-nombre {
          font-size: 0.9rem; font-weight: 600; color: #2A1A0E;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          transition: color 0.18s;
        }
        .c-item-nombre.done { text-decoration: line-through; color: #B09080; }
        .c-item-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
        .c-item-qty {
          font-size: 0.72rem; font-weight: 700;
          color: #C8823A; background: rgba(200,130,58,0.1);
          padding: 1px 6px; border-radius: 5px; border: 1px solid rgba(200,130,58,0.2);
        }
        .c-item-who {
          font-size: 0.72rem; color: #A07060; font-weight: 400;
          display: flex; align-items: center; gap: 4px;
        }
        .c-item-who-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        /* Delete button */
        .c-del-btn {
          width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
          background: transparent; border: 1px solid transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #D0B8A8;
          transition: background 0.18s, border-color 0.18s, color 0.18s;
        }
        .c-del-btn:hover { background: rgba(192,64,64,0.08); border-color: rgba(192,64,64,0.2); color: #C04040; }
        .c-del-btn:disabled { opacity: 0.3; pointer-events: none; }

        /* ── Empty state ── */
        .c-empty { text-align: center; padding: 5rem 2rem; animation: c-fadeup 0.5s 0.2s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .c-empty-icon {
          width: 72px; height: 72px; margin: 0 auto 1.5rem; border-radius: 20px;
          background: rgba(200,130,58,0.1); border: 1.5px solid rgba(200,130,58,0.2);
          display: flex; align-items: center; justify-content: center; font-size: 2rem;
        }
        .c-empty-title { font-family: var(--font-serif), serif; font-size: 1.6rem; color: #2A1A0E; letter-spacing: -0.025em; margin-bottom: 0.5rem; font-weight: 600; }
        .c-empty-sub { font-size: 0.85rem; color: #A07060; font-weight: 400; line-height: 1.6; }

        /* ── Modal ── */
        .c-overlay {
          position: fixed; inset: 0; background: rgba(42,26,14,0.5);
          backdrop-filter: blur(6px); z-index: 100;
          display: flex; align-items: flex-end; justify-content: center;
          animation: c-overlay 0.2s ease both;
        }
        @media (min-width: 600px) { .c-overlay { align-items: center; } }

        .c-modal {
          background: #FFF8F2; border: 1.5px solid #EAD8C8;
          border-radius: 24px 24px 0 0; width: 100%; max-width: 480px;
          padding: 2rem; animation: c-modal 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
          max-height: 92vh; overflow-y: auto;
          box-shadow: 0 -8px 40px rgba(150,80,40,0.12);
        }
        @media (min-width: 600px) { .c-modal { border-radius: 20px; box-shadow: 0 20px 60px rgba(150,80,40,0.15); } }

        .c-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.75rem; }
        .c-modal-title { font-family: var(--font-serif), serif; font-size: 1.5rem; color: #2A1A0E; letter-spacing: -0.025em; font-weight: 600; }
        .c-modal-close {
          width: 32px; height: 32px; border-radius: 8px;
          background: #F0E8DF; border: 1px solid #E0C8B8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #A07060; transition: background 0.18s, color 0.18s;
        }
        .c-modal-close:hover { background: #E8D0C0; color: #2A1A0E; }

        .c-field { margin-bottom: 1rem; }
        .c-label { display: block; font-size: 0.68rem; font-weight: 700; color: #8A6050; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 6px; }
        .c-input {
          width: 100%; padding: 10px 13px;
          background: white; border: 1.5px solid #E0C8B8;
          border-radius: 10px; font-size: 0.88rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .c-input::placeholder { color: #C8B0A0; }
        .c-input:focus { border-color: #C8823A; box-shadow: 0 0 0 3px rgba(200,130,58,0.12); }

        .c-qty-row { display: flex; align-items: center; gap: 10px; }
        .c-qty-btn {
          width: 36px; height: 36px; border-radius: 9px; border: 1.5px solid #E0C8B8;
          background: white; color: #6B4030; font-size: 1.1rem; font-weight: 600;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background 0.18s, border-color 0.18s;
          font-family: var(--font-body), 'Nunito', sans-serif; flex-shrink: 0;
        }
        .c-qty-btn:hover { background: #FFF5EE; border-color: #C8823A; }
        .c-qty-val {
          font-size: 1.1rem; font-weight: 700;
          color: #2A1A0E; min-width: 36px; text-align: center;
        }

        .c-error {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 13px; background: #FFF0EC;
          border: 1px solid #F0C0B0; border-radius: 9px;
          color: #B03A1A; font-size: 0.81rem; margin-bottom: 1rem;
        }
        .c-submit {
          width: 100%; padding: 13px; background: #C8823A; color: white; border: none;
          border-radius: 13px; font-size: 0.9rem; font-weight: 700;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 0.5rem;
        }
        .c-submit:hover:not(:disabled) { background: #A86828; transform: translateY(-1.5px); box-shadow: 0 10px 28px rgba(200,130,58,0.35); }
        .c-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .c-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; animation: c-spin 0.7s linear infinite; flex-shrink: 0; }

        @media (max-width: 640px) {
          .c-wrap { padding: 0 1rem 5rem; }
          .c-header { padding: 1.25rem 0 1.5rem; }
          .c-header-title { font-size: 1.15rem; }
          .c-header-right { gap: 7px; }
          .c-realtime { display: none; }
          .c-add-text { display: none; }
          .c-add-btn { padding: 9px; border-radius: 10px; }
          .c-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; overflow: visible; }
          .c-stat:last-child { grid-column: 1 / 3; }
          .c-stat { padding: 0.8rem 1rem; }
          .c-stat-val { font-size: 1.2rem; }
          .c-item { padding: 0.75rem 0.9rem; gap: 0.75rem; }
          .c-item-nombre { font-size: 0.87rem; }
          .c-modal { padding: 1.5rem 1.25rem; }
          .c-modal-title { font-size: 1.25rem; }
        }
        @media (max-width: 420px) {
          .c-wrap { padding: 0 0.75rem 5rem; }
          .c-stat { padding: 0.7rem 0.85rem; }
          .c-stat-val { font-size: 1.05rem; }
        }
      `}</style>

      <div className="c-root">
        <div className="c-bg" />

        <div className="c-wrap">

          {/* ── HEADER ── */}
          <div className="c-header">
            <div className="c-header-left">
              <button className="c-back" onClick={() => router.push(`/sala/${codigo}`)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div>
                <div className="c-header-title">Compras</div>
                <div className="c-header-sub">{session.salaNombre}</div>
              </div>
            </div>
            <div className="c-header-right">
              {realtimeOk && (
                <div className="c-realtime">
                  <span className="c-realtime-dot" />
                  En vivo
                </div>
              )}
              <div className="c-avatar" style={{ background: session.miembroColor }}>
                {session.miembroNombre[0].toUpperCase()}
              </div>
              <button className="c-add-btn" onClick={() => { setForm(FORM_INIT); setFormError(''); setModalOpen(true) }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span className="c-add-text">Añadir ítem</span>
              </button>
            </div>
          </div>

          {/* ── STATS ── */}
          {!loading && (
            <div className="c-stats">
              <div className="c-stat">
                <div className="c-stat-val" style={{ color: pendientes.length > 0 ? '#C8823A' : '#2A1A0E' }}>
                  {pendientes.length}
                </div>
                <div className="c-stat-label">Pendientes</div>
              </div>
              <div className="c-stat">
                <div className="c-stat-val" style={{ color: completados.length > 0 ? '#5A8869' : '#2A1A0E' }}>
                  {completados.length}
                </div>
                <div className="c-stat-label">Completados</div>
              </div>
              <div className="c-stat">
                {lider ? (
                  <>
                    <div className="c-stat-val" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: lider.m.color, display: 'inline-block', flexShrink: 0 }} />
                      {lider.m.nombre}
                    </div>
                    <div className="c-stat-label">Más activo ({lider.count})</div>
                  </>
                ) : (
                  <>
                    <div className="c-stat-val">—</div>
                    <div className="c-stat-label">Más activo</div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── LOADING SKELETONS ── */}
          {loading && (
            <>
              <div className="c-stats">
                {[1, 2, 3].map(i => (
                  <div key={i} className="c-stat">
                    <div className="c-skeleton" style={{ height: 28, width: '60%', marginBottom: 8 }} />
                    <div className="c-skeleton" style={{ height: 10, width: '50%' }} />
                  </div>
                ))}
              </div>
              <div className="c-list" style={{ marginTop: '1.5rem' }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ borderRadius: 14, padding: '0.85rem 1.1rem', border: '1.5px solid #EAD8C8', background: 'white', display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
                    <div className="c-skeleton" style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="c-skeleton" style={{ height: 14, width: '45%', marginBottom: 7 }} />
                      <div className="c-skeleton" style={{ height: 10, width: '25%' }} />
                    </div>
                    <div className="c-skeleton" style={{ width: 28, height: 28, borderRadius: 8 }} />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── EMPTY STATE ── */}
          {!loading && items.length === 0 && (
            <div className="c-empty">
              <div className="c-empty-icon">🛒</div>
              <div className="c-empty-title">Lista vacía</div>
              <p className="c-empty-sub">Añadí el primer producto con el botón de arriba.<br />La lista se actualiza en tiempo real para todos.</p>
            </div>
          )}

          <div className="c-desktop-cols">
          {/* ── PENDIENTES ── */}
          {!loading && pendientes.length > 0 && (
            <>
              <div className="c-section-header">
                <div className="c-section-label">
                  Pendiente
                  <span className="c-section-count">{pendientes.length}</span>
                </div>
              </div>
              <div className="c-list">
                {pendientes.slice(0, pendientesPag).map((item, idx) => {
                  const quien = getMiembro(item.añadido_por)
                  return (
                    <div key={item.id} className="c-item" style={{ animationDelay: `${idx * 0.04}s` }}>
                      <div
                        className={`c-check-wrap${toggling === item.id ? ' loading' : ''}`}
                        onClick={() => handleToggle(item)}
                        title="Marcar como completado"
                      >
                        {toggling === item.id && (
                          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #D0B8A8', borderTopColor: '#5A8869', animation: 'c-spin 0.7s linear infinite' }} />
                        )}
                      </div>
                      <div className="c-item-body">
                        <div className="c-item-nombre">{item.nombre}</div>
                        <div className="c-item-meta">
                          {item.cantidad > 1 && (
                            <span className="c-item-qty">×{item.cantidad}</span>
                          )}
                          {quien && (
                            <span className="c-item-who">
                              <span className="c-item-who-dot" style={{ background: quien.color }} />
                              {quien.nombre}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="c-del-btn"
                        onClick={() => handleEliminar(item.id)}
                        disabled={borrando === item.id}
                        title="Eliminar"
                      >
                        {borrando === item.id ? (
                          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #D0B8A8', borderTopColor: '#C04040', animation: 'c-spin 0.7s linear infinite' }} />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
              {pendientes.length > pendientesPag && (
                <button
                  onClick={() => setPendientesPag(p => p + 25)}
                  style={{
                    display: 'block', width: '100%', marginTop: 8,
                    padding: '9px', borderRadius: 12,
                    background: 'white', border: '1.5px dashed #D4B8A0',
                    color: '#A07060', fontSize: '0.79rem', fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'var(--font-body), Nunito, sans-serif',
                  }}
                >
                  Ver más ({pendientes.length - pendientesPag} pendientes)
                </button>
              )}
            </>
          )}

          {/* ── COMPLETADOS ── */}
          {!loading && completados.length > 0 && (
            <>
              <div className="c-section-header" style={{ marginTop: pendientes.length > 0 ? '1.5rem' : '1rem' }}>
                <div className="c-section-label">
                  Completado
                  <span className="c-section-count">{completados.length}</span>
                </div>
                <button className="c-clear-btn" onClick={handleLimpiarCompletados}>
                  Limpiar todo
                </button>
              </div>
              <div className="c-list">
                {completados.slice(0, completadosPag).map((item, idx) => {
                  const quien = getMiembro(item.añadido_por)
                  return (
                    <div key={item.id} className="c-item done" style={{ animationDelay: `${idx * 0.04}s` }}>
                      <div
                        className="c-check-wrap checked"
                        onClick={() => handleToggle(item)}
                        title="Marcar como pendiente"
                      >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="c-item-body">
                        <div className="c-item-nombre done">{item.nombre}</div>
                        <div className="c-item-meta">
                          {item.cantidad > 1 && (
                            <span className="c-item-qty" style={{ opacity: 0.5 }}>×{item.cantidad}</span>
                          )}
                          {quien && (
                            <span className="c-item-who">
                              <span className="c-item-who-dot" style={{ background: quien.color }} />
                              {quien.nombre}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="c-del-btn"
                        onClick={() => handleEliminar(item.id)}
                        disabled={borrando === item.id}
                        title="Eliminar"
                      >
                        {borrando === item.id ? (
                          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #D0B8A8', borderTopColor: '#C04040', animation: 'c-spin 0.7s linear infinite' }} />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
              {completados.length > completadosPag && (
                <button
                  onClick={() => setCompletadosPag(p => p + 10)}
                  style={{
                    display: 'block', width: '100%', marginTop: 8,
                    padding: '9px', borderRadius: 12,
                    background: 'white', border: '1.5px dashed #D4B8A0',
                    color: '#A07060', fontSize: '0.79rem', fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'var(--font-body), Nunito, sans-serif',
                  }}
                >
                  Ver más ({completados.length - completadosPag} completados)
                </button>
              )}
            </>
          )}
          </div>{/* end c-desktop-cols */}

        </div>
      </div>

      {/* ── MODAL: AÑADIR ÍTEM ── */}
      {modalOpen && (
        <div className="c-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="c-modal">
            <div className="c-modal-header">
              <div className="c-modal-title">Añadir ítem</div>
              <button className="c-modal-close" onClick={() => setModalOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAñadir}>
              <div className="c-field">
                <label className="c-label">Producto *</label>
                <input
                  className="c-input"
                  type="text"
                  placeholder="Ej: Leche, Papel higiénico..."
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  autoFocus
                  required
                />
              </div>

              <div className="c-field">
                <label className="c-label">Cantidad</label>
                <div className="c-qty-row">
                  <button
                    type="button"
                    className="c-qty-btn"
                    onClick={() => setForm(f => ({ ...f, cantidad: Math.max(1, f.cantidad - 1) }))}
                  >
                    −
                  </button>
                  <div className="c-qty-val">{form.cantidad}</div>
                  <button
                    type="button"
                    className="c-qty-btn"
                    onClick={() => setForm(f => ({ ...f, cantidad: f.cantidad + 1 }))}
                  >
                    +
                  </button>
                </div>
              </div>

              {formError && (
                <div className="c-error">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6.5 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="6.5" cy="9" r="0.6" fill="currentColor" />
                  </svg>
                  {formError}
                </div>
              )}

              <button type="submit" className="c-submit" disabled={guardando}>
                {guardando && <span className="c-spinner" />}
                {guardando ? 'Añadiendo...' : 'Añadir a la lista'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDialog}
        title={confirmDialog?.title}
        message={confirmDialog?.message ?? ''}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  )
}
