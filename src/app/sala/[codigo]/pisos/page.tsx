'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito, DM_Mono } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import type { Piso, VotoPiso, Miembro } from '@/lib/types'

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

function fmtUYU(n: number) {
  return `$ ${n.toLocaleString('es-UY')}`
}

async function resolverVideoUrl(url: string): Promise<string> {
  if (!url.includes('tiktok.com')) return url
  if (url.includes('tiktok.com/embed/v2/')) return url
  const matchDirecto = url.match(/\/video\/(\d+)/)
  if (matchDirecto) return `https://www.tiktok.com/embed/v2/${matchDirecto[1]}`
  try {
    const res = await fetch(`/api/tiktok-oembed?url=${encodeURIComponent(url)}`)
    if (res.ok) {
      const data = await res.json()
      if (data.embedUrl) return data.embedUrl
    }
  } catch { /* guardar url original si falla */ }
  return url
}

async function comprimirImagen(file: File, maxWidth = 1600, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
        'image/jpeg', quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

async function subirArchivoStorage(salaId: string, file: File): Promise<string | null> {
  const supabase = createClient()
  const compressed = await comprimirImagen(file)
  const path = `${salaId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
  const { error } = await supabase.storage.from('pisos').upload(path, compressed, { contentType: 'image/jpeg' })
  if (error) return null
  const { data } = supabase.storage.from('pisos').getPublicUrl(path)
  return data.publicUrl
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
        if (a.precio === null) return 1
        if (b.precio === null) return -1
        return a.precio - b.precio
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
      supabase.from('miembros').select().eq('sala_id', session.salaId),
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

  async function handleAñadir(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setGuardando(true)

    const alquiler = form.alquiler ? parseFloat(form.alquiler) : 0
    const gastosCom = form.gastosCom ? parseFloat(form.gastosCom) : 0
    const precioTotal = alquiler + gastosCom || null

    const supabase = createClient()
    const fotos = fotosForm.map(f => f.trim()).filter(Boolean)
    const videos = await Promise.all(
      videosForm.map(v => v.trim()).filter(Boolean).map(v => resolverVideoUrl(v))
    )

    const { error } = await supabase.from('pisos').insert({
      sala_id: session!.salaId,
      titulo: form.titulo.trim(),
      url: form.url.trim() || null,
      precio: precioTotal,
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
          .p-stats { grid-column: 1; flex-direction: column; gap: 0.75rem; margin-bottom: 0; position: sticky; top: 1.5rem; }
          .p-stat { flex: none; min-width: 0; }
          .p-filter-bar { grid-column: 1; flex-direction: column; gap: 6px; margin-top: 0.75rem; margin-bottom: 0; }
          .p-search { width: 100%; }
          .p-sort-group { flex-direction: column; width: 100%; }
          .p-sort-btn { width: 100%; text-align: left; border-radius: 10px; }
          .p-main-col { grid-column: 2; grid-row: 2 / span 10; min-width: 0; }
          .p-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
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
          display: flex; align-items: flex-end; justify-content: center;
          animation: p-overlay 0.2s ease both;
        }
        @media (min-width: 600px) { .p-overlay { align-items: center; } }

        .p-modal {
          background: #FFF8F2; border: 1.5px solid #EAD8C8;
          border-radius: 24px 24px 0 0; width: 100%; max-width: 520px;
          padding: 2rem 2rem 0; animation: p-modal 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
          max-height: 90vh; overflow-y: auto;
          overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
          box-shadow: 0 -8px 40px rgba(150,80,40,0.12);
          display: flex; flex-direction: column;
        }
        @media (min-width: 600px) { .p-modal { border-radius: 20px; box-shadow: 0 20px 60px rgba(150,80,40,0.15); } }
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
          .p-modal { padding: 1.5rem 1.25rem; }
          .p-modal-title { font-size: 1.25rem; }
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
              <div className="p-avatar" style={{ background: session.miembroColor }}>
                {session.miembroNombre[0].toUpperCase()}
              </div>
              <button className="p-add-btn" onClick={abrirModal}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span className="p-add-text">Añadir apto</span>
              </button>
            </div>
          </div>

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
                    <div key={m.id} className="p-avatar" style={{ background: m.color, width: 26, height: 26, fontSize: '0.65rem' }}>
                      {m.nombre[0].toUpperCase()}
                    </div>
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
                  onClick={() => router.push(`/sala/${codigo}/pisos/${piso.id}`)}
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
                    {piso.precio !== null && (
                      <span className="p-badge p-badge-price">{fmtUYU(piso.precio)}/mes</span>
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
                            <div key={v.id} className="p-votes-av" style={{ background: m.color }} title={m.nombre}>
                              {m.nombre[0].toUpperCase()}
                            </div>
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
        <div className="p-overlay" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
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
              <div className="p-field">
                <label className="p-label">Nombre / Título *</label>
                <input className="p-input" type="text" placeholder="Ej: Apto Pocitos 3 dorm" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} required autoFocus />
              </div>

              <div className="p-field">
                <label className="p-label">URL del anuncio</label>
                <input className="p-input" type="url" placeholder="https://infocasas.com.uy/..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              </div>

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
                {fotosForm.map((url, idx) => (
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
                {fotosForm[fotosForm.length - 1].trim() && (
                  <button
                    type="button"
                    onClick={() => setFotosForm(f => [...f, ''])}
                    style={{ fontSize: '0.78rem', color: '#C05A3B', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0', fontFamily: 'var(--font-body), Nunito, sans-serif', fontWeight: 600 }}
                  >+ Añadir otra foto</button>
                )}
                {fotosForm.some(f => f.trim()) && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {fotosForm.filter(f => f.trim()).map((f, i) => (
                      <div key={i} style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: '#F0E8DF', border: '1px solid #EAD8C8', flexShrink: 0 }}>
                        <img src={f} alt={`preview ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    ))}
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
