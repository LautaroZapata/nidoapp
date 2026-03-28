'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito, DM_Mono } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { guardarActividad, notificarSala } from '@/lib/push'
import MemberAvatar from '@/components/MemberAvatar'
import { getSession } from '@/lib/session'
import type { Piso, VotoPiso, Miembro } from '@/lib/types'
import { fmtUYU } from '@/lib/format'
import { resolverVideoUrl, comprimirImagen, subirArchivoStorage } from '@/lib/pisos-utils'

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

type PisoConVotos = Piso & { votos: VotoPiso[]; promedio: number | null }

const FORM_INIT = { titulo: '', url: '', alquiler: '', gastosCom: '', m2: '', zona: '', notas: '', direccion: '' }

const SUPPORTED_SITES = [
  { pattern: /infocasas/i, label: 'InfoCasas' },
  { pattern: /mercadolibre/i, label: 'MercadoLibre' },
  { pattern: /veocasas/i, label: 'VeoCasas' },
  { pattern: /instagram\.com/i, label: 'Instagram' },
  { pattern: /facebook\.com|fb\.me|fb\.com/i, label: 'Facebook' },
]

function detectSupportedSite(url: string): string | null {
  if (!url.trim()) return null
  try { new URL(url) } catch { return null }
  for (const s of SUPPORTED_SITES) {
    if (s.pattern.test(url)) return s.label
  }
  // Any valid URL is worth trying
  if (/^https?:\/\/.+\..+/.test(url)) return 'sitio'
  return null
}


