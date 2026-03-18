'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito, DM_Mono } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import type { Gasto, Miembro, Pago } from '@/lib/types'
import { calcularBalance, desglosarDeuda, EPS } from '@/lib/balance'
import type { Debt } from '@/lib/balance'
import { notificarSala } from '@/lib/push'
import { useNotif } from '@/lib/notif-context'

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
const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-code',
})

type Categoria = Gasto['categoria']

const CATEGORIA_META: Record<Categoria, { label: string; icon: string; color: string; bg: string; border: string }> = {
  alquiler:    { label: 'Alquiler',    icon: '🏠', color: '#2E7D52', bg: 'rgba(46,125,82,0.1)',   border: 'rgba(46,125,82,0.25)'   },
  suministros: { label: 'Suministros', icon: '💡', color: '#1E6BA8', bg: 'rgba(30,107,168,0.1)',  border: 'rgba(30,107,168,0.25)'  },
  internet:    { label: 'Internet',    icon: '📶', color: '#7C3D9E', bg: 'rgba(124,61,158,0.1)',  border: 'rgba(124,61,158,0.25)'  },
  comida:      { label: 'Comida',      icon: '🛒', color: '#B06820', bg: 'rgba(176,104,32,0.1)',  border: 'rgba(176,104,32,0.25)'  },
  limpieza:    { label: 'Limpieza',    icon: '🧹', color: '#1E7D8A', bg: 'rgba(30,125,138,0.1)',  border: 'rgba(30,125,138,0.25)'  },
  otro:        { label: 'Otro',        icon: '📦', color: '#7A6858', bg: 'rgba(122,104,88,0.1)',  border: 'rgba(122,104,88,0.25)'  },
}

function fmtUYU(n: number) {
  return `$ ${n.toLocaleString('es-UY')}`
}

function isPersonal(g: Gasto): boolean {
  if (!g.splits) return false
  const nonZero = Object.values(g.splits as Record<string, number>).filter(v => v > 0)
  return nonZero.length === 1
}

function personalOwner(g: Gasto): string | null {
  if (!isPersonal(g)) return null
  const entry = Object.entries(g.splits as Record<string, number>).find(([, v]) => v > 0)
  return entry ? entry[0] : null
}

function fmtFecha(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })
}

// calcularBalance, desglosarDeuda, EPS, Debt importados desde @/lib/balance

const FORM_INIT = {
  descripcion: '',
  importe: '',
  tipo: 'fijo' as 'fijo' | 'variable',
  categoria: 'otro' as Categoria,
  fecha: new Date().toISOString().slice(0, 10),
  pagadoPor: null as string | null,
}

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_ES  = ['L','M','X','J','V','S','D']

function CalendarioPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const todayStr = new Date().toISOString().slice(0, 10)

  const parseV = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return { y, m, d }
  }

  const init = value ? parseV(value) : parseV(todayStr)
  const [viewY, setViewY] = useState(init.y)
  const [viewM, setViewM] = useState(init.m)

  const prevM = () => { if (viewM === 1) { setViewM(12); setViewY(y => y - 1) } else setViewM(m => m - 1) }
  const nextM = () => { if (viewM === 12) { setViewM(1); setViewY(y => y + 1) } else setViewM(m => m + 1) }

  const firstDow = (new Date(viewY, viewM - 1, 1).getDay() + 6) % 7 // Mon=0
  const daysInM  = new Date(viewY, viewM, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInM; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function pick(day: number) {
    const iso = `${viewY}-${String(viewM).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(iso)
    setOpen(false)
  }

  function fmtDisplay(iso: string) {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'long' })
  }

  const navBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8,
    background: '#F0E8DF', border: '1px solid #E0C8B8',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#6B4030',
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (open) { setOpen(false); return }
          if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            const calH = 300
            const top = (window.innerHeight - rect.bottom) >= calH ? rect.bottom + 6 : rect.top - calH - 6
            setDropPos({ top, left: rect.left, width: rect.width })
          }
          setOpen(true)
        }}
        style={{
          width: '100%', padding: '10px 13px',
          background: 'white', border: `1.5px solid ${open ? '#C05A3B' : '#E0C8B8'}`,
          borderRadius: 10, fontSize: '0.88rem',
          fontFamily: 'var(--font-body), Nunito, sans-serif',
          color: value ? '#2A1A0E' : '#C8B0A0', outline: 'none',
          cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: open ? '0 0 0 3px rgba(192,90,59,0.12)' : 'none',
          transition: 'border-color 0.18s, box-shadow 0.18s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: '#C05A3B' }}>
          <rect x="1" y="2.5" width="12" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M1 6h12" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M4 1v3M10 1v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        {value ? fmtDisplay(value) : 'Seleccionar fecha'}
      </button>

      {open && dropPos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width,
            zIndex: 201, background: '#FFF8F2', border: '1.5px solid #EAD8C8',
            borderRadius: 16, padding: '0.9rem',
            boxShadow: '0 8px 32px rgba(150,80,40,0.18)',
          }}>
            {/* Nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button type="button" onClick={prevM} style={navBtn}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8 10L4 6.5 8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <span style={{ fontFamily: 'var(--font-serif), serif', fontSize: '0.92rem', fontWeight: 600, color: '#2A1A0E', letterSpacing: '-0.01em' }}>
                {MESES_ES[viewM - 1]} {viewY}
              </span>
              <button type="button" onClick={nextM} style={navBtn}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 3l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>

            {/* Day names */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {DIAS_ES.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '0.62rem', fontWeight: 700, color: '#B09080', padding: '3px 0' }}>{d}</div>
              ))}
            </div>

            {/* Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} />
                const iso = `${viewY}-${String(viewM).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const isSel   = iso === value
                const isToday = iso === todayStr
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(day)}
                    style={{
                      width: '100%', aspectRatio: '1',
                      borderRadius: 7,
                      border: isToday && !isSel ? '1.5px solid rgba(192,90,59,0.5)' : '1.5px solid transparent',
                      background: isSel ? '#C05A3B' : 'transparent',
                      color: isSel ? 'white' : isToday ? '#C05A3B' : '#2A1A0E',
                      fontSize: '0.78rem', fontWeight: isSel || isToday ? 700 : 400,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-body), Nunito, sans-serif',
                      transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'rgba(192,90,59,0.1)' }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Hoy shortcut */}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #EAD8C8', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => { onChange(todayStr); setOpen(false) }}
                style={{
                  fontSize: '0.73rem', fontWeight: 600, color: '#C05A3B',
                  background: 'rgba(192,90,59,0.08)', border: '1px solid rgba(192,90,59,0.2)',
                  padding: '4px 14px', borderRadius: 7, cursor: 'pointer',
                  fontFamily: 'var(--font-body), Nunito, sans-serif',
                }}
              >
                Hoy
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function GastosPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [session] = useState(getSession)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const miembrosRef = useRef<Miembro[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'gastos' | 'balance' | 'historial'>('gastos')
  const [modalOpen, setModalOpen] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [formError, setFormError] = useState('')
  const [realtimeOk, setRealtimeOk] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [liquidando, setLiquidando] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [autoSplit, setAutoSplit] = useState(true)
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({})
  const [fijosPag, setFijosPag] = useState(8)
  const [variablesPag, setVariablesPag] = useState(10)
  const [modalLiquidar, setModalLiquidar] = useState<{ debt: Debt; importe: string; nota: string } | null>(null)
  const [liquidandoOk, setLiquidandoOk] = useState<string | null>(null)
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null)
  const [editandoMonto, setEditandoMonto] = useState(false)
  const [notaAbierta, setNotaAbierta] = useState(false)
  const [planSala, setPlanSala] = useState<'free' | 'pro'>('free')
  const [historialLimitado, setHistorialLimitado] = useState(false)

  const { addNotif } = useNotif()

  const cargarDatos = useCallback(async () => {
    if (!session) return
    const supabase = createClient()
    setLoading(true)

    // Obtener el plan del nido para aplicar filtros de historial
    let plan: 'free' | 'pro' = 'free'
    try {
      const planRes = await fetch(`/api/billing/plan?salaId=${session.salaId}`)
      if (planRes.ok) {
        const planData = await planRes.json()
        plan = planData.plan ?? 'free'
        setPlanSala(plan)
      }
    } catch { /* si falla, asumimos free */ }

    // En plan Free: solo últimos 3 meses de historial
    let gastosQuery = supabase.from('gastos').select().eq('sala_id', session.salaId).order('fecha', { ascending: false })
    if (plan === 'free') {
      const hace3Meses = new Date()
      hace3Meses.setMonth(hace3Meses.getMonth() - 3)
      gastosQuery = gastosQuery.gte('fecha', hace3Meses.toISOString().slice(0, 10))
    }

    const [{ data: gastosData }, { data: miembrosData }, { data: pagosData }] = await Promise.all([
      gastosQuery,
      supabase.from('miembros').select().eq('sala_id', session.salaId),
      supabase.from('pagos').select().eq('sala_id', session.salaId).order('creado_en', { ascending: false }),
    ])
    if (gastosData) {
      setGastos(gastosData as Gasto[])
      // Si es Free y hay gastos, indicar que el historial puede estar truncado
      setHistorialLimitado(plan === 'free')
    }
    if (miembrosData) { setMiembros(miembrosData as Miembro[]); miembrosRef.current = miembrosData as Miembro[] }
    if (pagosData) setPagos(pagosData as Pago[])
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
    if (modalOpen || !!modalLiquidar) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [modalOpen, modalLiquidar])

  useEffect(() => {
    if (!session) return
    const supabase = createClient()
    let gastosOk = false
    let pagosOk  = false
    const updateStatus = () => setRealtimeOk(gastosOk && pagosOk)

    const chGastos = supabase
      .channel(`gastos_${session.salaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gastos', filter: `sala_id=eq.${session.salaId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setGastos(prev => [payload.new as Gasto, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setGastos(prev => prev.map(g => g.id === payload.new.id ? payload.new as Gasto : g))
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<Gasto>
            setGastos(prev => prev.filter(g => g.id !== old.id))
          }
        }
      )
      .subscribe(status => { gastosOk = status === 'SUBSCRIBED'; updateStatus() })

    const chPagos = supabase
      .channel(`pagos_${session.salaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos', filter: `sala_id=eq.${session.salaId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPagos(prev => [payload.new as Pago, ...prev])
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<Pago>
            setPagos(prev => prev.filter(p => p.id !== old.id))
          }
        }
      )
      .subscribe(status => { pagosOk = status === 'SUBSCRIBED'; updateStatus() })

    return () => {
      supabase.removeChannel(chGastos)
      supabase.removeChannel(chPagos)
    }
  }, [session])

  const miId = session?.miembroId ?? ''

  // Gastos que el usuario actual puede ver: todos los compartidos + los propios personales
  const gastosVisibles = useMemo(
    () => gastos.filter(g => !isPersonal(g) || personalOwner(g) === miId),
    [gastos, miId]
  )

  // Gastos compartidos (sin personales) para balance — los personales no crean deudas entre personas
  const gastosCompartidos = useMemo(
    () => gastos.filter(g => !isPersonal(g)),
    [gastos]
  )

  const stats = useMemo(() => {
    const now = new Date()
    const mes = gastosVisibles.filter(g => {
      const d = new Date(g.fecha)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    const totalMes = mes.reduce((s, g) => s + g.importe, 0)
    const miParte = mes.reduce((s, g) => {
      const parte = g.splits?.[miId] !== undefined ? g.splits[miId] : g.importe / (miembros.length || 1)
      return s + parte
    }, 0)
    return { totalMes, miParte }
  }, [gastosVisibles, miId, miembros])

  const { debts, net: balanceNet } = useMemo(
    () => calcularBalance(gastosCompartidos, miembros, pagos),
    [gastosCompartidos, miembros, pagos],
  )

  function abrirModal() {
    setForm({ ...FORM_INIT, fecha: new Date().toISOString().slice(0, 10), pagadoPor: session?.miembroId ?? null })
    setFormError('')
    setAutoSplit(true)
    setCustomSplits({})
    setEditandoId(null)
    setModalOpen(true)
  }

  function abrirEditar(g: Gasto) {
    setForm({
      descripcion: g.descripcion,
      importe: g.importe.toString(),
      tipo: g.tipo,
      categoria: g.categoria,
      fecha: g.fecha,
      pagadoPor: g.pagado_por,
    })
    const hasSplits = g.splits && Object.keys(g.splits).length > 0
    setAutoSplit(!hasSplits)
    setCustomSplits(
      hasSplits
        ? Object.fromEntries(Object.entries(g.splits as Record<string, number>).map(([k, v]) => [k, v.toString()]))
        : {}
    )
    setEditandoId(g.id)
    setFormError('')
    setModalOpen(true)
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.descripcion.trim()) { setFormError('La descripción es obligatoria'); return }
    const importe = parseFloat(form.importe)
    if (!importe || importe <= 0) { setFormError('El importe debe ser mayor a 0'); return }

    let splits: Record<string, number> | null = null
    let importeFinal = importe

    if (autoSplit) {
      splits = null
    } else {
      splits = Object.fromEntries(miembros.map(m => [m.id, parseFloat(customSplits[m.id] ?? '0') || 0]))
      const sumaSplits = Object.values(splits).reduce((s, v) => s + v, 0)
      if (sumaSplits <= 0) { setFormError('Ingresá al menos el monto de una persona'); return }
      if (importe > 0 && Math.abs(sumaSplits - importe) > 0.5) {
        setFormError(`Las partes suman ${fmtUYU(Math.round(sumaSplits))} pero el total es ${fmtUYU(importe)}`)
        return
      }
      importeFinal = importe > 0 ? importe : sumaSplits
    }

    setGuardando(true)
    const supabase = createClient()

    const payload = {
      descripcion: form.descripcion.trim(),
      importe: importeFinal,
      categoria: form.categoria,
      tipo: form.tipo,
      fecha: form.fecha,
      splits,
      pagado_por: form.tipo === 'variable' ? (form.pagadoPor ?? null) : null,
    }

    if (editandoId) {
      const { error } = await supabase.from('gastos').update(payload).eq('id', editandoId)
      if (error) { setFormError('Error al actualizar el gasto'); setGuardando(false); return }
    } else {
      const { error } = await supabase.from('gastos').insert({ sala_id: session!.salaId, ...payload })
      if (error) { setFormError('Error al guardar el gasto'); setGuardando(false); return }
      // Notificar a los demás miembros
      const quien = miembros.find(m => m.id === session!.miembroId)?.nombre ?? 'Alguien'
      notificarSala({
        salaId: session!.salaId,
        excluirMiembroId: session!.miembroId,
        titulo: '💸 Nuevo gasto',
        cuerpo: `${quien} agregó: ${payload.descripcion} (${fmtUYU(importeFinal)})`,
        url: `/sala/${session!.salaCodigo}/gastos`,
      })
    }

    setModalOpen(false)
    setGuardando(false)
    setEditandoId(null)
    cargarDatos()
  }

  async function handleLiquidar() {
    if (!modalLiquidar) return
    const { debt: d, importe, nota } = modalLiquidar
    const importeNum = parseFloat(importe)
    if (!importeNum || importeNum <= 0) return
    const key = `${d.from}-${d.to}`
    setLiquidando(key)
    const { error } = await createClient()
      .from('pagos')
      .insert({
        sala_id: session!.salaId,
        de_id: d.from,
        a_id: d.to,
        importe: Math.round(importeNum),
        nota: nota.trim() || null,
      })
    if (error) {
      console.error('Error liquidar:', error)
      alert(`Error: ${error.message}`)
    } else {
      setLiquidandoOk(key)
      setTimeout(() => setLiquidandoOk(null), 3000)
      // Notificar al acreedor
      const fromM = miembros.find(m => m.id === d.from)
      const toM   = miembros.find(m => m.id === d.to)
      if (fromM && toM) {
        notificarSala({
          salaId: session!.salaId,
          excluirMiembroId: d.from,
          titulo: '💸 Pago registrado',
          cuerpo: `${fromM.nombre} le pagó ${fmtUYU(Math.round(importeNum))} a ${toM.nombre}`,
          url: `/sala/${session!.salaCodigo}/gastos`,
        })
      }
      await cargarDatos()
    }
    setLiquidando(null)
    setModalLiquidar(null)
  }

  async function handleEliminarPago(id: string) {
    await createClient().from('pagos').delete().eq('id', id)
    await cargarDatos()
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este gasto? También se borrarán los pagos registrados de la sala para mantener el balance consistente.')) return
    setBorrando(id)
    setGastos(prev => prev.filter(g => g.id !== id))
    const supabase = createClient()
    await supabase.from('pagos').delete().eq('sala_id', session!.salaId)
    setPagos([])
    await supabase.from('gastos').delete().eq('id', id)
    setBorrando(null)
  }

  if (!session) return null

  return (
    <div className={`${fraunces.variable} ${nunito.variable} ${dmMono.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes g-spin    { to { transform: rotate(360deg); } }
        @keyframes g-fadeup  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes g-in      { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes g-card    { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes g-modal   { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes g-overlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes g-shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
        @keyframes g-pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        .g-root {
          min-height: 100vh;
          background: #FAF5EE;
          font-family: var(--font-body), 'Nunito', system-ui, sans-serif;
          color: #2A1A0E;
          position: relative;
        }
        .g-bg {
          position: fixed; inset: 0;
          background-image: radial-gradient(circle at 10% 15%, rgba(192,90,59,0.05) 0%, transparent 40%),
            radial-gradient(circle at 90% 85%, rgba(200,130,58,0.04) 0%, transparent 40%);
          pointer-events: none; z-index: 0;
        }
        .g-wrap {
          position: relative; z-index: 1;
          max-width: 760px; margin: 0 auto; padding: 0 1.5rem 5rem;
        }
        @media (min-width: 1024px) {
          .g-wrap { max-width: none; padding: 0 2.5rem 5rem; }
          .g-stats { margin-bottom: 1.75rem; }
          .g-desktop-cols { display: grid; grid-template-columns: 3fr 2fr; gap: 2.5rem; align-items: start; }
          .g-balance-panel { display: block !important; }
          .g-tab-balance { display: none !important; }
        }
        .g-balance-panel {
          display: none;
          position: sticky; top: 1.5rem;
          background: white; border: 1.5px solid #EAD8C8; border-radius: 20px;
          overflow: hidden; box-shadow: 0 2px 12px rgba(150,80,40,0.06);
        }
        .g-balance-panel-header {
          padding: 1rem 1.25rem 0.75rem;
          border-bottom: 1px solid #EAD8C8;
          display: flex; align-items: center; justify-content: space-between;
        }
        .g-balance-panel-title {
          font-size: 0.68rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.1em; color: #B09080;
        }
        .g-balance-panel-body { padding: 0.875rem 1.1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .g-bp-net {
          border-radius: 14px; padding: 1rem 1.1rem;
          display: flex; align-items: center; justify-content: space-between;
        }
        .g-bp-net-val { font-family: var(--font-code), monospace; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
        .g-bp-net-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 3px; }
        .g-bp-chips { display: flex; flex-direction: column; gap: 6px; }
        .g-bp-chip {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px; border-radius: 10px;
          background: #FAF5EE; border: 1px solid #EAD8C8;
        }
        .g-bp-chip-av { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: white; }
        .g-bp-chip-name { font-size: 0.8rem; font-weight: 600; color: #2A1A0E; flex: 1; }
        .g-bp-chip-val { font-family: var(--font-code), monospace; font-size: 0.82rem; font-weight: 600; }
        .g-bp-debts { display: flex; flex-direction: column; gap: 6px; }
        .g-bp-debt {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 12px;
          background: #FAF5EE; border: 1px solid #EAD8C8; font-size: 0.8rem;
        }
        .g-bp-debt-text { flex: 1; color: #6B4030; font-size: 0.78rem; line-height: 1.35; }
        .g-bp-debt-text strong { color: #2A1A0E; }
        .g-bp-debt-amount { font-family: var(--font-code), monospace; font-size: 0.88rem; font-weight: 600; color: #C05A3B; flex-shrink: 0; }

        /* ── Header ── */
        .g-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.75rem 0 2rem;
          animation: g-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .g-header-left { display: flex; align-items: center; gap: 1rem; }
        .g-back {
          width: 36px; height: 36px; border-radius: 10px;
          background: white; border: 1.5px solid #E8D5C0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.18s, border-color 0.18s;
          color: #A07060; box-shadow: 0 1px 4px rgba(150,80,40,0.08);
        }
        .g-back:hover { background: #FFF5EE; border-color: #C05A3B; color: #C05A3B; }
        .g-header-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; color: #2A1A0E;
        }
        .g-header-sub { font-size: 0.75rem; color: #A07060; font-weight: 400; margin-top: 1px; }
        .g-header-right { display: flex; align-items: center; gap: 10px; }
        .g-realtime {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 11px; border-radius: 999px;
          background: rgba(46,125,82,0.1); border: 1px solid rgba(46,125,82,0.2);
          font-size: 0.72rem; font-weight: 600; color: #2E7D52;
        }
        .g-realtime-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #2E7D52;
          animation: g-pulse 1.8s ease-in-out infinite;
        }
        .g-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.8rem; font-weight: 700; color: white;
          border: 2px solid rgba(255,255,255,0.6);
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }
        .g-add-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 18px; background: #C05A3B; color: white; border: none;
          border-radius: 12px; font-size: 0.83rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
        }
        .g-add-btn:hover { background: #A04730; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(192,90,59,0.35); }
        .g-add-btn:active { transform: translateY(0); }

        /* ── Stats bar ── */
        .g-stats {
          display: flex; gap: 1rem; margin-bottom: 1.75rem;
          animation: g-fadeup 0.5s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .g-stat {
          flex: 1; background: white;
          border: 1.5px solid #EAD8C8;
          border-radius: 16px; padding: 1rem 1.25rem;
          display: flex; flex-direction: column; gap: 3px;
          box-shadow: 0 2px 8px rgba(150,80,40,0.06);
        }
        .g-stat-val { font-family: var(--font-serif), serif; font-size: 1.5rem; color: #2A1A0E; letter-spacing: -0.03em; line-height: 1.2; font-weight: 600; }
        .g-stat-label { font-size: 0.7rem; color: #B09080; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }

        /* ── Tabs ── */
        .g-tabs {
          display: flex; gap: 4px;
          background: white; border: 1.5px solid #EAD8C8;
          border-radius: 14px; padding: 4px;
          margin-bottom: 1.5rem;
          animation: g-fadeup 0.5s 0.15s cubic-bezier(0.22, 1, 0.36, 1) both;
          width: fit-content;
          box-shadow: 0 2px 8px rgba(150,80,40,0.06);
        }
        .g-tab {
          padding: 7px 22px; border-radius: 10px; border: none; cursor: pointer;
          font-size: 0.84rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          transition: all 0.18s; color: #A07060;
          background: transparent;
        }
        .g-tab.active { background: #C05A3B; color: white; box-shadow: 0 2px 10px rgba(192,90,59,0.3); }
        .g-tab:not(.active):hover { color: #2A1A0E; background: #FAF0E8; }

        /* ── Skeleton ── */
        .g-skeleton {
          background: linear-gradient(90deg, #F0E8DF 25%, #E8DDD4 50%, #F0E8DF 75%);
          background-size: 200% 100%; animation: g-shimmer 1.5s infinite; border-radius: 10px;
        }

        /* ── Empty state ── */
        .g-empty { text-align: center; padding: 5rem 2rem; animation: g-fadeup 0.5s 0.2s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .g-empty-icon {
          width: 72px; height: 72px; margin: 0 auto 1.5rem; border-radius: 20px;
          background: rgba(192,90,59,0.1); border: 1.5px solid rgba(192,90,59,0.2);
          display: flex; align-items: center; justify-content: center; font-size: 2rem;
        }
        .g-empty-title { font-family: var(--font-serif), serif; font-size: 1.6rem; color: #2A1A0E; letter-spacing: -0.025em; margin-bottom: 0.5rem; font-weight: 600; }
        .g-empty-sub { font-size: 0.85rem; color: #A07060; font-weight: 400; line-height: 1.6; }

        /* ── Gasto list ── */
        .g-list { display: flex; flex-direction: column; gap: 8px; }
        .g-item {
          background: white; border: 1.5px solid #EAD8C8;
          border-radius: 16px; padding: 1rem 1.2rem;
          display: flex; align-items: center; gap: 1rem;
          animation: g-card 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
          transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
          box-shadow: 0 2px 8px rgba(150,80,40,0.05);
        }
        .g-item:hover { background: #FFFAF5; border-color: #D4B8A0; box-shadow: 0 4px 14px rgba(150,80,40,0.09); }
        .g-cat-badge {
          width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
          border: 1.5px solid;
        }
        .g-item-body { flex: 1; min-width: 0; }
        .g-item-top { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
        .g-item-desc { font-size: 0.9rem; font-weight: 600; color: #2A1A0E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .g-tipo-badge {
          padding: 1px 7px; border-radius: 999px; font-size: 0.65rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.07em; flex-shrink: 0;
        }
        .g-tipo-fijo    { background: rgba(90,136,105,0.12); color: #3A7050; border: 1px solid rgba(90,136,105,0.25); }
        .g-tipo-variable{ background: rgba(176,104,32,0.12); color: #9A5A10; border: 1px solid rgba(176,104,32,0.22); }
        .g-item-meta { font-size: 0.75rem; color: #B09080; font-weight: 400; }
        .g-item-end { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .g-item-right { text-align: right; flex-shrink: 0; }
        .g-item-importe { font-family: var(--font-code), monospace; font-size: 1rem; font-weight: 500; color: #2A1A0E; }
        .g-item-parte { font-size: 0.72rem; color: #A07060; margin-top: 2px; }
        .g-item-btns { display: flex; gap: 2px; }
        .g-del-btn {
          width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
          background: transparent; border: 1px solid transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #D0B8A8;
          transition: background 0.18s, border-color 0.18s, color 0.18s;
        }
        .g-del-btn:hover { background: rgba(180,50,50,0.08); border-color: rgba(180,50,50,0.2); color: #C04040; }
        .g-del-btn:disabled { opacity: 0.3; pointer-events: none; }

        .g-edit-btn {
          width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
          background: transparent; border: 1px solid transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #D0B8A8;
          transition: background 0.18s, border-color 0.18s, color 0.18s;
        }
        .g-edit-btn:hover { background: rgba(192,90,59,0.08); border-color: rgba(192,90,59,0.2); color: #C05A3B; }

        .g-section-label {
          font-size: 0.68rem; font-weight: 700; color: #B09080;
          text-transform: uppercase; letter-spacing: 0.09em;
          padding: 4px 2px; margin-bottom: 4px; margin-top: 4px;
          display: flex; align-items: center; gap: 6px;
        }
        .g-section-label::after {
          content: ''; flex: 1; height: 1px; background: #EAD8C8;
        }
        .g-item-fijo {
          border-left: 3px solid rgba(90,136,105,0.4);
        }

        /* ── Balance tab ── */
        .g-balance-list { display: flex; flex-direction: column; gap: 10px; }
        .g-debt-card {
          background: white; border: 1.5px solid #EAD8C8;
          border-radius: 18px; padding: 1.1rem 1.4rem;
          display: flex; align-items: center; gap: 1rem;
          animation: g-card 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
          box-shadow: 0 2px 8px rgba(150,80,40,0.06);
        }
        .g-debt-avatars { display: flex; align-items: center; gap: 6px; }
        .g-debt-av {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.78rem; font-weight: 700; color: white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }
        .g-debt-arrow { color: #C0A898; font-size: 1rem; }
        .g-debt-body { flex: 1; }
        .g-debt-text { font-size: 0.88rem; color: #6B4030; line-height: 1.4; }
        .g-debt-text strong { color: #2A1A0E; font-weight: 700; }
        .g-debt-amount { font-family: var(--font-code), monospace; font-size: 1.15rem; font-weight: 500; color: #C05A3B; margin-top: 2px; }

        .g-liquidar-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 8px; border: 1.5px solid rgba(90,136,105,0.3);
          background: rgba(90,136,105,0.08); color: #3A7050;
          font-size: 0.75rem; font-weight: 700;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: all 0.18s; flex-shrink: 0;
        }
        .g-liquidar-btn:hover { background: rgba(90,136,105,0.16); border-color: rgba(90,136,105,0.5); transform: translateY(-1px); }
        .g-liquidar-btn:disabled { opacity: 0.4; pointer-events: none; }

        .g-debt-card { flex-direction: column; align-items: stretch; }
        .g-debt-card-top { display: flex; align-items: center; gap: 1rem; }
        .g-nota-form {
          margin-top: 10px; padding-top: 10px; border-top: 1px solid #EAD8C8;
          display: flex; flex-direction: column; gap: 8px;
          animation: g-fadeup 0.2s cubic-bezier(0.22,1,0.36,1) both;
        }
        .g-nota-input {
          width: 100%; padding: 8px 11px;
          background: #F8F2EC; border: 1.5px solid #E0C8B8;
          border-radius: 9px; font-size: 0.83rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .g-nota-input::placeholder { color: #C8B0A0; }
        .g-nota-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.1); }
        .g-nota-actions { display: flex; gap: 6px; }
        .g-nota-cancel {
          flex: 1; padding: 7px; border-radius: 8px;
          border: 1.5px solid #E0C8B8; background: white;
          color: #A07060; font-size: 0.78rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.15s;
        }
        .g-nota-cancel:hover { background: #F5EDE4; }
        .g-nota-confirm {
          flex: 2; padding: 7px; border-radius: 8px;
          border: none; background: #5A8869; color: white;
          font-size: 0.78rem; font-weight: 700;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 5px;
          transition: background 0.15s, transform 0.12s;
        }
        .g-nota-confirm:hover { background: #3A6849; transform: translateY(-1px); }
        .g-nota-confirm:disabled { opacity: 0.5; pointer-events: none; }

        /* ── Desglose de deuda ── */
        .g-desglose {
          margin-top: 10px; padding-top: 10px; border-top: 1px solid #EAD8C8;
          animation: g-fadeup 0.22s cubic-bezier(0.22,1,0.36,1) both;
        }
        .g-desglose-row {
          display: flex; align-items: center; gap: 8px;
          padding: 5px 0; border-bottom: 1px solid #F0E8DF;
          font-size: 0.8rem;
        }
        .g-desglose-row:last-of-type { border-bottom: none; }
        .g-desglose-icon {
          width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.9rem; border: 1.5px solid;
        }
        .g-desglose-desc { flex: 1; min-width: 0; }
        .g-desglose-name { font-weight: 600; color: #2A1A0E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .g-desglose-date { font-size: 0.68rem; color: #B09080; }
        .g-desglose-monto {
          font-family: var(--font-code), monospace; font-size: 0.88rem;
          font-weight: 500; color: #C05A3B; flex-shrink: 0;
        }
        .g-desglose-total {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 8px; padding: 6px 10px; border-radius: 8px;
          background: rgba(192,90,59,0.06); border: 1px solid rgba(192,90,59,0.15);
          font-size: 0.78rem;
        }
        .g-desglose-total-label { color: #8A6050; font-weight: 600; }
        .g-desglose-total-val {
          font-family: var(--font-code), monospace; font-weight: 700;
          color: #C05A3B; font-size: 0.92rem;
        }
        .g-desglose-empty { font-size: 0.78rem; color: #B09080; font-style: italic; padding: 4px 0; }
        .g-ver-detalle {
          display: flex; align-items: center; gap: 4px;
          background: none; border: none; cursor: pointer;
          font-size: 0.72rem; font-weight: 600; color: #A07060;
          font-family: var(--font-body), 'Nunito', sans-serif;
          padding: 2px 0; transition: color 0.15s;
        }
        .g-ver-detalle:hover { color: #C05A3B; }

        .g-pagos-hist { margin-top: 16px; }
        .g-pagos-label { font-size: 0.68rem; font-weight: 700; color: #B09080; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 8px; }
        .g-pago-row {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 9px 12px; border-radius: 10px;
          background: white; border: 1px solid #EAD8C8;
          margin-bottom: 6px; font-size: 0.8rem;
        }
        .g-pago-info { flex: 1; min-width: 0; }
        .g-pago-members { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .g-pago-nota { font-size: 0.72rem; color: #A07060; font-style: italic; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .g-pago-del-btn {
          width: 24px; height: 24px; border-radius: 6px; flex-shrink: 0;
          background: transparent; border: 1px solid transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #C8B0A0; margin-left: auto;
          transition: background 0.18s, color 0.18s;
        }
        .g-pago-del-btn:hover { background: rgba(180,50,50,0.08); color: #C04040; }

        .g-all-good {
          text-align: center; padding: 5rem 2rem;
          animation: g-fadeup 0.5s 0.15s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .g-all-good-icon {
          width: 72px; height: 72px; margin: 0 auto 1.5rem; border-radius: 20px;
          background: rgba(46,125,82,0.1); border: 1.5px solid rgba(46,125,82,0.25);
          display: flex; align-items: center; justify-content: center; font-size: 2rem;
        }
        .g-all-good-title { font-family: var(--font-serif), serif; font-size: 1.6rem; color: #2E7D52; letter-spacing: -0.025em; margin-bottom: 0.5rem; font-weight: 600; }
        .g-all-good-sub { font-size: 0.85rem; color: #A07060; font-weight: 400; }

        /* ── Modal ── */
        .g-overlay {
          position: fixed; inset: 0; background: rgba(42,26,14,0.5);
          backdrop-filter: blur(6px); z-index: 300;
          display: flex; align-items: flex-end; justify-content: center;
          animation: g-overlay 0.2s ease both;
        }
        @media (min-width: 600px) { .g-overlay { align-items: center; } }

        .g-modal {
          background: #FFF8F2; border: 1.5px solid #EAD8C8;
          border-radius: 24px 24px 0 0; width: 100%; max-width: 520px;
          padding: 2rem; padding-bottom: max(2rem, calc(env(safe-area-inset-bottom) + 1rem));
          animation: g-modal 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
          max-height: 92vh; overflow-y: auto;
          -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
          box-shadow: 0 -8px 40px rgba(150,80,40,0.12);
        }
        @media (min-width: 600px) { .g-modal { border-radius: 20px; box-shadow: 0 20px 60px rgba(150,80,40,0.15); } }

        .g-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.75rem; }
        .g-modal-title { font-family: var(--font-serif), serif; font-size: 1.5rem; color: #2A1A0E; letter-spacing: -0.025em; font-weight: 600; }
        .g-modal-close {
          width: 32px; height: 32px; border-radius: 8px;
          background: #F0E8DF; border: 1px solid #E0C8B8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #A07060; transition: background 0.18s, color 0.18s;
        }
        .g-modal-close:hover { background: #E8D0C0; color: #2A1A0E; }

        .g-field { margin-bottom: 1rem; }
        .g-label { display: block; font-size: 0.68rem; font-weight: 700; color: #8A6050; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 6px; }
        .g-input {
          width: 100%; padding: 10px 13px;
          background: white; border: 1.5px solid #E0C8B8;
          border-radius: 10px; font-size: 0.88rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .g-input::placeholder { color: #C8B0A0; }
        .g-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.12); }

        /* Tipo toggle */
        .g-toggle-row { display: flex; gap: 0; border-radius: 10px; overflow: hidden; border: 1.5px solid #E0C8B8; }
        .g-toggle-btn {
          flex: 1; padding: 9px 14px; border: none; cursor: pointer; font-size: 0.84rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          transition: all 0.18s; background: white; color: #A07060;
        }
        .g-toggle-btn.active { background: #C05A3B; color: white; }
        .g-toggle-btn:not(.active):hover { background: #FFF0E8; color: #2A1A0E; }

        /* Categoria grid */
        .g-cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .g-cat-btn {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 10px 8px; border-radius: 10px; border: 1.5px solid #E0C8B8;
          background: white; cursor: pointer;
          font-size: 0.72rem; font-weight: 600; color: #A07060;
          transition: all 0.18s; font-family: var(--font-body), 'Nunito', sans-serif;
        }
        .g-cat-btn .g-cat-icon { font-size: 1.25rem; line-height: 1; }
        .g-cat-btn:hover { background: #FFF5EE; border-color: #C05A3B; color: #2A1A0E; }
        .g-cat-btn.active { border-width: 1.5px; }

        /* Payer row (kept for layout compatibility) */
        .g-payer-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .g-payer-av {
          width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.65rem; font-weight: 700; color: white; flex-shrink: 0;
        }

        .g-error {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 13px; background: #FFF0EC;
          border: 1px solid #F0C0B0; border-radius: 9px;
          color: #B03A1A; font-size: 0.81rem; margin-bottom: 1rem;
        }
        .g-submit-wrap {
          position: sticky; bottom: 0;
          padding-top: 12px; margin-top: 0.25rem;
          padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
          background: linear-gradient(to bottom, transparent, #FFF8F2 35%);
        }
        .g-submit {
          width: 100%; padding: 13px; background: #C05A3B; color: white; border: none;
          border-radius: 13px; font-size: 0.9rem; font-weight: 700;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .g-submit:hover:not(:disabled) { background: #A04730; transform: translateY(-1.5px); box-shadow: 0 10px 28px rgba(192,90,59,0.35); }
        .g-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .g-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; animation: g-spin 0.7s linear infinite; flex-shrink: 0; }

        /* ── Splits ── */
        .g-split-row {
          display: flex; align-items: center; gap: 10px; padding: 6px 0;
        }
        .g-split-av {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.68rem; font-weight: 700; color: white;
        }
        .g-split-name { flex: 1; font-size: 0.84rem; color: #6B4030; font-weight: 500; }
        .g-split-input {
          width: 100px; padding: 7px 10px;
          background: white; border: 1.5px solid #E0C8B8;
          border-radius: 8px; font-size: 0.84rem;
          font-family: var(--font-code), monospace;
          color: #2A1A0E; outline: none; text-align: right;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .g-split-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.12); }
        .g-split-total {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 10px; border-radius: 8px;
          background: #F5EDE4; border: 1px solid #E0C8B8;
          font-size: 0.78rem; margin-top: 4px;
        }

        @media (max-width: 640px) {
          .g-wrap { padding: 0 1rem 5rem; }
          /* Header */
          .g-header { padding: 1.25rem 0 1.5rem; }
          .g-header-title { font-size: 1.15rem; }
          .g-header-right { gap: 7px; }
          .g-realtime { display: none; }
          .g-add-text { display: none; }
          .g-add-btn { padding: 9px; border-radius: 10px; }
          /* Stats: 2-col grid, tercero full ancho */
          .g-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; overflow: visible; }
          .g-stat:last-child { grid-column: 1 / 3; }
          .g-stat { padding: 0.8rem 1rem; }
          .g-stat-val { font-size: 1.25rem; }
          /* Tabs */
          .g-tabs { width: 100%; }
          .g-tab { flex: 1; padding: 7px 10px; }
          /* Gasto items: 2 filas */
          .g-item { flex-wrap: wrap; row-gap: 6px; padding: 0.85rem 0.9rem; gap: 0 0.65rem; }
          .g-cat-badge { align-self: flex-start; margin-top: 3px; }
          .g-item-body { min-width: 0; }
          .g-item-desc { font-size: 0.84rem; white-space: normal; }
          .g-item-meta { font-size: 0.69rem; }
          .g-item-end { flex: 0 0 100%; padding-left: calc(42px + 0.65rem); justify-content: space-between; align-items: center; }
          .g-item-right { text-align: left; display: flex; align-items: baseline; gap: 8px; }
          .g-item-parte { margin-top: 0; }
          .g-item-importe { font-size: 0.9rem; }
          /* Balance */
          .g-debt-card-top { flex-wrap: wrap; gap: 8px; }
          .g-debt-body { min-width: 0; width: 100%; }
          .g-pago-members { flex-wrap: wrap; gap: 4px; }
          /* Modal */
          .g-modal { padding: 1.5rem 1.25rem; }
          .g-modal-title { font-size: 1.25rem; }
          .g-cat-grid { grid-template-columns: repeat(3, 1fr); }
          .g-split-input { width: 80px; }
        }
        @media (max-width: 420px) {
          .g-wrap { padding: 0 0.75rem 5rem; }
          .g-header-title { font-size: 1rem; }
          .g-stat-val { font-size: 1.1rem; }
          .g-stat { padding: 0.7rem 0.85rem; }
          .g-debt-av { width: 30px; height: 30px; font-size: 0.68rem; }
          .g-tipo-badge { display: none; }
        }
      `}</style>

      <div className="g-root">
        <div className="g-bg" />

        <div className="g-wrap">

          {/* ── HEADER ── */}
          <div className="g-header">
            <div className="g-header-left">
              <button className="g-back" onClick={() => router.push(`/sala/${codigo}`)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div>
                <div className="g-header-title">Gastos</div>
                <div className="g-header-sub">{session.salaNombre}</div>
              </div>
            </div>
            <div className="g-header-right">
              {realtimeOk && (
                <div className="g-realtime">
                  <span className="g-realtime-dot" />
                  En vivo
                </div>
              )}
              <div className="g-avatar" style={{ background: session.miembroColor }}>
                {session.miembroNombre[0].toUpperCase()}
              </div>
              <button className="g-add-btn" onClick={abrirModal}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span className="g-add-text">Añadir gasto</span>
              </button>
            </div>
          </div>

          {/* ── STATS (full-width on desktop) ── */}
          {!loading && (
            <div className="g-stats">
              <div className="g-stat">
                <div className="g-stat-val" style={{ fontSize: stats.totalMes >= 100000 ? '1.1rem' : undefined }}>
                  {fmtUYU(stats.totalMes)}
                </div>
                <div className="g-stat-label">Total del mes</div>
              </div>
              <div className="g-stat">
                <div className="g-stat-val" style={{ fontSize: stats.miParte >= 100000 ? '1.1rem' : undefined }}>
                  {fmtUYU(Math.round(stats.miParte))}
                </div>
                <div className="g-stat-label">Mi parte</div>
              </div>
              <div className="g-stat">
                <div className="g-stat-val">{gastosVisibles.length}</div>
                <div className="g-stat-label">Gastos totales</div>
              </div>
            </div>
          )}

          {/* ── LOADING SKELETONS STATS ── */}
          {loading && (
            <div className="g-stats">
              {[1, 2, 3].map(i => (
                <div key={i} className="g-stat">
                  <div className="g-skeleton" style={{ height: 28, width: '70%', marginBottom: 8 }} />
                  <div className="g-skeleton" style={{ height: 10, width: '55%' }} />
                </div>
              ))}
            </div>
          )}

          <div className="g-desktop-cols">
          <div>{/* main col */}
          {/* ── TABS ── */}
          <div className="g-tabs">
            <button className={`g-tab${tab === 'gastos' ? ' active' : ''}`} onClick={() => setTab('gastos')}>Gastos</button>
            <button className={`g-tab g-tab-balance${tab === 'balance' ? ' active' : ''}`} onClick={() => setTab('balance')}>Balance</button>
            <button className={`g-tab${tab === 'historial' ? ' active' : ''}`} onClick={() => setTab('historial')}>
              Historial
              {pagos.length > 0 && tab !== 'historial' && (
                <span style={{ marginLeft: 5, background: 'rgba(192,90,59,0.15)', color: '#C05A3B', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px' }}>
                  {pagos.length}
                </span>
              )}
            </button>
          </div>

          {/* ── BANNER: Historial limitado (plan Free) ── */}
          {!loading && historialLimitado && planSala === 'free' && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(192,90,59,0.08), rgba(200,130,58,0.06))',
              border: '1.5px solid rgba(192,90,59,0.2)',
              borderRadius: 14, padding: '0.85rem 1.1rem',
              marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2A1A0E', marginBottom: 2 }}>
                  📅 Historial de los últimos 3 meses
                </div>
                <div style={{ fontSize: '0.75rem', color: '#8A5A40', lineHeight: 1.4 }}>
                  Con Nido Pro accedés a todo el historial sin límite.
                </div>
              </div>
              <button
                onClick={() => router.push(`/sala/${codigo}`)}
                style={{
                  flexShrink: 0, padding: '6px 14px',
                  background: '#C05A3B', color: 'white',
                  border: 'none', borderRadius: 10,
                  fontSize: '0.75rem', fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Ver planes →
              </button>
            </div>
          )}

          {/* ── TAB: GASTOS ── */}
          {tab === 'gastos' && (
            <>
              {loading && (
                <div className="g-list">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ borderRadius: 16, padding: '1rem 1.2rem', border: '1.5px solid #EAD8C8', background: 'white', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div className="g-skeleton" style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="g-skeleton" style={{ height: 14, width: '55%', marginBottom: 8 }} />
                        <div className="g-skeleton" style={{ height: 11, width: '35%' }} />
                      </div>
                      <div className="g-skeleton" style={{ height: 18, width: 70, borderRadius: 6 }} />
                    </div>
                  ))}
                </div>
              )}

              {!loading && gastosVisibles.length === 0 && (
                <div className="g-empty">
                  <div className="g-empty-icon">💸</div>
                  <div className="g-empty-title">Sin gastos aún</div>
                  <p className="g-empty-sub">Añadí el primero con el botón de arriba.<br />Podéis dividir y controlar gastos juntos.</p>
                </div>
              )}

              {!loading && gastosVisibles.length > 0 && (() => {
                const fijos = [...gastosVisibles].filter(g => g.tipo === 'fijo').sort((a, b) => b.fecha.localeCompare(a.fecha))
                const variables = [...gastosVisibles].filter(g => g.tipo === 'variable').sort((a, b) => b.fecha.localeCompare(a.fecha))
                const renderGasto = (g: Gasto, idx: number) => {
                  const cat = CATEGORIA_META[g.categoria]
                  const miId = session.miembroId
                  const miParte = Math.round(g.splits?.[miId] !== undefined ? g.splits[miId] : g.importe / (miembros.length || 1))
                  return (
                    <div key={g.id} className={`g-item${g.tipo === 'fijo' ? ' g-item-fijo' : ''}`} style={{ animationDelay: `${idx * 0.05}s` }}>
                      <div className="g-cat-badge" style={{ background: cat.bg, borderColor: cat.border }}>
                        {cat.icon}
                      </div>
                      <div className="g-item-body">
                        <div className="g-item-top">
                          <span className="g-item-desc">{g.descripcion}</span>
                          <span className={`g-tipo-badge g-tipo-${g.tipo}`}>
                            {g.tipo === 'fijo' ? '📌 Fijo' : 'Variable'}
                          </span>
                        </div>
                        <div className="g-item-meta">
                          <span style={{ color: cat.color }}>{cat.label}</span>
                          <span style={{ color: '#D0B8A8', margin: '0 5px' }}>·</span>
                          {fmtFecha(g.fecha)}
                          <span style={{ color: '#D0B8A8', margin: '0 5px' }}>·</span>
                          {isPersonal(g)
                            ? <span style={{ color: '#9060A0', fontWeight: 600 }}>🔒 Solo vos</span>
                            : (() => {
                                const payerM = g.pagado_por ? miembros.find(m => m.id === g.pagado_por) : null
                                return (
                                  <>
                                    {g.splits ? 'Personalizado' : 'Partes iguales'}
                                    {payerM && (
                                      <>
                                        <span style={{ color: '#D0B8A8', margin: '0 5px' }}>·</span>
                                        <span style={{ color: payerM.color, fontWeight: 600 }}>pagó {payerM.nombre}</span>
                                      </>
                                    )}
                                  </>
                                )
                              })()
                          }
                        </div>
                      </div>
                      <div className="g-item-end">
                        <div className="g-item-right">
                          <div className="g-item-importe">{fmtUYU(g.importe)}</div>
                          <div className="g-item-parte">Tu parte: {fmtUYU(miParte)}</div>
                        </div>
                        <div className="g-item-btns">
                          <button className="g-edit-btn" onClick={() => abrirEditar(g)} title="Editar gasto">
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                              <path d="M9 2l2 2-6 6-2.5.5.5-2.5L9 2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            className="g-del-btn"
                            onClick={() => handleEliminar(g.id)}
                            disabled={borrando === g.id}
                            title="Eliminar gasto"
                          >
                            {borrando === g.id ? (
                              <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #D0B8A8', borderTopColor: '#C04040', animation: 'g-spin 0.7s linear infinite' }} />
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }
                const fijosSlice = fijos.slice(0, fijosPag)
                const variablesSlice = variables.slice(0, variablesPag)
                return (
                  <div className="g-list">
                    {fijos.length > 0 && (
                      <>
                        <div className="g-section-label">Gastos fijos</div>
                        {fijosSlice.map((g, i) => renderGasto(g, i))}
                        {fijos.length > fijosPag && (
                          <button
                            type="button"
                            onClick={() => setFijosPag(p => p + 8)}
                            style={{
                              width: '100%', padding: '9px', borderRadius: 12,
                              background: 'white', border: '1.5px dashed #D4B8A0',
                              color: '#A07060', fontSize: '0.8rem', fontWeight: 600,
                              cursor: 'pointer', fontFamily: 'var(--font-body), Nunito, sans-serif',
                              transition: 'border-color 0.18s, color 0.18s, background 0.18s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FFF5EE'; (e.currentTarget as HTMLElement).style.color = '#C05A3B'; (e.currentTarget as HTMLElement).style.borderColor = '#C05A3B' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white'; (e.currentTarget as HTMLElement).style.color = '#A07060'; (e.currentTarget as HTMLElement).style.borderColor = '#D4B8A0' }}
                          >
                            Ver más ({fijos.length - fijosPag} restantes)
                          </button>
                        )}
                      </>
                    )}
                    {variables.length > 0 && (
                      <>
                        <div className="g-section-label" style={{ marginTop: fijos.length > 0 ? 8 : 0 }}>Gastos variables</div>
                        {variablesSlice.map((g, i) => renderGasto(g, fijosSlice.length + i))}
                        {variables.length > variablesPag && (
                          <button
                            type="button"
                            onClick={() => setVariablesPag(p => p + 10)}
                            style={{
                              width: '100%', padding: '9px', borderRadius: 12,
                              background: 'white', border: '1.5px dashed #D4B8A0',
                              color: '#A07060', fontSize: '0.8rem', fontWeight: 600,
                              cursor: 'pointer', fontFamily: 'var(--font-body), Nunito, sans-serif',
                              transition: 'border-color 0.18s, color 0.18s, background 0.18s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FFF5EE'; (e.currentTarget as HTMLElement).style.color = '#C05A3B'; (e.currentTarget as HTMLElement).style.borderColor = '#C05A3B' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white'; (e.currentTarget as HTMLElement).style.color = '#A07060'; (e.currentTarget as HTMLElement).style.borderColor = '#D4B8A0' }}
                          >
                            Ver más ({variables.length - variablesPag} restantes)
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}
            </>
          )}

          {/* ── TAB: HISTORIAL ── */}
          {tab === 'historial' && (
            <>
              {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[1,2,3].map(i => (
                    <div key={i} style={{ borderRadius: 14, padding: '1rem 1.2rem', border: '1.5px solid #EAD8C8', background: 'white', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div className="g-skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                      <div style={{ flex: 1 }}>
                        <div className="g-skeleton" style={{ height: 14, width: '60%', marginBottom: 7 }} />
                        <div className="g-skeleton" style={{ height: 11, width: '35%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loading && pagos.length === 0 && (
                <div className="g-empty">
                  <div className="g-empty-icon">📋</div>
                  <div className="g-empty-title">Sin pagos aún</div>
                  <p className="g-empty-sub">Cuando alguien liquide una deuda aparecerá acá.</p>
                </div>
              )}
              {!loading && pagos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pagos.map((p, idx) => {
                    const deM = miembros.find(m => m.id === p.de_id)
                    const aM  = miembros.find(m => m.id === p.a_id)
                    if (!deM || !aM) return null
                    const esMio = p.de_id === miId || p.a_id === miId
                    return (
                      <div
                        key={p.id}
                        className="g-item"
                        style={{ animationDelay: `${idx * 0.04}s`, borderLeft: esMio ? '3px solid rgba(90,136,105,0.5)' : undefined }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <div className="g-debt-av" style={{ background: deM.color, width: 32, height: 32, fontSize: '0.72rem' }}>
                            {deM.nombre[0].toUpperCase()}
                          </div>
                          <span style={{ color: '#C0A898', fontSize: '1rem' }}>→</span>
                          <div className="g-debt-av" style={{ background: aM.color, width: 32, height: 32, fontSize: '0.72rem' }}>
                            {aM.nombre[0].toUpperCase()}
                          </div>
                        </div>
                        <div className="g-item-body">
                          <div style={{ fontSize: '0.87rem', fontWeight: 600, color: '#2A1A0E' }}>
                            <span style={{ color: deM.color }}>{deM.nombre}</span>
                            {' '}pagó a{' '}
                            <span style={{ color: aM.color }}>{aM.nombre}</span>
                          </div>
                          <div className="g-item-meta">
                            {fmtFecha(p.fecha)}
                            {p.nota && <><span style={{ color: '#D0B8A8', margin: '0 5px' }}>·</span>📌 {p.nota}</>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontFamily: 'var(--font-code), monospace', fontSize: '1rem', fontWeight: 600, color: '#5A8869' }}>
                            {fmtUYU(p.importe)}
                          </span>
                          <button className="g-pago-del-btn" onClick={() => handleEliminarPago(p.id)} title="Deshacer pago">
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                              <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {/* Resumen total */}
                  <div style={{ marginTop: 8, padding: '0.85rem 1.2rem', background: 'white', border: '1.5px solid #EAD8C8', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                    <span style={{ color: '#8A6A58', fontWeight: 600 }}>{pagos.length} pago{pagos.length !== 1 ? 's' : ''} en total</span>
                    <span style={{ fontFamily: 'var(--font-code), monospace', fontWeight: 700, color: '#5A8869' }}>
                      {fmtUYU(pagos.reduce((s, p) => s + p.importe, 0))} liquidados
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TAB: BALANCE ── */}
          {tab === 'balance' && (
            <>
              {/* ── Resumen total del usuario ── */}
              {!loading && (() => {
                const miNet = balanceNet[miId] ?? 0
                const alDia = Math.abs(miNet) < EPS
                const meDeban = miNet > EPS
                return (
                  <div style={{
                    borderRadius: 20,
                    padding: '1.25rem 1.4rem',
                    marginBottom: '1rem',
                    background: alDia
                      ? 'linear-gradient(135deg, #edfbf3 0%, #d6f5e5 100%)'
                      : meDeban
                        ? 'linear-gradient(135deg, #edf6ff 0%, #d6eaff 100%)'
                        : 'linear-gradient(135deg, #fff4f0 0%, #ffe0d6 100%)',
                    border: `1.5px solid ${alDia ? 'rgba(46,125,82,0.2)' : meDeban ? 'rgba(30,107,168,0.2)' : 'rgba(192,90,59,0.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: alDia ? '#2E7D52' : meDeban ? '#1E6BA8' : '#C05A3B', marginBottom: 4 }}>
                        {alDia ? 'Tu balance' : meDeban ? 'Te deben en total' : 'Debés en total'}
                      </div>
                      <div style={{ fontFamily: 'var(--font-code), monospace', fontSize: '1.8rem', fontWeight: 700, color: alDia ? '#2E7D52' : meDeban ? '#1E6BA8' : '#C05A3B', letterSpacing: '-0.02em' }}>
                        {alDia ? '✓ Al día' : `${fmtUYU(Math.round(Math.abs(miNet)))}`}
                      </div>
                      {!alDia && (
                        <div style={{ fontSize: '0.75rem', color: '#8A7060', marginTop: 3 }}>
                          {meDeban ? 'tus compañeros te deben este monto' : 'le debés este monto a tus compañeros'}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: alDia ? '2.2rem' : '2rem', flexShrink: 0 }}>
                      {alDia ? '🎉' : meDeban ? '🤑' : '😬'}
                    </div>
                  </div>
                )
              })()}

              {/* ── Mini resumen por miembro ── */}
              {!loading && miembros.length > 1 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {miembros.filter(m => m.id !== miId).map(m => {
                    const val = balanceNet[m.id] ?? 0
                    const alDia = Math.abs(val) < EPS
                    return (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        background: 'white', border: '1.5px solid #EAD8C8',
                        borderRadius: 12, padding: '7px 12px', fontSize: '0.8rem',
                      }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>
                          {m.nombre[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#2A1A0E', fontSize: '0.78rem' }}>{m.nombre}</div>
                          <div style={{ fontSize: '0.7rem', color: alDia ? '#2E7D52' : val > 0 ? '#1E6BA8' : '#C05A3B', fontWeight: 600 }}>
                            {alDia ? 'al día' : val > 0 ? `+${fmtUYU(Math.round(val))}` : fmtUYU(Math.round(val))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {loading && (
                <div className="g-balance-list">
                  {[1, 2].map(i => (
                    <div key={i} style={{ borderRadius: 18, padding: '1.1rem 1.4rem', border: '1.5px solid #EAD8C8', background: 'white', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div className="g-skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                        <div className="g-skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="g-skeleton" style={{ height: 14, width: '60%', marginBottom: 7 }} />
                        <div className="g-skeleton" style={{ height: 20, width: '35%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && debts.filter(d => d.from === miId || d.to === miId).length === 0 && (
                <div className="g-all-good">
                  <div className="g-all-good-icon">✅</div>
                  <div className="g-all-good-title">¡Todo al día!</div>
                  <p className="g-all-good-sub">No tenés deudas pendientes.<br />Las cuentas están equilibradas.</p>
                </div>
              )}

              {!loading && debts.length > 0 && (
                <div className="g-balance-list">
                  {debts.filter(d => d.from === miId || d.to === miId).map((d, idx) => {
                    const fromM = miembros.find(m => m.id === d.from)
                    const toM = miembros.find(m => m.id === d.to)
                    if (!fromM || !toM) return null
                    const key = `${d.from}-${d.to}`
                    const isSaving   = liquidando === key
                    const isExpanded = expandedDebt === key
                    const isOk       = liquidandoOk === key
                    const desglose   = desglosarDeuda(d.from, d.to, gastosCompartidos, miembros)
                    const totalBruto = desglose.reduce((s, x) => s + x.monto, 0)
                    return (
                      <div key={idx} className="g-debt-card" style={{ animationDelay: `${idx * 0.08}s` }}>
                        <div className="g-debt-card-top">
                          <div className="g-debt-avatars">
                            <div className="g-debt-av" style={{ background: fromM.color }}>
                              {fromM.nombre[0].toUpperCase()}
                            </div>
                            <span className="g-debt-arrow">→</span>
                            <div className="g-debt-av" style={{ background: toM.color }}>
                              {toM.nombre[0].toUpperCase()}
                            </div>
                          </div>
                          <div className="g-debt-body">
                            <div className="g-debt-text">
                              <strong>{fromM.nombre}</strong> le debe a <strong>{toM.nombre}</strong>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                              <div className="g-debt-amount">{fmtUYU(d.amount)}</div>
                              {desglose.length > 0 && (
                                <button
                                  className="g-ver-detalle"
                                  type="button"
                                  onClick={() => setExpandedDebt(isExpanded ? null : key)}
                                >
                                  {isExpanded ? 'Ocultar' : `Ver detalle (${desglose.length})`}
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                          {d.from === miId && (
                            isOk ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: 'rgba(46,125,82,0.12)', border: '1.5px solid rgba(46,125,82,0.3)', color: '#2E7D52', fontSize: '0.75rem', fontWeight: 700 }}>
                                ✓ ¡Pago registrado!
                              </div>
                            ) : (
                              <button
                                className="g-liquidar-btn"
                                onClick={() => { setModalLiquidar({ debt: d, importe: String(d.amount), nota: '' }); setEditandoMonto(false); setNotaAbierta(false) }}
                                disabled={isSaving}
                              >
                                {isSaving ? (
                                  <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #5A8869', borderTopColor: 'transparent', animation: 'g-spin 0.7s linear infinite' }} />
                                ) : (
                                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                    <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                                {isSaving ? 'Guardando...' : 'Liquidar'}
                              </button>
                            )
                          )}
                        </div>

                        {/* ── Desglose de gastos ── */}
                        {isExpanded && (
                          <div className="g-desglose">
                            {desglose.length === 0 ? (
                              <div className="g-desglose-empty">Sin gastos que generen esta deuda aún.</div>
                            ) : (
                              <>
                                {desglose.map(({ gasto: g, monto }) => {
                                  const cat = CATEGORIA_META[g.categoria]
                                  const esIgual = !g.splits
                                  return (
                                    <div key={g.id} className="g-desglose-row">
                                      <div className="g-desglose-icon" style={{ background: cat.bg, borderColor: cat.border }}>
                                        {cat.icon}
                                      </div>
                                      <div className="g-desglose-desc">
                                        <div className="g-desglose-name">{g.descripcion}</div>
                                        <div className="g-desglose-date">
                                          {fmtFecha(g.fecha)} · {cat.label}
                                          {esIgual && (
                                            <span style={{ color: '#C0A898' }}> · {fmtUYU(g.importe)} ÷ {miembros.length}</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="g-desglose-monto">{fmtUYU(Math.round(monto))}</div>
                                    </div>
                                  )
                                })}
                                {/* Footer explicativo */}
                                {Math.abs(totalBruto - d.amount) <= 1 ? (
                                  <div className="g-desglose-total">
                                    <span className="g-desglose-total-label">Total de estos gastos</span>
                                    <span className="g-desglose-total-val">{fmtUYU(Math.round(totalBruto))}</span>
                                  </div>
                                ) : (
                                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#8A6050' }}>
                                      <span>Total de estos gastos</span>
                                      <span style={{ fontFamily: 'var(--font-code), monospace', fontWeight: 600 }}>{fmtUYU(Math.round(totalBruto))}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#5A8869' }}>
                                      <span>Ya pagado</span>
                                      <span style={{ fontFamily: 'var(--font-code), monospace', fontWeight: 600 }}>− {fmtUYU(Math.round(totalBruto - d.amount))}</span>
                                    </div>
                                    <div style={{ borderTop: '1px dashed #EAD8C8', paddingTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2A1A0E' }}>Queda por pagar</span>
                                      <span style={{ fontFamily: 'var(--font-code), monospace', fontWeight: 700, fontSize: '0.95rem', color: '#C05A3B' }}>{fmtUYU(d.amount)}</span>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                      </div>
                    )
                  })}

                  {/* Per-person summary */}
                  {miembros.length > 0 && (
                    <div style={{ marginTop: 12, background: 'white', border: '1.5px solid #EAD8C8', borderRadius: 16, padding: '1rem 1.25rem', boxShadow: '0 2px 8px rgba(150,80,40,0.06)' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#B09080', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>
                        Resumen por persona
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {miembros.map(m => {
                          const balance = balanceNet[m.id] ?? 0
                          return (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="g-debt-av" style={{ background: m.color, width: 28, height: 28, fontSize: '0.65rem' }}>
                                {m.nombre[0].toUpperCase()}
                              </div>
                              <span style={{ fontSize: '0.84rem', color: '#6B4030', flex: 1, fontWeight: 500 }}>{m.nombre}</span>
                              <span style={{ fontFamily: 'var(--font-code), monospace', fontSize: '0.88rem', fontWeight: 500, color: balance >= 0 ? '#2E7D52' : '#C04040' }}>
                                {balance >= 0 ? '+' : ''}{fmtUYU(Math.round(balance))}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Historial de pagos */}
                  {pagos.length > 0 && (
                    <div className="g-pagos-hist">
                      <div className="g-pagos-label">Pagos registrados</div>
                      {pagos.map(p => {
                        const deM = miembros.find(m => m.id === p.de_id)
                        const aM  = miembros.find(m => m.id === p.a_id)
                        if (!deM || !aM) return null
                        return (
                          <div key={p.id} className="g-pago-row">
                            <div className="g-pago-info">
                              <div className="g-pago-members">
                                <div className="g-debt-av" style={{ background: deM.color, width: 22, height: 22, fontSize: '0.58rem', flexShrink: 0 }}>{deM.nombre[0].toUpperCase()}</div>
                                <span style={{ color: '#6B4030', fontWeight: 600 }}>{deM.nombre}</span>
                                <span style={{ color: '#C0A898' }}>→</span>
                                <div className="g-debt-av" style={{ background: aM.color, width: 22, height: 22, fontSize: '0.58rem', flexShrink: 0 }}>{aM.nombre[0].toUpperCase()}</div>
                                <span style={{ color: '#6B4030', fontWeight: 600 }}>{aM.nombre}</span>
                                <span style={{ fontFamily: 'var(--font-code), monospace', color: '#5A8869', fontWeight: 600 }}>{fmtUYU(p.importe)}</span>
                                <span style={{ color: '#C0A898', fontSize: '0.7rem' }}>{fmtFecha(p.fecha)}</span>
                              </div>
                              {p.nota && <div className="g-pago-nota">📌 {p.nota}</div>}
                            </div>
                            <button className="g-pago-del-btn" onClick={() => handleEliminarPago(p.id)} title="Deshacer pago">
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Historial cuando no hay deudas pero sí pagos */}
              {!loading && debts.length === 0 && pagos.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="g-pagos-label">Pagos registrados</div>
                  {pagos.map(p => {
                    const deM = miembros.find(m => m.id === p.de_id)
                    const aM  = miembros.find(m => m.id === p.a_id)
                    if (!deM || !aM) return null
                    return (
                      <div key={p.id} className="g-pago-row">
                        <div className="g-pago-info">
                          <div className="g-pago-members">
                            <div className="g-debt-av" style={{ background: deM.color, width: 22, height: 22, fontSize: '0.58rem', flexShrink: 0 }}>{deM.nombre[0].toUpperCase()}</div>
                            <span style={{ color: '#6B4030', fontWeight: 600 }}>{deM.nombre}</span>
                            <span style={{ color: '#C0A898' }}>→</span>
                            <div className="g-debt-av" style={{ background: aM.color, width: 22, height: 22, fontSize: '0.58rem', flexShrink: 0 }}>{aM.nombre[0].toUpperCase()}</div>
                            <span style={{ color: '#6B4030', fontWeight: 600 }}>{aM.nombre}</span>
                            <span style={{ fontFamily: 'var(--font-code), monospace', color: '#5A8869', fontWeight: 600 }}>{fmtUYU(p.importe)}</span>
                            <span style={{ color: '#C0A898', fontSize: '0.7rem' }}>{fmtFecha(p.fecha)}</span>
                          </div>
                          {p.nota && <div className="g-pago-nota">📌 {p.nota}</div>}
                        </div>
                        <button className="g-pago-del-btn" onClick={() => handleEliminarPago(p.id)} title="Deshacer pago">
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          </div>{/* end main col */}

          {/* ── BALANCE SIDEBAR (desktop only) ── */}
          <aside className="g-balance-panel">
            <div className="g-balance-panel-header">
              <span className="g-balance-panel-title">Balance</span>
              {!loading && debts.length === 0 && (
                <span style={{ fontSize: '0.72rem', color: '#2E7D52', fontWeight: 700 }}>✓ Todo ok</span>
              )}
            </div>
            <div className="g-balance-panel-body">
              {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[1, 2, 3].map(i => <div key={i} className="g-skeleton" style={{ height: 38, borderRadius: 10 }}/>)}
                </div>
              )}

              {!loading && (() => {
                const miNet = balanceNet[miId] ?? 0
                const alDia = Math.abs(miNet) < EPS
                const meDeban = miNet > EPS
                return (
                  <div className="g-bp-net" style={{
                    background: alDia ? 'linear-gradient(135deg,#edfbf3,#d6f5e5)' : meDeban ? 'linear-gradient(135deg,#edf6ff,#d6eaff)' : 'linear-gradient(135deg,#fff4f0,#ffe0d6)',
                    border: `1.5px solid ${alDia ? 'rgba(46,125,82,0.2)' : meDeban ? 'rgba(30,107,168,0.2)' : 'rgba(192,90,59,0.2)'}`,
                  }}>
                    <div>
                      <div className="g-bp-net-label" style={{ color: alDia ? '#2E7D52' : meDeban ? '#1E6BA8' : '#C05A3B' }}>
                        {alDia ? 'Al día' : meDeban ? 'Te deben' : 'Debés'}
                      </div>
                      <div className="g-bp-net-val" style={{ color: alDia ? '#2E7D52' : meDeban ? '#1E6BA8' : '#C05A3B' }}>
                        {alDia ? '✓' : fmtUYU(Math.round(Math.abs(miNet)))}
                      </div>
                    </div>
                    <span style={{ fontSize: '1.5rem' }}>{alDia ? '🎉' : meDeban ? '🤑' : '😬'}</span>
                  </div>
                )
              })()}

              {!loading && miembros.length > 1 && (
                <div className="g-bp-chips">
                  {miembros.map(m => {
                    const val = balanceNet[m.id] ?? 0
                    const alDia = Math.abs(val) < EPS
                    return (
                      <div key={m.id} className="g-bp-chip">
                        <div className="g-bp-chip-av" style={{ background: m.color }}>{m.nombre[0].toUpperCase()}</div>
                        <span className="g-bp-chip-name">{m.nombre}{m.id === miId ? ' (tú)' : ''}</span>
                        <span className="g-bp-chip-val" style={{ color: alDia ? '#2E7D52' : val > 0 ? '#1E6BA8' : '#C05A3B' }}>
                          {alDia ? '✓' : val > 0 ? `+${fmtUYU(Math.round(val))}` : fmtUYU(Math.round(val))}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {!loading && debts.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#B09080', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Deudas pendientes</div>
                  <div className="g-bp-debts">
                    {debts.map((d, i) => {
                      const fromM = miembros.find(m => m.id === d.from)
                      const toM   = miembros.find(m => m.id === d.to)
                      if (!fromM || !toM) return null
                      return (
                        <div key={i} className="g-bp-debt">
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                            <div className="g-debt-av" style={{ background: fromM.color, width: 22, height: 22, fontSize: '0.58rem' }}>{fromM.nombre[0].toUpperCase()}</div>
                            <span style={{ color: '#C0A898', fontSize: '0.75rem' }}>→</span>
                            <div className="g-debt-av" style={{ background: toM.color, width: 22, height: 22, fontSize: '0.58rem' }}>{toM.nombre[0].toUpperCase()}</div>
                          </div>
                          <div className="g-bp-debt-text">
                            <strong>{fromM.nombre}</strong> → <strong>{toM.nombre}</strong>
                          </div>
                          <div className="g-bp-debt-amount">{fmtUYU(Math.round(d.amount))}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!loading && debts.length === 0 && miembros.length <= 1 && (
                <div style={{ textAlign: 'center', padding: '0.75rem 0', color: '#B09080', fontSize: '0.8rem' }}>
                  Sin compañeros aún
                </div>
              )}
            </div>
          </aside>

          </div>{/* end g-desktop-cols */}

        </div>
      </div>

      {/* ── MODAL: LIQUIDAR DEUDA ── */}
      {modalLiquidar && (() => {
        const { debt: d, importe, nota } = modalLiquidar
        const fromM = miembros.find(m => m.id === d.from)
        const toM   = miembros.find(m => m.id === d.to)
        if (!fromM || !toM) return null
        const importeNum = parseFloat(importe) || 0
        const isSaving = liquidando === `${d.from}-${d.to}`
        const ajustar = (delta: number) => {
          const nuevo = Math.max(0, importeNum + delta)
          setModalLiquidar(prev => prev ? { ...prev, importe: String(nuevo) } : null)
        }
        return (
          <div className="g-overlay" onClick={e => { if (e.target === e.currentTarget && !isSaving) setModalLiquidar(null) }}>
            <div className="g-modal" style={{ maxWidth: 420, paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>

              {/* Header */}
              <div className="g-modal-header">
                <div className="g-modal-title">Registrar pago</div>
                <button className="g-modal-close" onClick={() => !isSaving && setModalLiquidar(null)} disabled={isSaving}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>

              {/* Quién paga a quién */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0.75rem 0 1.25rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="g-debt-av" style={{ background: fromM.color, margin: '0 auto 6px', width: 48, height: 48, fontSize: '1rem' }}>{fromM.nombre[0].toUpperCase()}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2A1A0E' }}>{fromM.nombre}</div>
                  <div style={{ fontSize: '0.7rem', color: '#A07060' }}>paga</div>
                </div>
                <svg width="32" height="16" viewBox="0 0 32 16" fill="none" style={{ flexShrink: 0, color: '#C05A3B' }}>
                  <path d="M2 8h28M22 2l8 6-8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div style={{ textAlign: 'center' }}>
                  <div className="g-debt-av" style={{ background: toM.color, margin: '0 auto 6px', width: 48, height: 48, fontSize: '1rem' }}>{toM.nombre[0].toUpperCase()}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2A1A0E' }}>{toM.nombre}</div>
                  <div style={{ fontSize: '0.7rem', color: '#A07060' }}>recibe</div>
                </div>
              </div>

              {/* Monto — display grande + ajuste sin teclado */}
              <div style={{ background: 'rgba(90,136,105,0.07)', border: '1.5px solid rgba(90,136,105,0.2)', borderRadius: 16, padding: '1.25rem', marginBottom: '1rem' }}>
                {!editandoMonto ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-code), monospace', fontSize: '2.2rem', fontWeight: 600, color: '#2E7D52', lineHeight: 1.1, marginBottom: 4 }}>
                      ${importeNum.toLocaleString('es-UY')}
                    </div>
                    {d.amount !== importeNum && importeNum > 0 && (
                      <div style={{ fontSize: '0.7rem', color: '#7A9A88', marginBottom: 10 }}>Deuda total: ${d.amount.toLocaleString('es-UY')}</div>
                    )}
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                      {[-500, -100, +100, +500].map(delta => (
                        <button key={delta} onClick={() => ajustar(delta)} style={{
                          padding: '6px 12px', borderRadius: 8, border: '1.5px solid rgba(90,136,105,0.3)',
                          background: 'white', color: delta < 0 ? '#B03A1A' : '#2E7D52',
                          fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                          fontFamily: 'var(--font-body), Nunito, sans-serif',
                        }}>
                          {delta > 0 ? `+${delta}` : delta}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setEditandoMonto(true)} style={{ fontSize: '0.75rem', color: '#7A9A88', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body), Nunito, sans-serif', textDecoration: 'underline' }}>
                      Ingresar monto exacto
                    </button>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#5A8869', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Monto</label>
                    <input
                      className="g-input"
                      inputMode="decimal"
                      value={importe}
                      onChange={e => setModalLiquidar(prev => prev ? { ...prev, importe: e.target.value } : null)}
                      style={{ fontSize: '1.4rem', fontFamily: 'var(--font-code), monospace', textAlign: 'center', letterSpacing: '0.04em' }}
                    />
                  </div>
                )}
              </div>

              {/* Nota — colapsada por defecto */}
              {!notaAbierta ? (
                <button onClick={() => setNotaAbierta(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#A07060', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body), Nunito, sans-serif', marginBottom: '1rem', padding: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5v5M4 4.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/></svg>
                  Añadir nota (opcional)
                </button>
              ) : (
                <div className="g-field" style={{ marginBottom: '1rem' }}>
                  <label className="g-label">Nota (opcional)</label>
                  <input
                    className="g-input"
                    type="text"
                    placeholder="Ej: transferencia, efectivo..."
                    value={nota}
                    onChange={e => setModalLiquidar(prev => prev ? { ...prev, nota: e.target.value } : null)}
                  />
                </div>
              )}

              {/* Botón confirmar */}
              <button
                className="g-submit"
                style={{ background: '#5A8869' }}
                onClick={handleLiquidar}
                disabled={isSaving || importeNum <= 0}
              >
                {isSaving ? <><span className="g-spinner"/>Guardando...</> : <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5L5.5 10.5L11.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Confirmar pago de ${importeNum ? importeNum.toLocaleString('es-UY') : '0'}
                </>}
              </button>

            </div>
          </div>
        )
      })()}

      {/* ── MODAL: AÑADIR GASTO ── */}
      {modalOpen && (
        <div className="g-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="g-modal">
            <div className="g-modal-header">
              <div className="g-modal-title">{editandoId ? 'Editar gasto' : 'Añadir gasto'}</div>
              <button className="g-modal-close" onClick={() => setModalOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleGuardar}>

              {/* Descripción */}
              <div className="g-field">
                <label className="g-label">Descripción *</label>
                <input
                  className="g-input"
                  type="text"
                  placeholder="Ej: Alquiler marzo"
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  autoFocus
                  required
                />
              </div>

              {/* Modo de división */}
              <div className="g-field">
                <label className="g-label">¿Cómo se divide?</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setAutoSplit(true)}
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: 10, border: '1.5px solid',
                      borderColor: autoSplit ? '#C05A3B' : '#E0C8B8',
                      background: autoSplit ? 'rgba(192,90,59,0.08)' : 'white',
                      color: autoSplit ? '#C05A3B' : '#A07060',
                      cursor: 'pointer', fontFamily: 'var(--font-body), sans-serif',
                      fontSize: '0.82rem', fontWeight: 600, textAlign: 'left' as const, transition: 'all 0.18s',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Partes iguales</div>
                    <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>Se divide automáticamente</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoSplit(false)}
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: 10, border: '1.5px solid',
                      borderColor: !autoSplit ? '#C05A3B' : '#E0C8B8',
                      background: !autoSplit ? 'rgba(192,90,59,0.08)' : 'white',
                      color: !autoSplit ? '#C05A3B' : '#A07060',
                      cursor: 'pointer', fontFamily: 'var(--font-body), sans-serif',
                      fontSize: '0.82rem', fontWeight: 600, textAlign: 'left' as const, transition: 'all 0.18s',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Personalizado</div>
                    <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>Cada uno pone su parte</div>
                  </button>
                </div>
              </div>

              {/* Importe + división */}
              {miembros.length > 0 && (() => {
                const importeNum = parseFloat(form.importe) || 0
                const sumaSplits = miembros.reduce((s, m) => s + (parseFloat(customSplits[m.id] ?? '0') || 0), 0)
                const ok = importeNum > 0 && Math.abs(sumaSplits - importeNum) <= 0.5
                return (
                  <>
                    {autoSplit ? (
                      /* ── PARTES IGUALES ── */
                      <div className="g-field">
                        <label className="g-label">Total del gasto *</label>
                        <input
                          className="g-input"
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          min={1}
                          step="any"
                          value={form.importe}
                          onChange={e => setForm(f => ({ ...f, importe: e.target.value }))}
                          required
                        />
                        {importeNum > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                            {miembros.map(m => (
                              <div key={m.id} className="g-split-row">
                                <div className="g-split-av" style={{ background: m.color }}>
                                  {m.nombre[0].toUpperCase()}
                                </div>
                                <span className="g-split-name">{m.nombre}</span>
                                <span style={{ fontFamily: 'var(--font-code), monospace', fontSize: '0.9rem', fontWeight: 500, color: '#C05A3B' }}>
                                  {fmtUYU(Math.round(importeNum / miembros.length))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* ── PERSONALIZADO ── */
                      <div className="g-field">
                        <label className="g-label">¿Cuánto pone cada uno? *</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {miembros.map(m => {
                            const restante = importeNum > 0
                              ? importeNum - miembros.filter(x => x.id !== m.id).reduce((s, x) => s + (parseFloat(customSplits[x.id] ?? '0') || 0), 0)
                              : null
                            const valorActual = parseFloat(customSplits[m.id] ?? '0') || 0
                            const puedeCompletar = restante !== null && restante > 0 && Math.abs(valorActual - restante) > 0.5
                            return (
                              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="g-split-av" style={{ background: m.color }}>
                                  {m.nombre[0].toUpperCase()}
                                </div>
                                <span className="g-split-name">{m.nombre}</span>
                                {puedeCompletar && (
                                  <button
                                    type="button"
                                    onClick={() => setCustomSplits(prev => ({ ...prev, [m.id]: restante!.toFixed(2) }))}
                                    style={{
                                      padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(192,90,59,0.3)',
                                      background: 'rgba(192,90,59,0.08)', color: '#C05A3B',
                                      fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                                      fontFamily: 'var(--font-body), sans-serif', whiteSpace: 'nowrap' as const,
                                    }}
                                  >
                                    {fmtUYU(Math.round(restante!))} ↵
                                  </button>
                                )}
                                <input
                                  className="g-split-input"
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="any"
                                  placeholder="0"
                                  value={customSplits[m.id] ?? ''}
                                  onChange={e => setCustomSplits(prev => ({ ...prev, [m.id]: e.target.value }))}
                                />
                              </div>
                            )
                          })}
                        </div>
                        {/* Total de referencia opcional */}
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.75rem', color: '#A07060', whiteSpace: 'nowrap' as const }}>
                              Total a alcanzar:
                            </span>
                            <input
                              className="g-input"
                              type="number"
                              inputMode="decimal"
                              placeholder="opcional — para el botón completar"
                              min={0}
                              step="any"
                              value={form.importe}
                              onChange={e => setForm(f => ({ ...f, importe: e.target.value }))}
                              style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                            />
                          </div>
                          <div className="g-split-total">
                            <span style={{ color: '#A07060' }}>
                              Suma: <span style={{ color: ok ? '#2E7D52' : '#C05A3B', fontWeight: 700 }}>{fmtUYU(Math.round(sumaSplits))}</span>
                            </span>
                            <span style={{ color: ok ? '#2E7D52' : '#A07060' }}>
                              {ok ? '✓ Cuadra' : importeNum > 0 ? `Restante: ${fmtUYU(Math.round(importeNum - sumaSplits))}` : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}

              {/* Tipo */}
              <div className="g-field">
                <label className="g-label">Tipo</label>
                <div className="g-toggle-row">
                  <button
                    type="button"
                    className={`g-toggle-btn${form.tipo === 'fijo' ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, tipo: 'fijo' }))}
                  >
                    🔒 Fijo
                  </button>
                  <button
                    type="button"
                    className={`g-toggle-btn${form.tipo === 'variable' ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, tipo: 'variable' }))}
                  >
                    📊 Variable
                  </button>
                </div>
              </div>

              {/* ── ¿Quién pagó? (solo variable) ── */}
              {form.tipo === 'variable' && (
                <div className="g-field">
                  <label className="g-label">
                    ¿Quién pagó?
                    <span style={{ fontSize: '0.65rem', color: '#B09080', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
                      Sin seleccionar → no genera deuda
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, pagadoPor: null }))}
                      style={{
                        padding: '6px 12px', borderRadius: 9, border: '1.5px solid',
                        borderColor: form.pagadoPor === null ? '#C05A3B' : '#E0C8B8',
                        background: form.pagadoPor === null ? 'rgba(192,90,59,0.08)' : 'white',
                        color: form.pagadoPor === null ? '#C05A3B' : '#A07060',
                        fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'var(--font-body), Nunito, sans-serif', transition: 'all 0.15s',
                      }}
                    >
                      Ninguno
                    </button>
                    {miembros.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, pagadoPor: m.id }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 9, border: '1.5px solid',
                          borderColor: form.pagadoPor === m.id ? m.color : '#E0C8B8',
                          background: form.pagadoPor === m.id ? `${m.color}22` : 'white',
                          color: form.pagadoPor === m.id ? m.color : '#6B4030',
                          fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'var(--font-body), Nunito, sans-serif', transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', background: m.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.58rem', fontWeight: 700, color: 'white', flexShrink: 0,
                        }}>
                          {m.nombre[0].toUpperCase()}
                        </div>
                        {m.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Categoría */}
              <div className="g-field">
                <label className="g-label">Categoría</label>
                <div className="g-cat-grid">
                  {(Object.entries(CATEGORIA_META) as [Categoria, typeof CATEGORIA_META[Categoria]][]).map(([key, meta]) => (
                    <button
                      key={key}
                      type="button"
                      className={`g-cat-btn${form.categoria === key ? ' active' : ''}`}
                      style={form.categoria === key ? {
                        background: meta.bg,
                        borderColor: meta.border,
                        color: meta.color,
                      } : undefined}
                      onClick={() => setForm(f => ({ ...f, categoria: key }))}
                    >
                      <span className="g-cat-icon">{meta.icon}</span>
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha */}
              <div className="g-field">
                <label className="g-label">Fecha</label>
                <CalendarioPicker
                  value={form.fecha}
                  onChange={v => setForm(f => ({ ...f, fecha: v }))}
                />
              </div>

              {formError && (
                <div className="g-error">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6.5 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="6.5" cy="9" r="0.6" fill="currentColor" />
                  </svg>
                  {formError}
                </div>
              )}

              <div className="g-submit-wrap">
                <button type="submit" className="g-submit" disabled={guardando}>
                  {guardando && <span className="g-spinner" />}
                  {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Añadir gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
