'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import type { Miembro, Gasto, ItemCompra, Tarea, Piso, Pago } from '@/lib/types'
import MemberAvatar from '@/components/MemberAvatar'
import { calcularBadges, ALL_BADGE_DEFS, type Badge } from '@/lib/badges'

const nunito = Nunito({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-nunito' })

export default function MiembroPerfilPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string
  const miembroId = params.miembroId as string
  const supabase = createClient()

  const [session] = useState(getSession())
  const [miembro, setMiembro] = useState<Miembro | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) { router.push(`/sala/${codigo}`); return }

    async function loadData() {
      const { data: m } = await supabase
        .from('miembros')
        .select('*')
        .eq('id', miembroId)
        .eq('sala_id', session!.salaId)
        .single() as { data: Miembro | null }

      if (!m) { setLoading(false); return }
      setMiembro(m)

      const [
        { data: miembros }, { data: gastos }, { data: items },
        { data: tareas }, { data: pisos }, { data: pagos },
      ] = await Promise.all([
        supabase.from('miembros').select('*').eq('sala_id', session!.salaId),
        supabase.from('gastos').select('*').eq('sala_id', session!.salaId),
        supabase.from('items_compra').select('*').eq('sala_id', session!.salaId),
        supabase.from('tareas').select('*').eq('sala_id', session!.salaId),
        supabase.from('pisos').select('*').eq('sala_id', session!.salaId),
        supabase.from('pagos').select('*').eq('sala_id', session!.salaId),
      ])

      const allMiembros = (miembros ?? []) as Miembro[]
      const allGastos = (gastos ?? []) as Gasto[]
      const allPagos = (pagos ?? []) as Pago[]

      const net: Record<string, number> = {}
      allMiembros.forEach(mb => { net[mb.id] = 0 })
      allGastos.forEach(g => {
        if (g.tipo === 'fijo' || !g.pagado_por) return
        if (!g.splits) {
          const participantes = allMiembros.filter(mb => mb.creado_en <= g.creado_en)
          const share = g.importe / (participantes.length || 1)
          net[g.pagado_por] = (net[g.pagado_por] ?? 0) + g.importe - share
          participantes.forEach(mb => {
            if (mb.id !== g.pagado_por) net[mb.id] = (net[mb.id] ?? 0) - share
          })
        } else {
          const splits = g.splits as Record<string, number>
          allMiembros.forEach(mb => {
            if (mb.id === g.pagado_por) return
            const owes = splits[mb.id] ?? 0
            if (owes <= 0) return
            net[mb.id] = (net[mb.id] ?? 0) - owes
            net[g.pagado_por!] = (net[g.pagado_por!] ?? 0) + owes
          })
        }
      })
      allPagos.forEach(p => {
        net[p.de_id] = (net[p.de_id] ?? 0) + p.importe
        net[p.a_id] = (net[p.a_id] ?? 0) - p.importe
      })

      const deudores = allMiembros.filter(mb => net[mb.id] < -0.5).map(mb => mb.id)
      const badgeMap = calcularBadges({
        miembros: allMiembros, gastos: allGastos,
        items: (items ?? []) as ItemCompra[],
        tareas: (tareas ?? []) as Tarea[],
        pisos: (pisos ?? []) as Piso[], deudores,
      })

      setBadges(badgeMap.get(miembroId) ?? [])
      setLoading(false)
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function formatCumpleanos(fecha: string): string {
    const [, mes, dia] = fecha.split('-')
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    return `${parseInt(dia)} de ${meses[parseInt(mes) - 1]}`
  }

  if (!session) return null

  if (loading || !miembro) {
    return (
      <div className={nunito.variable}>
        <style>{styles}</style>
        <div className="mp-loading">
          <div className="mp-spinner" />
          <p>{loading ? 'Cargando perfil...' : 'Miembro no encontrado.'}</p>
          <button className="mp-back-btn" onClick={() => router.push(`/sala/${codigo}`)}>
            Volver al Nido
          </button>
        </div>
      </div>
    )
  }

  const badgeIds = new Set(badges.map(b => b.id))
  const pinnedBadge = miembro.badge_destacado ? badges.find(b => b.id === miembro.badge_destacado) : null

  return (
    <div className={nunito.variable}>
      <style>{styles}</style>

      <div className="mp-page">
        {/* Header */}
        <header className="mp-header">
          <button className="mp-back" onClick={() => router.push(`/sala/${codigo}`)} aria-label="Volver">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11.5 3.5l-5 5.5 5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="mp-page-title">Perfil</h1>
          <div style={{ width: 36 }} />
        </header>

        {/* Hero */}
        <section className="mp-hero">
          <div className="mp-hero-bg" style={{
            background: `linear-gradient(135deg, ${miembro.color}25, ${miembro.color}08)`,
          }} />

          <div className="mp-avatar-ring" style={{ background: miembro.color }}>
            {miembro.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={miembro.foto_url} alt={miembro.nombre} className="mp-avatar-img" />
            ) : (
              <MemberAvatar
                nombre={miembro.nombre}
                color={miembro.color}
                icono={miembro.icono}
                size="lg"
                style={{ width: 88, height: 88 }}
              />
            )}
          </div>

          <div className="mp-name-row">
            <span className="mp-name">{miembro.nombre}</span>
            {pinnedBadge && (
              <span className="mp-pinned-badge" title={pinnedBadge.nombre}>{pinnedBadge.icono}</span>
            )}
          </div>

          {miembro.rol_casa && <span className="mp-rol-tag">{miembro.rol_casa}</span>}
          {miembro.estado && <span className="mp-estado">{miembro.estado}</span>}
        </section>

        {/* Info */}
        <div className="mp-info-grid">
          {miembro.cumpleanos && (
            <div className="mp-info-item">
              <span className="mp-info-icon">🎂</span>
              <div className="mp-info-text">
                <span className="mp-info-label">Cumpleaños</span>
                <span className="mp-info-value">{formatCumpleanos(miembro.cumpleanos)}</span>
              </div>
            </div>
          )}
          {miembro.metodo_pago && (
            <div className="mp-info-item">
              <span className="mp-info-icon">💳</span>
              <div className="mp-info-text">
                <span className="mp-info-label">Método de pago</span>
                <span className="mp-info-value">{miembro.metodo_pago}</span>
              </div>
            </div>
          )}
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <section className="mp-card">
            <h2 className="mp-card-title">
              <span className="mp-card-icon">🏆</span>
              Badges
            </h2>
            <div className="mp-badges">
              {ALL_BADGE_DEFS.filter(def => badgeIds.has(def.id)).map(def => (
                <div key={def.id} className={`mp-badge${miembro.badge_destacado === def.id ? ' pinned' : ''}`}>
                  <span className="mp-badge-emoji">{def.icono}</span>
                  <div className="mp-badge-info">
                    <span className="mp-badge-name">{def.nombre}</span>
                    <span className="mp-badge-desc">{def.descripcion}</span>
                  </div>
                  {miembro.badge_destacado === def.id && (
                    <span className="mp-badge-pin-indicator" title="Badge destacado">📌</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

const styles = `
  @keyframes mp-up {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes mp-spin { to { transform: rotate(360deg); } }

  .mp-page {
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    background: #FFFCF8;
    min-height: 100dvh;
    max-width: 600px;
    margin: 0 auto;
    padding: 0 16px 48px;
  }

  .mp-loading {
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 100dvh; gap: 16px;
    color: #7A5540; font-size: 0.95rem;
  }
  .mp-spinner {
    width: 28px; height: 28px; border: 3px solid #EAD8C8;
    border-top-color: #C05A3B; border-radius: 50%;
    animation: mp-spin 0.7s linear infinite;
  }
  .mp-back-btn {
    padding: 10px 20px; background: #C05A3B; color: white; border: none;
    border-radius: 12px; font-size: 0.88rem; font-weight: 600;
    font-family: var(--font-nunito), 'Nunito', sans-serif; cursor: pointer;
  }

  .mp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 0 12px;
    animation: mp-up 0.35s ease-out both;
  }
  .mp-back {
    width: 36px; height: 36px; border-radius: 10px;
    background: rgba(192,90,59,0.08); border: none;
    display: flex; align-items: center; justify-content: center;
    color: #7A5540; cursor: pointer; transition: background 0.15s;
  }
  .mp-back:hover { background: rgba(192,90,59,0.14); }
  .mp-page-title {
    font-size: 1rem; font-weight: 700; color: #2A1A0E; letter-spacing: -0.01em;
  }

  .mp-hero {
    position: relative; text-align: center;
    padding: 28px 16px 24px; margin-bottom: 20px;
    border-radius: 20px; overflow: hidden;
    background: white; border: 1.5px solid #EAD8C8;
    box-shadow: 0 2px 12px rgba(150,80,40,0.06);
    animation: mp-up 0.4s 0.05s ease-out both;
  }
  .mp-hero-bg {
    position: absolute; inset: 0; pointer-events: none;
  }
  .mp-avatar-ring {
    width: 96px; height: 96px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 14px; position: relative;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    padding: 3px;
  }
  .mp-avatar-img {
    width: 88px; height: 88px; border-radius: 50%;
    object-fit: cover; display: block;
  }
  .mp-name-row {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; margin-bottom: 8px;
  }
  .mp-name {
    font-size: 1.35rem; font-weight: 800; color: #2A1A0E; letter-spacing: -0.02em;
  }
  .mp-pinned-badge { font-size: 1.2rem; }
  .mp-rol-tag {
    display: inline-block; font-size: 0.75rem; font-weight: 600;
    color: #7A5540; background: rgba(192,90,59,0.09);
    border: 1px solid rgba(192,90,59,0.18); border-radius: 20px;
    padding: 3px 12px; margin-bottom: 6px;
  }
  .mp-estado {
    display: block; font-size: 0.78rem; color: #8A6050;
    background: rgba(192,90,59,0.06); border-radius: 12px;
    padding: 4px 12px; margin: 6px auto 0;
    width: fit-content;
  }

  .mp-info-grid {
    display: flex; flex-direction: column; gap: 10px;
    margin-bottom: 20px;
    animation: mp-up 0.4s 0.1s ease-out both;
  }
  .mp-info-item {
    display: flex; align-items: center; gap: 14px;
    background: white; border: 1.5px solid #EAD8C8;
    border-radius: 14px; padding: 14px 16px;
    box-shadow: 0 2px 8px rgba(150,80,40,0.05);
  }
  .mp-info-icon { font-size: 1.3rem; flex-shrink: 0; }
  .mp-info-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .mp-info-label { font-size: 0.68rem; font-weight: 700; color: #B09080; text-transform: uppercase; letter-spacing: 0.06em; }
  .mp-info-value { font-size: 0.9rem; font-weight: 600; color: #2A1A0E; }

  .mp-card {
    background: white; border: 1.5px solid #EAD8C8; border-radius: 20px;
    padding: 18px 16px; margin-bottom: 16px;
    box-shadow: 0 2px 12px rgba(150,80,40,0.06);
    animation: mp-up 0.4s 0.15s ease-out both;
  }
  .mp-card-title {
    font-size: 0.85rem; font-weight: 700; color: #7A5540;
    display: flex; align-items: center; gap: 7px;
    margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .mp-card-icon { font-size: 1rem; }

  .mp-badges { display: flex; flex-direction: column; gap: 10px; }
  .mp-badge {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: 12px;
    background: rgba(192,90,59,0.05); border: 1.5px solid rgba(192,90,59,0.1);
    transition: background 0.15s;
  }
  .mp-badge.pinned {
    background: rgba(192,90,59,0.1); border-color: rgba(192,90,59,0.25);
  }
  .mp-badge-emoji { font-size: 1.5rem; flex-shrink: 0; }
  .mp-badge-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .mp-badge-name { font-size: 0.84rem; font-weight: 700; color: #2A1A0E; }
  .mp-badge-desc { font-size: 0.72rem; color: #A07060; }
  .mp-badge-pin-indicator { font-size: 0.85rem; flex-shrink: 0; opacity: 0.7; }
`