export default function PisosPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [session] = useState(getSession)
  const [pisos, setPisos] = useState<PisoConVotos[]>([])
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [fotosForm, setFotosForm] = useState<string[]>([''])
  const [videosForm, setVideosForm] = useState<string[]>([''])
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [formError, setFormError] = useState('')
  const [pisosPag, setPisosPag] = useState(12)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<'reciente' | 'nota' | 'precio'>('reciente')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRestored = useRef(false)
  const [masDetalles, setMasDetalles] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [scrapeMsg, setScrapeMsg] = useState('')
  const [scrapeDetected, setScrapeDetected] = useState<string | null>(null)

  const pisosVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    let lista = q
      ? pisos.filter(p =>
          p.titulo.toLowerCase().includes(q) ||
          (p.zona ?? '').toLowerCase().includes(q) ||
          (p.notas ?? '').toLowerCase().includes(q)
        )
      : [...pisos]
    if (orden === 'nota') {
      lista = lista.sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1))
    } else if (orden === 'precio') {
      lista = lista.sort((a, b) => {
        const totalA = (a.precio ?? 0) + (a.gastos_comunes ?? 0)
        const totalB = (b.precio ?? 0) + (b.gastos_comunes ?? 0)
        if (a.precio === null && a.gastos_comunes === null) return 1
        if (b.precio === null && b.gastos_comunes === null) return -1
        return totalA - totalB
      })
    }
    return lista
  }, [pisos, busqueda, orden])

  const cargarDatos = useCallback(async () => {
    if (!session) return
    const supabase = createClient()
    setLoading(true)
    const [{ data: pisosData }, { data: votosData }, { data: miembrosData }] = await Promise.all([
      supabase.from('pisos').select().eq('sala_id', session.salaId).order('creado_en', { ascending: false }),
      supabase.from('votos_piso').select(),
      supabase.from('miembros').select().eq('sala_id', session.salaId).not('user_id', 'is', null),
    ])
    if (miembrosData) setMiembros(miembrosData as Miembro[])
    const pisosConVotos: PisoConVotos[] = ((pisosData as Piso[]) ?? []).map((piso) => {
      const votos = ((votosData as VotoPiso[]) ?? []).filter((v) => v.piso_id === piso.id)
      const promedio = votos.length > 0 ? votos.reduce((s, v) => s + v.puntuacion, 0) / votos.length : null
      return { ...piso, votos, promedio }
    })
    setPisos(pisosConVotos)
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
    const chPisos = supabase
      .channel(`pisos_${session.salaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pisos', filter: `sala_id=eq.${session.salaId}` },
        () => cargarDatos()
      )
      .subscribe()
    const chVotos = supabase
      .channel(`votos_piso_${session.salaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votos_piso' },
        () => cargarDatos()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(chPisos)
      supabase.removeChannel(chVotos)
    }
  }, [session, cargarDatos])

  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [modalOpen])

  // Restaurar scroll position al volver de un apto
  useEffect(() => {
    if (!loading && !scrollRestored.current) {
      scrollRestored.current = true
      const saved = sessionStorage.getItem(`pisos-scroll-${codigo}`)
      if (saved) {
        sessionStorage.removeItem(`pisos-scroll-${codigo}`)
        requestAnimationFrame(() => window.scrollTo({ top: parseInt(saved, 10), behavior: 'instant' as ScrollBehavior }))
      }
    }
  }, [loading, codigo])

  async function handleSubirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setSubiendoFoto(true)
    const url = await subirArchivoStorage(session.salaId, file)
    if (url) {
      setFotosForm(prev => {
        const last = prev[prev.length - 1]
        if (last.trim() === '') {
          const next = [...prev]
          next[prev.length - 1] = url
          return next
        }
        return [...prev, url]
      })
    } else {
      setFormError('Error al subir la imagen. Verificá que el bucket "pisos" exista en Supabase Storage.')
    }
    setSubiendoFoto(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleScrapeUrl() {
    const url = form.url.trim()
    if (!url) return
    setScraping(true)
    setScrapeMsg('')
    setFormError('')
    try {
      const res = await fetch('/api/scrape-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) {
        setScrapeMsg(json.error || 'No se pudo extraer información')
        setScraping(false)
        return
      }
      const d = json.data
      // Auto-fill form with scraped data (don't overwrite non-empty fields)
      setForm(f => ({
        ...f,
        titulo: f.titulo || d.titulo || '',
        alquiler: f.alquiler || (d.precio != null ? String(d.precio) : ''),
        gastosCom: f.gastosCom || (d.gastosCom != null ? String(d.gastosCom) : ''),
        m2: f.m2 || (d.m2 != null ? String(d.m2) : ''),
        zona: f.zona || d.zona || '',
        direccion: f.direccion || d.direccion || '',
        notas: f.notas || buildNotas(d),
      }))

      // Compress and store photos in Supabase Storage
      let photoCount = 0
      if (d.fotos?.length > 0 && session) {
        setScrapeMsg('Importando y comprimiendo fotos...')
        try {
          const compressRes = await fetch('/api/compress-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: d.fotos, salaId: session.salaId }),
          })
          if (compressRes.ok) {
            const compressData = await compressRes.json()
            const storedUrls: string[] = compressData.urls
            photoCount = storedUrls.length
            setFotosForm(prev => {
              const existing = prev.filter(f => f.trim())
              const newPhotos = storedUrls.filter(f => !existing.includes(f))
              const merged = [...existing, ...newPhotos]
              return merged.length > 0 ? merged : ['']
            })
          } else {
            // Fallback: use original URLs
            photoCount = d.fotos.length
            setFotosForm(prev => {
              const existing = prev.filter(f => f.trim())
              const newPhotos = d.fotos.filter((f: string) => !existing.includes(f))
              const merged = [...existing, ...newPhotos]
              return merged.length > 0 ? merged : ['']
            })
          }
        } catch {
          // Fallback: use original URLs
          photoCount = d.fotos.length
          setFotosForm(prev => {
            const existing = prev.filter(f => f.trim())
            const newPhotos = d.fotos.filter((f: string) => !existing.includes(f))
            const merged = [...existing, ...newPhotos]
            return merged.length > 0 ? merged : ['']
          })
        }
      }

      // Open details section to show all filled fields
      setMasDetalles(true)

      const parts = []
      if (d.titulo) parts.push('título')
      if (d.precio != null) parts.push('precio')
      if (photoCount > 0) parts.push(`${photoCount} foto${photoCount > 1 ? 's' : ''}`)
      if (d.m2 != null) parts.push('m²')
      if (d.zona) parts.push('zona')
      if (d.gastosCom != null) parts.push('GC')
      if (d.dormitorios) parts.push(`${d.dormitorios} dorm`)
      if (d.moneda) parts.push(`(${d.moneda})`)
      setScrapeMsg(parts.length > 0 ? `Importado: ${parts.join(', ')}` : 'No se encontró información útil')
    } catch {
      setScrapeMsg('Error al conectar con el servidor')
    }
    setScraping(false)
  }

  function buildNotas(d: { notas?: string; dormitorios?: number; banos?: number; moneda?: string }): string {
    const parts: string[] = []
    if (d.dormitorios) parts.push(`${d.dormitorios} dormitorio${d.dormitorios > 1 ? 's' : ''}`)
    if (d.banos) parts.push(`${d.banos} baño${d.banos > 1 ? 's' : ''}`)
    if (d.moneda) parts.push(`Moneda: ${d.moneda}`)
    const header = parts.length > 0 ? parts.join(' · ') : ''
    if (d.notas && header) return `${header}\n${d.notas}`
    return d.notas || header
  }

  async function handleAñadir(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setGuardando(true)

    const alquiler = form.alquiler ? parseFloat(form.alquiler) : null
    const gastosCom = form.gastosCom ? parseFloat(form.gastosCom) : null

    const supabase = createClient()
    const fotos = fotosForm.map(f => f.trim()).filter(Boolean)
    const videos = await Promise.all(
      videosForm.map(v => v.trim()).filter(Boolean).map(v => resolverVideoUrl(v))
    )

    const { error } = await supabase.from('pisos').insert({
      sala_id: session!.salaId,
      titulo: form.titulo.trim(),
      url: form.url.trim() || null,
      precio: alquiler,
      gastos_comunes: gastosCom,
      m2: form.m2 ? parseFloat(form.m2) : null,
      zona: form.zona.trim() || null,
      notas: form.notas.trim() || null,
      direccion: form.direccion.trim() || null,
      fotos,
      videos,
    })

    if (error) {
      setFormError('Error al guardar el apto')
      setGuardando(false)
      return
    }
    const textoPiso = `Nuevo apto: ${form.titulo.trim()}`
    guardarActividad({ salaId: session!.salaId, texto: textoPiso, icono: '🏠', url: `/sala/${session!.salaCodigo}/pisos` })
    notificarSala({ salaId: session!.salaId, excluirMiembroId: session!.miembroId, titulo: '🏠 Nuevo apto', cuerpo: textoPiso, url: `/sala/${session!.salaCodigo}/pisos` })
    setForm(FORM_INIT)
    setFotosForm([''])
    setVideosForm([''])
    setModalOpen(false)
    setGuardando(false)
    cargarDatos()
  }

  function abrirModal() {
    setForm(FORM_INIT)
    setFotosForm([''])
    setVideosForm([''])
    setFormError('')
    setMasDetalles(false)
    setScraping(false)
    setScrapeMsg('')
    setScrapeDetected(null)
    setModalOpen(true)
  }

  const totalPreview =
    (form.alquiler ? parseFloat(form.alquiler) : 0) +
    (form.gastosCom ? parseFloat(form.gastosCom) : 0)

  if (!session) return null

  return (
    <div className={`${fraunces.variable} ${nunito.variable} ${dmMono.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes p-spin   { to { transform: rotate(360deg); } }
        @keyframes p-fadeup { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes p-in     { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes p-card   { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes p-modal  { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes p-overlay{ from { opacity: 0; } to { opacity: 1; } }
        @keyframes p-shimmer{ from { background-position: -200% 0; } to { background-position: 200% 0; } }

        .p-root {
          min-height: 100vh;
          background: #FAF5EE;
          font-family: var(--font-body), 'Nunito', system-ui, sans-serif;
          color: #2A1A0E;
          position: relative;
        }
        .p-bg {
          position: fixed; inset: 0;
          background-image: radial-gradient(circle at 10% 15%, rgba(192,90,59,0.05) 0%, transparent 40%),
            radial-gradient(circle at 90% 85%, rgba(90,136,105,0.04) 0%, transparent 40%);
          pointer-events: none; z-index: 0;
        }
        .p-wrap {
          position: relative; z-index: 1;
          max-width: 900px; margin: 0 auto; padding: 0 1.5rem 5rem;
        }
        @media (min-width: 1024px) {
          .p-wrap { max-width: none; padding: 0 2.5rem 5rem; display: grid; grid-template-columns: 240px 1fr; column-gap: 2rem; align-items: start; }
          .p-header { grid-column: 1 / -1; }
          .p-sidebar { grid-column: 1; grid-row: 2 / span 10; position: sticky; top: 1.5rem; align-self: start; display: flex; flex-direction: column; gap: 0.75rem; }
          .p-stats { grid-column: unset; flex-direction: column; gap: 0.75rem; margin-bottom: 0; position: static; }
          .p-stat { flex: none; min-width: 0; }
          .p-filter-bar { grid-column: unset; flex-direction: column; gap: 6px; margin-top: 0; margin-bottom: 0; }
          .p-search { width: 100%; }
          .p-sort-group { flex-direction: column; width: 100%; }
          .p-sort-btn { width: 100%; text-align: left; border-radius: 10px; }
          .p-main-col { grid-column: 2; grid-row: 2 / span 10; min-width: 0; }
          .p-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
        }
        @media (min-width: 1280px) {
          .p-wrap { max-width: 1380px; margin: 0 auto; padding: 0 3rem 5rem; grid-template-columns: 260px 1fr; column-gap: 2.5rem; }
          .p-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        }
        @media (min-width: 1536px) {
          .p-wrap { max-width: 1560px; padding: 0 4rem 5rem; grid-template-columns: 280px 1fr; column-gap: 3rem; }
          .p-grid { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
        }

        .p-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.75rem 0 2rem;
          animation: p-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .p-header-left { display: flex; align-items: center; gap: 1rem; }
        .p-back {
          width: 36px; height: 36px; border-radius: 10px;
          background: white; border: 1.5px solid #E8D5C0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.18s, border-color 0.18s;
          color: #A07060; box-shadow: 0 1px 4px rgba(150,80,40,0.08);
        }
        .p-back:hover { background: #FFF5EE; border-color: #C05A3B; color: #C05A3B; }
        .p-header-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; color: #2A1A0E;
        }
        .p-header-sub { font-size: 0.75rem; color: #A07060; font-weight: 400; margin-top: 1px; }
        .p-header-right { display: flex; align-items: center; gap: 10px; }
        .p-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.8rem; font-weight: 700; color: white;
          border: 2px solid rgba(255,255,255,0.6);
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }
        .p-add-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 18px; background: #C05A3B; color: white; border: none;
          border-radius: 12px; font-size: 0.83rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
        }
        .p-add-btn:hover { background: #A04730; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(192,90,59,0.35); }
        .p-add-btn:active { transform: translateY(0); }

        .p-stats {
          display: flex; gap: 1rem; margin-bottom: 1.75rem;
          animation: p-fadeup 0.5s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .p-stat {
          flex: 1; background: white;
          border: 1.5px solid #EAD8C8;
          border-radius: 16px; padding: 1rem 1.25rem;
          display: flex; flex-direction: column; gap: 3px;
          box-shadow: 0 2px 8px rgba(150,80,40,0.06);
        }
        .p-stat-val { font-family: var(--font-serif), serif; font-size: 1.6rem; color: #2A1A0E; letter-spacing: -0.03em; font-weight: 600; }
        .p-stat-label { font-size: 0.7rem; color: #B09080; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }

        .p-skeleton {
          background: linear-gradient(90deg, #F0E8DF 25%, #E8DDD4 50%, #F0E8DF 75%);
          background-size: 200% 100%; animation: p-shimmer 1.5s infinite; border-radius: 10px;
        }

        .p-empty { text-align: center; padding: 5rem 2rem; animation: p-fadeup 0.5s 0.2s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .p-empty-icon {
          width: 72px; height: 72px; margin: 0 auto 1.5rem; border-radius: 20px;
          background: rgba(192,90,59,0.1); border: 1.5px solid rgba(192,90,59,0.2);
          display: flex; align-items: center; justify-content: center;
        }
        .p-empty-title { font-family: var(--font-serif), serif; font-size: 1.6rem; color: #2A1A0E; letter-spacing: -0.025em; margin-bottom: 0.5rem; font-weight: 600; }
        .p-empty-sub { font-size: 0.85rem; color: #A07060; font-weight: 400; line-height: 1.6; }

        .p-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }

        .p-card {
          background: white; border: 1.5px solid #EAD8C8;
          border-radius: 20px; padding: 1.4rem; cursor: pointer;
          transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
          position: relative; overflow: hidden;
          animation: p-card 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
          display: flex; flex-direction: column;
          box-shadow: 0 2px 12px rgba(150,80,40,0.07);
        }
        .p-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #C05A3B, #C8823A);
          opacity: 0; transition: opacity 0.2s;
        }
        .p-card:hover { background: #FFFAF5; border-color: #D4B8A0; transform: translateY(-3px); box-shadow: 0 12px 32px rgba(150,80,40,0.12); }
        .p-card:hover::before { opacity: 1; }
        .p-card:active { transform: translateY(-1px); }

        .p-card-cover {
          width: 100%; height: 140px; border-radius: 12px; overflow: hidden;
          margin-bottom: 1rem; background: #F0E8DF;
          border: 1px solid #EAD8C8; flex-shrink: 0;
        }
        .p-card-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .p-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.85rem; }
        .p-card-title { font-family: var(--font-serif), serif; font-size: 1.05rem; color: #2A1A0E; letter-spacing: -0.02em; line-height: 1.3; flex: 1; font-weight: 600; }
        .p-card-score { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
        .p-score-num { font-family: var(--font-code), monospace; font-size: 1.1rem; font-weight: 500; color: #C8823A; line-height: 1; }
        .p-score-empty { font-size: 0.7rem; color: #C0A898; }
        .p-stars { display: flex; gap: 2px; }

        .p-card-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 0.85rem; }
        .p-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; border: 1px solid; }
        .p-badge-price { background: rgba(46,125,82,0.1); border-color: rgba(46,125,82,0.2); color: #2E7D52; }
        .p-badge-m2    { background: rgba(192,90,59,0.1); border-color: rgba(192,90,59,0.2); color: #C05A3B; }
        .p-badge-zona  { background: rgba(200,130,58,0.1); border-color: rgba(200,130,58,0.2); color: #9A6020; }

        .p-card-notes {
          font-size: 0.79rem; color: #A07060; font-weight: 400; line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
          margin-top: auto; padding-top: 0.7rem; border-top: 1px solid #EAD8C8;
        }
        .p-card-footer {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 0.85rem; padding-top: 0.7rem; border-top: 1px solid #EAD8C8;
        }
        .p-votes-row { display: flex; align-items: center; gap: 6px; }
        .p-votes-avatars { display: flex; }
        .p-votes-av {
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.6rem; font-weight: 700; color: white;
          border: 1.5px solid white; margin-right: -5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .p-votes-count { font-size: 0.72rem; color: #A07060; margin-left: 10px; }
        .p-card-arrow { color: #C05A3B; transition: color 0.18s, transform 0.18s; opacity: 0.5; }
        .p-card:hover .p-card-arrow { opacity: 1; transform: translateX(3px); }

        .p-overlay {
          position: fixed; inset: 0; background: rgba(42,26,14,0.5);
          backdrop-filter: blur(6px); z-index: 300;
          display: flex; align-items: center; justify-content: center;
          padding: 1rem;
          animation: p-overlay 0.2s ease both;
        }

        .p-modal {
          background: #FFF8F2; border: 1.5px solid #EAD8C8;
          border-radius: 20px; width: 100%; max-width: 520px;
          padding: 2rem 2rem 0; animation: p-modal 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
          max-height: 88vh; overflow-y: auto;
          overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
          box-shadow: 0 20px 60px rgba(150,80,40,0.15);
          display: flex; flex-direction: column;
        }
        .p-modal form { flex: 1; display: flex; flex-direction: column; min-height: 0; }
        .p-submit-wrap {
          position: sticky; bottom: 0;
          background: #FFF8F2;
          padding: 0.75rem 0 max(1rem, env(safe-area-inset-bottom, 1rem));
          margin-top: auto;
        }

        .p-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.75rem; }
        .p-modal-title { font-family: var(--font-serif), serif; font-size: 1.5rem; color: #2A1A0E; letter-spacing: -0.025em; font-weight: 600; }
        .p-modal-close {
          width: 32px; height: 32px; border-radius: 8px;
          background: #F0E8DF; border: 1px solid #E0C8B8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #A07060; transition: background 0.18s, color 0.18s;
        }
        .p-modal-close:hover { background: #E8D0C0; color: #2A1A0E; }

        .p-field { margin-bottom: 1rem; }
        .p-label { display: block; font-size: 0.68rem; font-weight: 700; color: #8A6050; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 5px; }
        .p-label-hint { font-size: 0.68rem; color: #B09080; font-weight: 400; text-transform: none; letter-spacing: 0; margin-left: 5px; }
        .p-input {
          width: 100%; padding: 10px 13px;
          background: white; border: 1.5px solid #E0C8B8;
          border-radius: 10px; font-size: 0.88rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .p-input::placeholder { color: #C8B0A0; }
        .p-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.12); }
        .p-textarea { resize: vertical; min-height: 72px; }
        .p-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

        .p-precio-total {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; border-radius: 9px;
          background: rgba(46,125,82,0.08); border: 1px solid rgba(46,125,82,0.15);
          margin-top: 6px;
        }
        .p-precio-total-label { font-size: 0.72rem; color: #3A7050; }
        .p-precio-total-val { font-family: var(--font-code), monospace; font-size: 0.95rem; font-weight: 500; color: #2E7D52; }

        .p-error {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 13px; background: #FFF0EC;
          border: 1px solid #F0C0B0; border-radius: 9px;
          color: #B03A1A; font-size: 0.81rem; margin-bottom: 1rem;
        }
        .p-submit {
          width: 100%; padding: 13px; background: #C05A3B; color: white; border: none;
          border-radius: 13px; font-size: 0.9rem; font-weight: 700;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 0.5rem;
        }
        .p-submit:hover:not(:disabled) { background: #A04730; transform: translateY(-1.5px); box-shadow: 0 10px 28px rgba(192,90,59,0.35); }
        .p-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .p-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; animation: p-spin 0.7s linear infinite; flex-shrink: 0; }

        .p-scrape-wrap {
          margin-top: 8px;
          animation: p-fadeup 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .p-scrape-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 14px; background: rgba(192,90,59,0.07);
          border: 1.5px solid rgba(192,90,59,0.2); color: #C05A3B;
          border-radius: 10px; font-size: 0.8rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: background 0.18s, border-color 0.18s, transform 0.15s, box-shadow 0.18s;
          width: 100%;
          justify-content: center;
        }
        .p-scrape-btn:hover { background: rgba(192,90,59,0.13); border-color: rgba(192,90,59,0.35); transform: translateY(-1px); box-shadow: 0 4px 14px rgba(192,90,59,0.12); }
        .p-scrape-btn:active { transform: translateY(0); box-shadow: none; }
        .p-scrape-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .p-scrape-btn svg { flex-shrink: 0; }
        .p-scrape-loading {
          display: flex; align-items: center; justify-content: center; gap: 9px;
          padding: 10px 14px;
          background: rgba(192,90,59,0.05);
          border: 1.5px solid rgba(192,90,59,0.12);
          border-radius: 10px;
          font-size: 0.8rem; color: #A07060;
          font-family: var(--font-body), 'Nunito', sans-serif;
          animation: p-fadeup 0.2s ease both;
        }
        .p-scrape-loading .p-scrape-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid #E8D0C0; border-top-color: #C05A3B;
          animation: p-spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        .p-scrape-feedback {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 10px 13px; border-radius: 10px;
          font-size: 0.78rem; line-height: 1.45;
          font-family: var(--font-body), 'Nunito', sans-serif;
          animation: p-fadeup 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .p-scrape-feedback svg { flex-shrink: 0; margin-top: 1px; }
        .p-scrape-feedback.success {
          background: rgba(46,125,82,0.08); border: 1px solid rgba(46,125,82,0.18);
          color: #2E7D52;
        }
        .p-scrape-feedback.error {
          background: rgba(176,96,48,0.08); border: 1px solid rgba(176,96,48,0.18);
          color: #B06030;
        }
        .p-scrape-feedback .p-scrape-retry {
          margin-left: auto; flex-shrink: 0;
          background: none; border: none; color: #C05A3B;
          font-size: 0.75rem; font-weight: 600; cursor: pointer;
          font-family: var(--font-body), 'Nunito', sans-serif;
          text-decoration: underline; text-underline-offset: 2px;
          padding: 0;
        }
        .p-scrape-feedback .p-scrape-retry:hover { color: #A04730; }
        @media (min-width: 480px) {
          .p-scrape-btn { width: auto; }
        }

        .p-upload-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 7px 12px; background: rgba(90,136,105,0.1);
          border: 1.5px solid rgba(90,136,105,0.25); color: #3A7050;
          border-radius: 8px; font-size: 0.78rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: background 0.15s, border-color 0.15s;
          white-space: nowrap; flex-shrink: 0;
        }
        .p-upload-btn:hover:not(:disabled) { background: rgba(90,136,105,0.18); border-color: rgba(90,136,105,0.4); }
        .p-upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .p-foto-preview-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
          gap: 6px; margin-top: 10px; max-width: 100%;
        }
        .p-foto-preview-item {
          aspect-ratio: 1; border-radius: 8px; overflow: hidden;
          background: #F0E8DF; border: 1px solid #EAD8C8;
        }
        .p-foto-preview-item img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }

        .p-section-sep {
          display: flex; align-items: center; gap: 8px; margin: 1.25rem 0 1rem;
        }
        .p-section-sep-line { flex: 1; height: 1px; background: #EAD8C8; }
        .p-section-sep-label { font-size: 0.65rem; font-weight: 700; color: #B09080; text-transform: uppercase; letter-spacing: 0.09em; white-space: nowrap; }

        @media (max-width: 640px) {
          .p-wrap { padding: 0 1rem 5rem; }
          .p-header { padding: 1.25rem 0 1.5rem; }
          .p-header-title { font-size: 1.15rem; }
          .p-header-right { gap: 7px; }
          .p-add-text { display: none; }
          .p-add-btn { padding: 9px; border-radius: 10px; }
          .p-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; overflow: visible; }
          .p-stat:last-child { grid-column: 1 / 3; }
          .p-stat { padding: 0.8rem 1rem; }
          .p-stat-val { font-size: 1.2rem; }
          .p-grid { grid-template-columns: 1fr; gap: 0.75rem; }
          .p-modal { padding: 1.5rem 1.25rem 0; }
          .p-modal-title { font-size: 1.25rem; }
          .p-scrape-btn { font-size: 0.78rem; padding: 10px 12px; }
          .p-scrape-loading { font-size: 0.78rem; padding: 10px 12px; }
          .p-scrape-feedback { font-size: 0.76rem; padding: 9px 11px; }
          .p-foto-preview-grid { grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 5px; }
        }
        @media (max-width: 420px) {
          .p-wrap { padding: 0 0.75rem 5rem; }
          .p-stat { padding: 0.7rem 0.85rem; }
          .p-stat-val { font-size: 1.05rem; }
        }

        .p-filter-bar {
          display: flex; align-items: center; gap: 8px;
          margin-top: 1rem; margin-bottom: 1rem; flex-wrap: wrap;
        }
        .p-search {
          flex: 1; min-width: 160px;
          display: flex; align-items: center; gap: 7px;
          padding: 10px 12px; background: white;
          border: 1.5px solid #E0C8B8; border-radius: 11px;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .p-search:focus-within { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.10); }
        .p-search svg { flex-shrink: 0; color: #B09080; }
        .p-search input {
          flex: 1; border: none; outline: none; background: transparent;
          font-size: 1rem; font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; min-width: 0;
        }
        .p-search input::placeholder { color: #C0A898; }
        .p-sort-group { display: flex; gap: 4px; flex-shrink: 0; }
        .p-sort-btn {
          padding: 9px 13px; border-radius: 9px;
          border: 1.5px solid #E0C8B8; background: white;
          font-size: 0.75rem; font-weight: 700; color: #A07060;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .p-sort-btn:hover { border-color: #C05A3B; color: #C05A3B; background: #FFF5F0; }
        .p-sort-btn.active { background: #C05A3B; border-color: #C05A3B; color: white; }
        .p-no-results {
          text-align: center; padding: 3rem 1rem;
          color: #B09080; font-size: 0.88rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
        }
        @media (max-width: 520px) {
          .p-filter-bar { gap: 6px; }
          .p-sort-group { width: 100%; }
          .p-sort-btn { flex: 1; padding: 9px 6px; font-size: 0.72rem; text-align: center; }
        }
        @media (max-width: 420px) {
          .p-grid { grid-template-columns: 1fr; }
          .p-modal { padding: 1.25rem 1rem 0; }
          .p-label { font-size: 0.72rem; }
          .p-row2 { grid-template-columns: 1fr; }
          .p-sort-btn { padding: 10px 8px; }
          .p-search { min-width: 120px; }
        }
      `}</style>

      <div className="p-root">
        <div className="p-bg" />

        <div className="p-wrap">

          {/* ── HEADER ── */}
          <div className="p-header">
            <div className="p-header-left">
              <button className="p-back" onClick={() => router.push(`/sala/${codigo}`)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div>
                <div className="p-header-title">Aptos</div>
                <div className="p-header-sub">{session.salaNombre}</div>
              </div>
            </div>
            <div className="p-header-right">
              <MemberAvatar nombre={session.miembroNombre} color={session.miembroColor} fotoUrl={session.miembroFotoUrl} icono={session.miembroIcono} size="md" className="p-avatar" />
              <button className="p-add-btn" onClick={abrirModal}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span className="p-add-text">Añadir apto</span>
              </button>
            </div>
          </div>

          {/* ── SIDEBAR (Stats + Filtros) — en md+ queda sticky juntos ── */}
          <div className="p-sidebar">
            {/* ── STATS ── */}
            {!loading && (
              <div className="p-stats">
                <div className="p-stat">
                  <div className="p-stat-val">{pisos.length}</div>
                  <div className="p-stat-label">Aptos</div>
                </div>
                <div className="p-stat">
                  <div className="p-stat-val">
                    {pisos.filter(p => p.promedio !== null).length > 0
                      ? (pisos.filter(p => p.promedio !== null).reduce((s, p) => s + p.promedio!, 0) / pisos.filter(p => p.promedio !== null).length).toFixed(1)
                      : '—'}
                  </div>
                  <div className="p-stat-label">Nota media</div>
                </div>
                <div className="p-stat">
                  <div className="p-stat-val" style={{ fontSize: '1.1rem' }}>
                    {pisos.filter(p => p.precio !== null).length > 0
                      ? fmtUYU(Math.min(...pisos.filter(p => p.precio !== null).map(p => p.precio!)))
                      : '—'}
                  </div>
                  <div className="p-stat-label">Precio mínimo</div>
                </div>
                <div className="p-stat">
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    {miembros.map(m => (
                      <MemberAvatar key={m.id} nombre={m.nombre} color={m.color} fotoUrl={m.foto_url} icono={m.icono} size="sm" style={{ width: 26, height: 26 }} />
                    ))}
                  </div>
                  <div className="p-stat-label">{miembros.length} miembros</div>
                </div>
              </div>
            )}

            {/* ── FILTROS ── */}
            {!loading && pisos.length > 0 && (
              <div className="p-filter-bar">
                <div className="p-search">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Buscar por título, zona..."
                    value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setPisosPag(12) }}
                  />
                  {busqueda && (
                    <button
                      onClick={() => { setBusqueda(''); setPisosPag(12) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B09080', padding: 0, lineHeight: 1, fontSize: '1rem' }}
                    >×</button>
                  )}
                </div>
                <div className="p-sort-group">
                  {(['reciente', 'nota', 'precio'] as const).map(o => (
                    <button
                      key={o}
                      className={`p-sort-btn${orden === o ? ' active' : ''}`}
                      onClick={() => { setOrden(o); setPisosPag(12) }}
                    >
                      {o === 'reciente' ? 'Reciente' : o === 'nota' ? '★ Nota' : '$ Precio'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-main-col">
          {/* ── LOADING ── */}
          {loading && (
            <div className="p-grid">
              {[1, 2, 3].map(i => (
                <div key={i} style={{ borderRadius: 20, padding: '1.4rem', border: '1.5px solid #EAD8C8', background: 'white' }}>
                  <div className="p-skeleton" style={{ height: 18, width: '70%', marginBottom: 12 }} />
                  <div className="p-skeleton" style={{ height: 14, width: '45%', marginBottom: 8 }} />
                  <div className="p-skeleton" style={{ height: 14, width: '60%' }} />
                </div>
              ))}
            </div>
          )}

          {/* ── EMPTY ── */}
          {!loading && pisos.length === 0 && (
            <div className="p-empty">
              <div className="p-empty-icon">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M16 4L4 13V28H12V20H20V28H28V13L16 4Z" stroke="#C05A3B" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="p-empty-title">Aún no hay aptos</div>
              <p className="p-empty-sub">Añadí el primero con el botón de arriba.<br />Pueden votar y comparar todos juntos.</p>
            </div>
          )}

          {/* ── SIN RESULTADOS ── */}
          {!loading && pisos.length > 0 && pisosVisibles.length === 0 && (
            <div className="p-no-results">
              Sin resultados para <strong>"{busqueda}"</strong>
            </div>
          )}

          {/* ── GRID ── */}
          {!loading && pisosVisibles.length > 0 && (
            <>
            <div className="p-grid">
              {pisosVisibles.slice(0, pisosPag).map((piso, idx) => (
                <div
                  key={piso.id}
                  className="p-card"
                  style={{ animationDelay: `${idx * 0.07}s` }}
                  onClick={() => {
                    sessionStorage.setItem(`pisos-scroll-${codigo}`, String(window.scrollY))
                    router.push(`/sala/${codigo}/pisos/${piso.id}`)
                  }}
                >
                  {piso.fotos?.[0] && (
                    <div className="p-card-cover">
                      <img src={piso.fotos[0]} alt={piso.titulo} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
                    </div>
                  )}

                  <div className="p-card-top">
                    <div className="p-card-title">{piso.titulo}</div>
                    <div className="p-card-score">
                      {piso.promedio !== null ? (
                        <>
                          <div className="p-score-num">{piso.promedio.toFixed(1)}</div>
                          <Stars score={piso.promedio} size={10} />
                        </>
                      ) : (
                        <div className="p-score-empty">Sin votos</div>
                      )}
                    </div>
                  </div>

                  <div className="p-card-meta">
                    {(piso.precio !== null || piso.gastos_comunes !== null) && (
                      <span className="p-badge p-badge-price">
                        {piso.precio !== null && piso.gastos_comunes !== null
                          ? `${fmtUYU(piso.precio + piso.gastos_comunes)}/mes`
                          : piso.precio !== null
                            ? `${fmtUYU(piso.precio)}/mes`
                            : `GC ${fmtUYU(piso.gastos_comunes!)}/mes`}
                      </span>
                    )}
                    {piso.m2 !== null && (
                      <span className="p-badge p-badge-m2">{piso.m2} m²</span>
                    )}
                    {piso.zona && (
                      <span className="p-badge p-badge-zona">
                        <svg width="7" height="8" viewBox="0 0 8 9" fill="currentColor">
                          <path d="M4 0C2.34 0 1 1.34 1 3c0 2.25 3 6 3 6s3-3.75 3-6c0-1.66-1.34-3-3-3zm0 4.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                        </svg>
                        {piso.zona}
                      </span>
                    )}
                    {piso.videos?.length > 0 && (
                      <span className="p-badge" style={{ background: 'rgba(0,0,0,0.06)', borderColor: 'rgba(0,0,0,0.12)', color: '#555' }}>
                        ▶ {piso.videos.length} video{piso.videos.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {piso.notas && <div className="p-card-notes">{piso.notas}</div>}

                  <div className="p-card-footer">
                    <div className="p-votes-row">
                      <div className="p-votes-avatars">
                        {piso.votos.map(v => {
                          const m = miembros.find(mb => mb.id === v.miembro_id)
                          return m ? (
                            <MemberAvatar key={v.id} nombre={m.nombre} color={m.color} fotoUrl={m.foto_url} icono={m.icono} size="sm" style={{ width: 22, height: 22 }} />
                          ) : null
                        })}
                      </div>
                      <span className="p-votes-count">
                        {piso.votos.length === 0 ? 'Sin votos' : `${piso.votos.length} voto${piso.votos.length > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <svg className="p-card-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
            {pisosVisibles.length > pisosPag && (
              <button
                onClick={() => setPisosPag(p => p + 12)}
                style={{
                  display: 'block', width: '100%', marginTop: '1rem',
                  padding: '11px', borderRadius: 14,
                  background: 'white', border: '1.5px dashed #D4B8A0',
                  color: '#A07060', fontSize: '0.82rem', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-body), Nunito, sans-serif',
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FFF5EE'; (e.currentTarget as HTMLElement).style.color = '#C05A3B'; (e.currentTarget as HTMLElement).style.borderColor = '#C05A3B' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white'; (e.currentTarget as HTMLElement).style.color = '#A07060'; (e.currentTarget as HTMLElement).style.borderColor = '#D4B8A0' }}
              >
                Ver más ({pisosVisibles.length - pisosPag} aptos restantes)
              </button>
            )}
            </>
          )}

          </div>{/* end p-main-col */}

        </div>
      </div>

      {/* ── MODAL ── */}
      {modalOpen && (
        <div className="p-overlay">
          <div className="p-modal">
            <div className="p-modal-header">
              <div className="p-modal-title">Añadir apto</div>
              <button className="p-modal-close" onClick={() => setModalOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAñadir}>
              {/* URL first — so import fills the rest */}
              <div className="p-field">
                <label className="p-label">
                  URL del anuncio
                  <span className="p-label-hint"> — pegá un link para importar datos</span>
                </label>
                <input
                  className="p-input"
                  type="url"
                  placeholder="https://infocasas.com.uy/..."
                  value={form.url}
                  autoFocus
                  onChange={e => {
                    const val = e.target.value
                    setForm(f => ({ ...f, url: val }))
                    setScrapeDetected(detectSupportedSite(val))
                    setScrapeMsg('')
                  }}
                />
                {/* ── Scrape controls ── */}
                {(scrapeDetected || scraping || scrapeMsg) && (
                  <div className="p-scrape-wrap">
                    {scrapeDetected && !scraping && !scrapeMsg.startsWith('Importado') && (
                      <button
                        type="button"
                        onClick={handleScrapeUrl}
                        disabled={scraping}
                        className="p-scrape-btn"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M14 8A6 6 0 104.5 12.96" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M10 8l4 0 0-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Importar datos de {scrapeDetected}
                      </button>
                    )}
                    {scraping && (
                      <div className="p-scrape-loading">
                        <span className="p-scrape-spinner" />
                        Extrayendo datos del enlace...
                      </div>
                    )}
                    {scrapeMsg && !scraping && (
                      <div className={`p-scrape-feedback ${scrapeMsg.startsWith('Importado') ? 'success' : 'error'}`}>
                        {scrapeMsg.startsWith('Importado') ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                            <path d="M4 7.2l2.2 2.2L10 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                            <path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                            <circle cx="7" cy="10" r="0.6" fill="currentColor"/>
                          </svg>
                        )}
                        <span>{scrapeMsg}</span>
                        {!scrapeMsg.startsWith('Importado') && scrapeDetected && (
                          <button type="button" className="p-scrape-retry" onClick={handleScrapeUrl}>Reintentar</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-field">
                <label className="p-label">Nombre / Título *</label>
                <input className="p-input" type="text" placeholder="Ej: Apto Pocitos 3 dorm" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} required />
              </div>

              {/* Más detalles toggle */}
              <button
                type="button"
                onClick={() => setMasDetalles(v => !v)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 10,
                  border: '1.5px dashed #E0C8B8', background: 'transparent',
                  color: '#A07060', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                  fontFamily: 'var(--font-body), Nunito, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  marginBottom: '0.75rem', transition: 'all 0.18s',
                }}
              >
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', display: 'inline-block', transform: masDetalles ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                {masDetalles ? 'Menos detalles' : 'Más detalles (fotos, zona, dirección, notas, videos)'}
              </button>

              {masDetalles && <>

              {/* ── FOTOS ── */}
              <div className="p-field">
                <label className="p-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Fotos</span>
                  <button
                    type="button"
                    className="p-upload-btn"
                    disabled={subiendoFoto}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {subiendoFoto ? (
                      <span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid rgba(58,112,80,0.3)', borderTopColor: '#3A7050', animation: 'p-spin 0.7s linear infinite', display: 'inline-block' }} />
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M5.5 1v7M2 5l3.5-4L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {subiendoFoto ? 'Subiendo...' : 'Subir desde dispositivo'}
                  </button>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleSubirFoto}
                />
                {/* Show URL inputs: max 3 visible, rest collapsed */}
                {fotosForm.slice(0, fotosForm.filter(f => f.trim()).length > 3 ? 1 : fotosForm.length).map((url, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="p-input"
                      type="url"
                      placeholder="https://... o pegar URL"
                      value={url}
                      onChange={e => {
                        const next = [...fotosForm]
                        next[idx] = e.target.value
                        setFotosForm(next)
                      }}
                      style={{ flex: 1 }}
                    />
                    {fotosForm.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFotosForm(f => f.filter((_, i) => i !== idx))}
                        style={{ padding: '0 10px', background: 'none', border: '1.5px solid #E0C8B8', borderRadius: 10, color: '#A07060', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
                      >×</button>
                    )}
                  </div>
                ))}
                {fotosForm.filter(f => f.trim()).length > 3 && (
                  <div style={{ fontSize: '0.75rem', color: '#A07060', padding: '2px 0 4px', fontWeight: 500 }}>
                    {fotosForm.filter(f => f.trim()).length} fotos importadas
                    <button
                      type="button"
                      onClick={() => setFotosForm([''])}
                      style={{ marginLeft: 8, fontSize: '0.72rem', color: '#C05A3B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body), Nunito, sans-serif', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    >Limpiar todas</button>
                  </div>
                )}
                {(fotosForm.filter(f => f.trim()).length <= 3 && fotosForm[fotosForm.length - 1].trim()) && (
                  <button
                    type="button"
                    onClick={() => setFotosForm(f => [...f, ''])}
                    style={{ fontSize: '0.78rem', color: '#C05A3B', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0', fontFamily: 'var(--font-body), Nunito, sans-serif', fontWeight: 600 }}
                  >+ Añadir otra foto</button>
                )}
                {fotosForm.some(f => f.trim()) && (
                  <div className="p-foto-preview-grid">
                    {fotosForm.filter(f => f.trim()).slice(0, 8).map((f, i) => (
                      <div key={i} className="p-foto-preview-item">
                        <img src={f} alt={`preview ${i+1}`} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    ))}
                    {fotosForm.filter(f => f.trim()).length > 8 && (
                      <div className="p-foto-preview-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EAD8C8', color: '#8A6050', fontSize: '0.75rem', fontWeight: 700 }}>
                        +{fotosForm.filter(f => f.trim()).length - 8}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-row2">
                <div className="p-field">
                  <label className="p-label">Alquiler <span className="p-label-hint">($ UYU)</span></label>
                  <input className="p-input" type="number" inputMode="decimal" placeholder="25000" min={0} value={form.alquiler} onChange={e => setForm(f => ({ ...f, alquiler: e.target.value }))} />
                </div>
                <div className="p-field">
                  <label className="p-label">Gastos comunes <span className="p-label-hint">($ UYU)</span></label>
                  <input className="p-input" type="number" inputMode="decimal" placeholder="3000" min={0} value={form.gastosCom} onChange={e => setForm(f => ({ ...f, gastosCom: e.target.value }))} />
                </div>
              </div>

              {(form.alquiler || form.gastosCom) && totalPreview > 0 && (
                <div className="p-precio-total" style={{ marginTop: -6, marginBottom: 14 }}>
                  <span className="p-precio-total-label">Total mensual:</span>
                  <span className="p-precio-total-val">{fmtUYU(totalPreview)}</span>
                  {form.alquiler && form.gastosCom && (
                    <span style={{ fontSize: '0.68rem', color: '#5A8869', marginLeft: 'auto', opacity: 0.7 }}>
                      {fmtUYU(parseFloat(form.alquiler))} + {fmtUYU(parseFloat(form.gastosCom))} GC
                    </span>
                  )}
                </div>
              )}

              <div className="p-row2">
                <div className="p-field">
                  <label className="p-label">Metros cuadrados</label>
                  <input className="p-input" type="number" inputMode="numeric" placeholder="75" min={0} value={form.m2} onChange={e => setForm(f => ({ ...f, m2: e.target.value }))} />
                </div>
                <div className="p-field">
                  <label className="p-label">Zona / Barrio</label>
                  <input className="p-input" type="text" placeholder="Ej: Pocitos" value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} />
                </div>
              </div>

              {/* ── DIRECCIÓN ── */}
              <div className="p-field">
                <label className="p-label">
                  Dirección
                  <span className="p-label-hint"> — se mostrará en el mapa</span>
                </label>
                <input
                  className="p-input"
                  type="text"
                  placeholder="Ej: Av. Brasil 2850, Pocitos, Montevideo"
                  value={form.direccion}
                  onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                />
              </div>

              <div className="p-field">
                <label className="p-label">Notas</label>
                <textarea className="p-input p-textarea" placeholder="Impresiones, pros, contras..." value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>

              {/* ── VIDEOS ── */}
              <div className="p-section-sep">
                <div className="p-section-sep-line" />
                <span className="p-section-sep-label">Videos TikTok / YouTube</span>
                <div className="p-section-sep-line" />
              </div>
              <div className="p-field">
                <label className="p-label">Links de video <span className="p-label-hint">(TikTok, YouTube)</span></label>
                {videosForm.map((url, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="p-input"
                      type="url"
                      placeholder="https://www.tiktok.com/... o https://youtu.be/..."
                      value={url}
                      onChange={e => {
                        const next = [...videosForm]
                        next[idx] = e.target.value
                        setVideosForm(next)
                      }}
                      style={{ flex: 1 }}
                    />
                    {videosForm.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setVideosForm(v => v.filter((_, i) => i !== idx))}
                        style={{ padding: '0 10px', background: 'none', border: '1.5px solid #E0C8B8', borderRadius: 10, color: '#A07060', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
                      >×</button>
                    )}
                  </div>
                ))}
                {videosForm[videosForm.length - 1].trim() && (
                  <button
                    type="button"
                    onClick={() => setVideosForm(v => [...v, ''])}
                    style={{ fontSize: '0.78rem', color: '#C05A3B', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0', fontFamily: 'var(--font-body), Nunito, sans-serif', fontWeight: 600 }}
                  >+ Añadir otro video</button>
                )}
              </div>

              </>}

              {formError && (
                <div className="p-error">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6.5 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="6.5" cy="9" r="0.6" fill="currentColor" />
                  </svg>
                  {formError}
                </div>
              )}

              <div className="p-submit-wrap">
                <button type="submit" className="p-submit" disabled={guardando}>
                  {guardando && <span className="p-spinner" />}
                  {guardando ? 'Guardando...' : 'Añadir apto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Stars({ score, size = 12 }: { score: number; size?: number }) {
  return (
    <div className="p-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 12 12"
          fill={i < Math.round(score) ? '#C8823A' : 'none'}
          stroke={i < Math.round(score) ? '#C8823A' : '#D0B8A8'}
          strokeWidth="1"
        >
          <path d="M6 1l1.35 2.73 3.01.44-2.18 2.12.51 3.01L6 7.9 3.31 9.3l.51-3.01L1.64 4.17l3.01-.44z" />
        </svg>
      ))}
    </div>
  )
}
