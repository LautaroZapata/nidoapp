'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito, DM_Mono } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import type { Piso, VotoPiso, Miembro } from '@/lib/types'
import { resolverVideoUrl, comprimirImagen, subirArchivoStorage } from '@/lib/pisos-utils'
import { ConfirmModal } from '@/components/ConfirmModal'
import MemberAvatar from '@/components/MemberAvatar'

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

function parseVideo(url: string): { tipo: 'youtube' | 'tiktok' | 'otro'; embedUrl?: string; id?: string } {
  try {
    if (url.includes('youtube.com/watch')) {
      const id = new URL(url).searchParams.get('v')
      if (id) return { tipo: 'youtube', id, embedUrl: `https://www.youtube.com/embed/${id}` }
    }
    if (url.includes('youtu.be/')) {
      const id = url.split('youtu.be/')[1]?.split('?')[0]
      if (id) return { tipo: 'youtube', id, embedUrl: `https://www.youtube.com/embed/${id}` }
    }
    if (url.includes('youtube.com/shorts/')) {
      const id = url.split('/shorts/')[1]?.split('?')[0]
      if (id) return { tipo: 'youtube', id, embedUrl: `https://www.youtube.com/embed/${id}` }
    }
    // URLs ya resueltas (embed/v2) guardadas en DB
    if (url.includes('tiktok.com/embed/v2/')) {
      const id = url.split('/embed/v2/')[1]?.split('?')[0]
      if (id) return { tipo: 'tiktok', id, embedUrl: url }
    }
    // URLs estándar con video ID visible
    if (url.includes('tiktok.com')) {
      const match = url.match(/\/video\/(\d+)/)
      if (match) return { tipo: 'tiktok', id: match[1], embedUrl: `https://www.tiktok.com/embed/v2/${match[1]}` }
    }
  } catch {
    // ignore
  }
  return { tipo: 'otro' }
}

export default function PisoDetallePage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string
  const pisoId = params.id as string

  const [session] = useState(getSession)
  const [piso, setPiso] = useState<Piso | null>(null)
  const [votos, setVotos] = useState<VotoPiso[]>([])
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [loading, setLoading] = useState(true)

  // Voto
  const [puntuacion, setPuntuacion] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comentario, setComentario] = useState('')
  const [guardandoVoto, setGuardandoVoto] = useState(false)
  const [votoGuardado, setVotoGuardado] = useState(false)
  const [votoError, setVotoError] = useState('')

  const [eliminando, setEliminando] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ title?: string; message: string; onConfirm: () => void } | null>(null)

  // Fotos
  const [nuevaFotoUrl, setNuevaFotoUrl] = useState('')
  const [guardandoFoto, setGuardandoFoto] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [fotoActiva, setFotoActiva] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Videos
  const [nuevaVideoUrl, setNuevaVideoUrl] = useState('')
  const [guardandoVideo, setGuardandoVideo] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [videoActivo, setVideoActivo] = useState<number | null>(null)

  // Editar
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ titulo: '', url: '', alquiler: '', gastosCom: '', m2: '', zona: '', notas: '', direccion: '' })
  const [editGuardando, setEditGuardando] = useState(false)
  const [editError, setEditError] = useState('')
  const [editScraping, setEditScraping] = useState(false)
  const [editScrapeMsg, setEditScrapeMsg] = useState('')
  const [editScrapeDetected, setEditScrapeDetected] = useState<string | null>(null)

  useEffect(() => {
    if (!lightboxOpen || !piso) return
    const p = piso
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowRight') setFotoActiva(i => (i + 1) % p.fotos.length)
      if (e.key === 'ArrowLeft') setFotoActiva(i => (i - 1 + p.fotos.length) % p.fotos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, piso])

  const cargarDatos = useCallback(async () => {
    if (!session) return
    const supabase = createClient()
    const [{ data: pisoData }, { data: votosData }, { data: miembrosData }] = await Promise.all([
      supabase.from('pisos').select().eq('id', pisoId).single(),
      supabase.from('votos_piso').select().eq('piso_id', pisoId),
      supabase.from('miembros').select().eq('sala_id', session.salaId).not('user_id', 'is', null),
    ])
    if (!pisoData) { router.replace(`/sala/${codigo}/pisos`); return }
    setPiso(pisoData as Piso)
    const v = (votosData as VotoPiso[]) ?? []
    setVotos(v)
    if (miembrosData) setMiembros(miembrosData as Miembro[])

    const miVoto = v.find(vt => vt.miembro_id === session.miembroId)
    if (miVoto) {
      setPuntuacion(miVoto.puntuacion)
      setComentario(miVoto.comentario ?? '')
    }
    setLoading(false)
  }, [session, pisoId, codigo, router])

  useEffect(() => {
    if (!session || session.salaCodigo !== codigo) { router.replace('/'); return }
    cargarDatos()
  }, [codigo, session, cargarDatos, router])

  async function handleVotar(e: React.FormEvent) {
    e.preventDefault()
    if (puntuacion === 0) { setVotoError('Selecciona una puntuación'); return }
    setVotoError('')
    setGuardandoVoto(true)
    const supabase = createClient()
    const miVotoExistente = votos.find(v => v.miembro_id === session!.miembroId)

    if (miVotoExistente) {
      await supabase.from('votos_piso').update({
        puntuacion,
        comentario: comentario.trim() || null,
      }).eq('id', miVotoExistente.id)
    } else {
      await supabase.from('votos_piso').insert({
        piso_id: pisoId,
        miembro_id: session!.miembroId,
        puntuacion,
        comentario: comentario.trim() || null,
      })
    }

    setGuardandoVoto(false)
    setVotoGuardado(true)
    setTimeout(() => setVotoGuardado(false), 2500)
    cargarDatos()
  }

  async function handleAgregarFotoUrl(e: React.FormEvent) {
    e.preventDefault()
    const url = nuevaFotoUrl.trim()
    if (!url || !piso) return
    setGuardandoFoto(true)
    const nuevasFotos = [...(piso.fotos ?? []), url]
    const supabase = createClient()
    await supabase.from('pisos').update({ fotos: nuevasFotos }).eq('id', pisoId)
    setPiso({ ...piso, fotos: nuevasFotos })
    setFotoActiva(nuevasFotos.length - 1)
    setNuevaFotoUrl('')
    setGuardandoFoto(false)
  }

  async function handleSubirFotoArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !piso || !session) return
    setSubiendoFoto(true)
    const url = await subirArchivoStorage(session.salaId, file)
    if (url) {
      const nuevasFotos = [...(piso.fotos ?? []), url]
      const supabase = createClient()
      await supabase.from('pisos').update({ fotos: nuevasFotos }).eq('id', pisoId)
      setPiso({ ...piso, fotos: nuevasFotos })
      setFotoActiva(nuevasFotos.length - 1)
    }
    setSubiendoFoto(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleEliminarFoto(idx: number) {
    if (!piso) return
    setConfirmDialog({
      title: 'Eliminar foto',
      message: 'La foto será eliminada permanentemente.',
      onConfirm: async () => {
        setConfirmDialog(null)
        const nuevasFotos = piso.fotos.filter((_, i) => i !== idx)
        const supabase = createClient()
        await supabase.from('pisos').update({ fotos: nuevasFotos }).eq('id', pisoId)
        setPiso({ ...piso, fotos: nuevasFotos })
        setFotoActiva(Math.min(fotoActiva, nuevasFotos.length - 1))
      },
    })
  }

  async function handleAgregarVideo(e: React.FormEvent) {
    e.preventDefault()
    const url = nuevaVideoUrl.trim()
    if (!url || !piso) return
    setVideoError('')
    setGuardandoVideo(true)
    const urlResuelta = await resolverVideoUrl(url)
    if (urlResuelta === url && url.includes('tiktok.com') && !url.includes('/video/') && !url.includes('/embed/')) {
      setVideoError('No se pudo reconocer el video de TikTok. Probá con la URL completa del perfil.')
      setGuardandoVideo(false)
      return
    }
    const nuevosVideos = [...(piso.videos ?? []), urlResuelta]
    const supabase = createClient()
    await supabase.from('pisos').update({ videos: nuevosVideos }).eq('id', pisoId)
    setPiso({ ...piso, videos: nuevosVideos })
    setVideoActivo(nuevosVideos.length - 1)
    setNuevaVideoUrl('')
    setGuardandoVideo(false)
  }

  function handleEliminarVideo(idx: number) {
    if (!piso) return
    setConfirmDialog({
      title: 'Eliminar video',
      message: 'El video será eliminado permanentemente.',
      onConfirm: async () => {
        setConfirmDialog(null)
        const nuevosVideos = (piso.videos ?? []).filter((_, i) => i !== idx)
        const supabase = createClient()
        await supabase.from('pisos').update({ videos: nuevosVideos }).eq('id', pisoId)
        setPiso({ ...piso, videos: nuevosVideos })
        if (videoActivo !== null && videoActivo >= nuevosVideos.length) setVideoActivo(nuevosVideos.length > 0 ? nuevosVideos.length - 1 : null)
      },
    })
  }

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
    if (/^https?:\/\/.+\..+/.test(url)) return 'sitio'
    return null
  }

  function abrirEditar() {
    if (!piso) return
    setEditForm({
      titulo: piso.titulo,
      url: piso.url ?? '',
      alquiler: piso.precio?.toString() ?? '',
      gastosCom: piso.gastos_comunes?.toString() ?? '',
      m2: piso.m2?.toString() ?? '',
      zona: piso.zona ?? '',
      notas: piso.notas ?? '',
      direccion: piso.direccion ?? '',
    })
    setEditError('')
    setEditScraping(false)
    setEditScrapeMsg('')
    setEditScrapeDetected(detectSupportedSite(piso.url ?? ''))
    setEditOpen(true)
  }

  async function handleEditScrape() {
    const url = editForm.url.trim()
    if (!url || !piso) return
    setEditScraping(true)
    setEditScrapeMsg('')
    setEditError('')
    try {
      const res = await fetch('/api/scrape-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) {
        setEditScrapeMsg(json.error || 'No se pudo extraer información')
        setEditScraping(false)
        return
      }
      const d = json.data
      // Fill empty fields only
      setEditForm(f => ({
        ...f,
        titulo: f.titulo || d.titulo || '',
        alquiler: f.alquiler || (d.precio != null ? String(d.precio) : ''),
        gastosCom: f.gastosCom || (d.gastosCom != null ? String(d.gastosCom) : ''),
        m2: f.m2 || (d.m2 != null ? String(d.m2) : ''),
        zona: f.zona || d.zona || '',
        direccion: f.direccion || d.direccion || '',
        notas: f.notas || buildEditNotas(d),
      }))

      // Compress and add photos to the piso
      if (d.fotos?.length > 0 && session) {
        setEditScrapeMsg('Importando fotos...')
        try {
          const compressRes = await fetch('/api/compress-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: d.fotos, salaId: session.salaId }),
          })
          if (compressRes.ok) {
            const compressData = await compressRes.json()
            const storedUrls: string[] = compressData.urls
            const existingFotos = piso.fotos ?? []
            const newFotos = storedUrls.filter(u => !existingFotos.includes(u))
            if (newFotos.length > 0) {
              const allFotos = [...existingFotos, ...newFotos]
              const supabase = createClient()
              await supabase.from('pisos').update({ fotos: allFotos }).eq('id', pisoId)
              setPiso({ ...piso, fotos: allFotos })
            }
          }
        } catch { /* photo compression is best-effort */ }
      }

      const parts = []
      if (d.titulo) parts.push('título')
      if (d.precio != null) parts.push('precio')
      if (d.fotos?.length) parts.push(`${d.fotos.length} foto${d.fotos.length > 1 ? 's' : ''}`)
      if (d.m2 != null) parts.push('m²')
      if (d.zona) parts.push('zona')
      if (d.gastosCom != null) parts.push('GC')
      if (d.dormitorios) parts.push(`${d.dormitorios} dorm`)
      if (d.moneda) parts.push(`(${d.moneda})`)
      setEditScrapeMsg(parts.length > 0 ? `Importado: ${parts.join(', ')}` : 'No se encontró información útil')
    } catch {
      setEditScrapeMsg('Error al conectar con el servidor')
    }
    setEditScraping(false)
  }

  function buildEditNotas(d: { notas?: string; dormitorios?: number; banos?: number; moneda?: string }): string {
    const parts: string[] = []
    if (d.dormitorios) parts.push(`${d.dormitorios} dormitorio${d.dormitorios > 1 ? 's' : ''}`)
    if (d.banos) parts.push(`${d.banos} baño${d.banos > 1 ? 's' : ''}`)
    if (d.moneda) parts.push(`Moneda: ${d.moneda}`)
    const header = parts.length > 0 ? parts.join(' · ') : ''
    if (d.notas && header) return `${header}\n${d.notas}`
    return d.notas || header
  }

  async function handleEditar(e: React.FormEvent) {
    e.preventDefault()
    if (!piso) return
    setEditGuardando(true)
    setEditError('')
    const supabase = createClient()
    const { error } = await supabase.from('pisos').update({
      titulo: editForm.titulo.trim(),
      url: editForm.url.trim() || null,
      precio: editForm.alquiler ? parseFloat(editForm.alquiler) : null,
      gastos_comunes: editForm.gastosCom ? parseFloat(editForm.gastosCom) : null,
      m2: editForm.m2 ? parseFloat(editForm.m2) : null,
      zona: editForm.zona.trim() || null,
      notas: editForm.notas.trim() || null,
      direccion: editForm.direccion.trim() || null,
    }).eq('id', pisoId)
    if (error) {
      setEditError('Error al guardar los cambios')
      setEditGuardando(false)
      return
    }
    setEditOpen(false)
    setEditGuardando(false)
    cargarDatos()
  }

  function handleEliminarPiso() {
    setConfirmDialog({
      title: 'Eliminar apto',
      message: 'Se eliminará este apto junto con todos sus votos y fotos. Esta acción no se puede deshacer.',
      onConfirm: async () => {
        setConfirmDialog(null)
        setEliminando(true)
        const supabase = createClient()
        await supabase.from('pisos').delete().eq('id', pisoId)
        router.replace(`/sala/${codigo}/pisos`)
      },
    })
  }

  const promedio = votos.length > 0
    ? votos.reduce((s, v) => s + v.puntuacion, 0) / votos.length
    : null

  if (!session) return null

  return (
    <div className={`${fraunces.variable} ${nunito.variable} ${dmMono.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes d-spin    { to { transform: rotate(360deg); } }
        @keyframes d-fadeup  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes d-in      { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes d-pop     { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes d-check   { from { opacity: 0; transform: scale(0.7) rotate(-10deg); } to { opacity: 1; transform: scale(1) rotate(0deg); } }
        @keyframes d-shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
        @keyframes d-star    { 0% { transform: scale(1); } 50% { transform: scale(1.35); } 100% { transform: scale(1); } }

        .d-root {
          min-height: 100vh;
          background: #FAF5EE;
          font-family: var(--font-body), 'Nunito', system-ui, sans-serif;
          color: #2A1A0E;
          position: relative;
        }
        .d-bg {
          position: fixed; inset: 0;
          background-image:
            radial-gradient(circle at 10% 15%, rgba(192,90,59,0.05) 0%, transparent 40%),
            radial-gradient(circle at 90% 85%, rgba(90,136,105,0.04) 0%, transparent 40%);
          pointer-events: none; z-index: 0;
        }

        .d-wrap {
          position: relative; z-index: 1;
          max-width: 720px; margin: 0 auto; padding: 0 1.5rem 5rem;
        }

        /* Header */
        .d-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.75rem 0 1.5rem;
          animation: d-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .d-header-left { display: flex; align-items: center; gap: 0.85rem; }
        .d-back {
          width: 36px; height: 36px; border-radius: 10px;
          background: white; border: 1.5px solid #E8D5C0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.18s, border-color 0.18s;
          color: #A07060; box-shadow: 0 1px 4px rgba(150,80,40,0.08);
          flex-shrink: 0;
        }
        .d-back:hover { background: #FFF5EE; border-color: #C05A3B; color: #C05A3B; }
        .d-breadcrumb { font-size: 0.72rem; color: #B09080; font-weight: 400; }
        .d-breadcrumb span { color: #7A5040; font-weight: 600; }
        .d-edit-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 13px;
          background: rgba(192,90,59,0.07); border: 1px solid rgba(192,90,59,0.2);
          color: #C05A3B; border-radius: 9px;
          font-size: 0.75rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: background 0.18s, border-color 0.18s;
        }
        .d-edit-btn:hover:not(:disabled) { background: rgba(192,90,59,0.14); border-color: rgba(192,90,59,0.35); }
        .d-edit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .d-del-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 13px;
          background: rgba(192,60,60,0.06); border: 1px solid rgba(192,60,60,0.15);
          color: #B03030; border-radius: 9px;
          font-size: 0.75rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: background 0.18s, border-color 0.18s;
        }
        .d-del-btn:hover:not(:disabled) {
          background: rgba(192,60,60,0.12); border-color: rgba(192,60,60,0.3);
        }
        .d-del-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Edit modal */
        @keyframes d-modal { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes d-overlay { from { opacity: 0; } to { opacity: 1; } }

        .d-modal-overlay {
          position: fixed; inset: 0; background: rgba(42,26,14,0.5);
          backdrop-filter: blur(6px); z-index: 100;
          display: flex; align-items: center; justify-content: center;
          padding: 1rem;
          animation: d-overlay 0.2s ease both;
        }

        .d-modal {
          background: #FFF8F2; border: 1.5px solid #EAD8C8;
          border-radius: 20px; width: 100%; max-width: 520px;
          padding: 2rem; animation: d-modal 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
          max-height: 90vh; overflow-y: auto;
          box-shadow: 0 20px 60px rgba(150,80,40,0.15);
        }

        .d-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.75rem; }
        .d-modal-title { font-family: var(--font-serif), serif; font-size: 1.4rem; color: #2A1A0E; letter-spacing: -0.025em; font-weight: 600; }
        .d-modal-close {
          width: 32px; height: 32px; border-radius: 8px;
          background: #F0E8DF; border: 1px solid #E0C8B8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #A07060; transition: background 0.18s, color 0.18s;
        }
        .d-modal-close:hover { background: #E8D0C0; color: #2A1A0E; }

        .d-field { margin-bottom: 1rem; }
        .d-label { display: block; font-size: 0.68rem; font-weight: 700; color: #8A6050; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 5px; }
        .d-label-hint { font-size: 0.68rem; color: #B09080; font-weight: 400; text-transform: none; letter-spacing: 0; margin-left: 5px; }
        .d-input {
          width: 100%; padding: 10px 13px;
          background: white; border: 1.5px solid #E0C8B8;
          border-radius: 10px; font-size: 0.88rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .d-input::placeholder { color: #C8B0A0; }
        .d-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.12); }
        .d-textarea { resize: vertical; min-height: 72px; }
        .d-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .d-save-btn {
          width: 100%; padding: 13px; background: #C05A3B; color: white; border: none;
          border-radius: 13px; font-size: 0.9rem; font-weight: 700;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 0.5rem;
        }
        .d-save-btn:hover:not(:disabled) { background: #A04730; transform: translateY(-1.5px); box-shadow: 0 10px 28px rgba(192,90,59,0.35); }
        .d-save-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .d-form-error {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 13px; background: #FFF0EC;
          border: 1px solid #F0C0B0; border-radius: 9px;
          color: #B03A1A; font-size: 0.81rem; margin-bottom: 1rem;
        }

        .d-scrape-wrap {
          margin-top: 8px;
          animation: d-fadeup 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .d-scrape-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 14px; background: rgba(192,90,59,0.07);
          border: 1.5px solid rgba(192,90,59,0.2); color: #C05A3B;
          border-radius: 10px; font-size: 0.8rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: background 0.18s, border-color 0.18s, transform 0.15s, box-shadow 0.18s;
          width: 100%; justify-content: center;
        }
        .d-scrape-btn:hover { background: rgba(192,90,59,0.13); border-color: rgba(192,90,59,0.35); transform: translateY(-1px); box-shadow: 0 4px 14px rgba(192,90,59,0.12); }
        .d-scrape-btn:active { transform: translateY(0); box-shadow: none; }
        .d-scrape-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .d-scrape-btn svg { flex-shrink: 0; }
        .d-scrape-loading {
          display: flex; align-items: center; justify-content: center; gap: 9px;
          padding: 10px 14px;
          background: rgba(192,90,59,0.05);
          border: 1.5px solid rgba(192,90,59,0.12);
          border-radius: 10px;
          font-size: 0.8rem; color: #A07060;
          font-family: var(--font-body), 'Nunito', sans-serif;
        }
        .d-scrape-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid #E8D0C0; border-top-color: #C05A3B;
          animation: d-spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        .d-scrape-feedback {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 10px 13px; border-radius: 10px;
          font-size: 0.78rem; line-height: 1.45;
          font-family: var(--font-body), 'Nunito', sans-serif;
          animation: d-fadeup 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .d-scrape-feedback svg { flex-shrink: 0; margin-top: 1px; }
        .d-scrape-feedback.success {
          background: rgba(46,125,82,0.08); border: 1px solid rgba(46,125,82,0.18);
          color: #2E7D52;
        }
        .d-scrape-feedback.error {
          background: rgba(176,96,48,0.08); border: 1px solid rgba(176,96,48,0.18);
          color: #B06030;
        }
        .d-scrape-feedback .d-scrape-retry {
          margin-left: auto; flex-shrink: 0;
          background: none; border: none; color: #C05A3B;
          font-size: 0.75rem; font-weight: 600; cursor: pointer;
          font-family: var(--font-body), 'Nunito', sans-serif;
          text-decoration: underline; text-underline-offset: 2px; padding: 0;
        }
        .d-scrape-feedback .d-scrape-retry:hover { color: #A04730; }
        @media (min-width: 480px) { .d-scrape-btn { width: auto; } }

        /* Cards */
        .d-card {
          background: white; border: 1.5px solid #EAD8C8;
          border-radius: 20px; padding: 1.75rem;
          margin-bottom: 1.25rem;
          box-shadow: 0 2px 12px rgba(150,80,40,0.06);
        }
        .d-main { animation: d-fadeup 0.5s 0.05s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .d-photos-card { animation: d-fadeup 0.5s 0.08s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .d-map-card { animation: d-fadeup 0.5s 0.11s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .d-videos-card { animation: d-fadeup 0.5s 0.14s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .d-vote-card { animation: d-fadeup 0.5s 0.17s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .d-votes-card { animation: d-fadeup 0.5s 0.22s cubic-bezier(0.22, 1, 0.36, 1) both; }

        .d-piso-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1.9rem; color: #2A1A0E;
          letter-spacing: -0.03em; line-height: 1.2;
          margin-bottom: 1.25rem; font-weight: 600;
        }

        .d-score-row {
          display: flex; align-items: center; gap: 1rem;
          margin-bottom: 1.5rem; padding-bottom: 1.5rem;
          border-bottom: 1.5px solid #EAD8C8;
        }
        .d-big-score {
          font-family: var(--font-code), monospace;
          font-size: 3rem; font-weight: 500; color: #C8823A;
          line-height: 1; letter-spacing: -0.03em;
        }
        .d-score-stars { display: flex; flex-direction: column; gap: 5px; }
        .d-stars-row { display: flex; gap: 3px; }
        .d-score-sub { font-size: 0.72rem; color: #B09080; }
        .d-no-score { font-size: 0.85rem; color: #B09080; font-style: italic; }

        .d-info-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.75rem; margin-bottom: 1.25rem;
        }
        .d-info-item {
          background: #FBF6EF; border: 1.5px solid #EAD8C8;
          border-radius: 12px; padding: 0.85rem 1rem;
        }
        .d-info-label {
          font-size: 0.65rem; text-transform: uppercase;
          letter-spacing: 0.09em; color: #B09080;
          margin-bottom: 4px; font-weight: 600;
        }
        .d-info-val { font-size: 1rem; color: #2A1A0E; font-weight: 600; letter-spacing: -0.01em; }
        .d-info-val-price { color: #5A8869; font-family: var(--font-code), monospace; font-size: 1.05rem; }
        .d-info-val-m2 { color: #C05A3B; }
        .d-info-val-zona { color: #9A6020; }

        .d-url-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 16px;
          background: rgba(192,90,59,0.08); border: 1.5px solid rgba(192,90,59,0.2);
          color: #C05A3B; border-radius: 10px;
          font-size: 0.82rem; font-weight: 600; text-decoration: none;
          transition: background 0.18s, border-color 0.18s;
          cursor: pointer; margin-bottom: 1rem;
        }
        .d-url-btn:hover { background: rgba(192,90,59,0.14); border-color: rgba(192,90,59,0.35); }

        .d-notas-box {
          background: #FBF6EF; border: 1.5px solid #EAD8C8;
          border-radius: 12px; padding: 1rem 1.1rem;
        }
        .d-notas-label {
          font-size: 0.65rem; text-transform: uppercase;
          letter-spacing: 0.09em; color: #B09080;
          margin-bottom: 6px; font-weight: 600;
        }
        .d-notas-text { font-size: 0.87rem; color: #7A5040; line-height: 1.65; font-weight: 400; }

        /* Section title */
        .d-section-title {
          font-family: var(--font-serif), 'Georgia', serif;
          font-size: 1.2rem; color: #2A1A0E;
          letter-spacing: -0.02em; margin-bottom: 1.5rem; font-weight: 600;
        }
        .d-section-title em { font-style: italic; color: #C05A3B; }

        /* Vote form */
        .d-star-selector {
          display: flex; gap: 8px; margin-bottom: 1.25rem; justify-content: center;
        }
        .d-star-btn {
          background: none; border: none; cursor: pointer;
          padding: 4px; transition: transform 0.15s; display: flex;
        }
        .d-star-btn:hover { transform: scale(1.15); }
        .d-star-btn.active { animation: d-star 0.25s ease; }

        .d-comment-input {
          width: 100%; padding: 11px 14px;
          background: #FBF6EF; border: 1.5px solid #E0C8B8;
          border-radius: 11px; font-size: 0.88rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          resize: vertical; min-height: 80px; margin-bottom: 1rem;
        }
        .d-comment-input::placeholder { color: #C8B0A0; }
        .d-comment-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.12); }

        .d-vote-btn {
          width: 100%; padding: 13px; background: #C05A3B; color: white; border: none;
          border-radius: 12px; font-size: 0.9rem; font-weight: 700;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .d-vote-btn:hover:not(:disabled) { background: #A04730; transform: translateY(-1.5px); box-shadow: 0 10px 28px rgba(192,90,59,0.35); }
        .d-vote-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .d-vote-btn.saved { background: #5A8869; }

        .d-vote-err { font-size: 0.78rem; color: #C03030; text-align: center; margin-bottom: 0.75rem; }

        .d-spinner {
          width: 15px; height: 15px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: white;
          animation: d-spin 0.7s linear infinite; flex-shrink: 0;
        }
        .d-check { display: inline-flex; animation: d-check 0.3s cubic-bezier(0.22, 1, 0.36, 1); }

        /* Member votes */
        .d-member-vote {
          display: flex; align-items: flex-start; gap: 1rem;
          padding: 1rem 0; border-bottom: 1.5px solid #EAD8C8;
        }
        .d-member-vote:last-child { border-bottom: none; padding-bottom: 0; }
        .d-member-vote:first-child { padding-top: 0; }
        .d-mv-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.85rem; font-weight: 700; color: white; flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,0.12);
        }
        .d-mv-info { flex: 1; }
        .d-mv-top { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 5px; }
        .d-mv-name { font-size: 0.87rem; font-weight: 600; color: #2A1A0E; }
        .d-mv-you {
          font-size: 0.65rem; color: #C05A3B;
          background: rgba(192,90,59,0.1); padding: 2px 7px; border-radius: 999px;
          border: 1px solid rgba(192,90,59,0.2);
        }
        .d-mv-stars { display: flex; gap: 2px; }
        .d-mv-score { font-family: var(--font-code), monospace; font-size: 0.85rem; font-weight: 500; color: #C8823A; margin-left: 5px; }
        .d-mv-comment { font-size: 0.82rem; color: #A07060; line-height: 1.55; margin-top: 5px; font-style: italic; }
        .d-no-votes { text-align: center; padding: 2rem; font-size: 0.83rem; color: #B09080; font-style: italic; }

        /* Skeleton */
        .d-skeleton {
          background: linear-gradient(90deg, #F0E8DF 25%, #E8DDD4 50%, #F0E8DF 75%);
          background-size: 200% 100%; animation: d-shimmer 1.5s infinite; border-radius: 10px;
        }

        /* Gallery */
        .d-gallery {
          margin: -1.75rem -1.75rem 1.75rem;
          position: relative; border-radius: 20px 20px 0 0;
          overflow: hidden; background: #F0E8DF;
        }
        .d-gallery-img-wrap { position: relative; cursor: zoom-in; }
        .d-gallery-img-wrap:hover .d-gallery-expand { opacity: 1; }
        .d-gallery-main { width: 100%; height: 260px; object-fit: cover; display: block; }
        .d-gallery-no-img {
          width: 100%; height: 260px;
          display: flex; align-items: center; justify-content: center;
          background: #F0E8DF; color: #C8B0A0; font-size: 0.8rem;
        }
        .d-gallery-dots {
          position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 5px;
        }
        .d-gallery-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: rgba(255,255,255,0.5); cursor: pointer;
          transition: background 0.15s, transform 0.15s; border: none; padding: 0;
        }
        .d-gallery-dot.active { background: white; transform: scale(1.25); }
        .d-gallery-nav {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(42,26,14,0.4); border: 1px solid rgba(255,255,255,0.3);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: white; transition: background 0.15s;
        }
        .d-gallery-nav:hover { background: rgba(42,26,14,0.65); }
        .d-gallery-nav.prev { left: 10px; }
        .d-gallery-nav.next { right: 10px; }
        .d-gallery-count {
          position: absolute; top: 10px; right: 10px;
          background: rgba(42,26,14,0.45); color: rgba(255,255,255,0.9);
          font-size: 0.7rem; padding: 3px 8px; border-radius: 999px;
          backdrop-filter: blur(4px);
        }
        .d-gallery-expand {
          position: absolute; bottom: 10px; left: 10px;
          background: rgba(42,26,14,0.5); color: rgba(255,255,255,0.9);
          border-radius: 8px; padding: 5px 10px; font-size: 0.7rem;
          display: flex; align-items: center; gap: 5px;
          opacity: 0; transition: opacity 0.15s; pointer-events: none;
          backdrop-filter: blur(4px);
        }

        /* Photos grid */
        .d-photos-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
          gap: 8px; margin-bottom: 1rem;
        }
        .d-photo-thumb {
          position: relative; border-radius: 10px; overflow: hidden;
          aspect-ratio: 1; background: #F0E8DF;
          border: 1.5px solid #EAD8C8; cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .d-photo-thumb.active-thumb { border-color: #C05A3B; box-shadow: 0 0 0 2px rgba(192,90,59,0.25); }
        .d-photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .d-photo-del {
          position: absolute; top: 4px; right: 4px;
          width: 20px; height: 20px; border-radius: 50%;
          background: rgba(42,26,14,0.65); border: 1px solid rgba(255,255,255,0.3);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: white; opacity: 0; transition: opacity 0.15s;
        }
        .d-photo-thumb:hover .d-photo-del { opacity: 1; }

        .d-add-foto-row { display: flex; gap: 8px; align-items: stretch; }
        .d-add-foto-input {
          flex: 1; padding: 9px 12px;
          background: #FBF6EF; border: 1.5px solid #E0C8B8;
          border-radius: 10px; font-size: 0.84rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .d-add-foto-input::placeholder { color: #C8B0A0; }
        .d-add-foto-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.12); }
        .d-add-foto-btn {
          padding: 9px 16px; background: rgba(192,90,59,0.1);
          border: 1.5px solid rgba(192,90,59,0.25); color: #C05A3B;
          border-radius: 10px; font-size: 0.82rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: background 0.15s, border-color 0.15s;
          white-space: nowrap; display: flex; align-items: center; gap: 5px;
        }
        .d-add-foto-btn:hover:not(:disabled) { background: rgba(192,90,59,0.18); border-color: rgba(192,90,59,0.45); }
        .d-add-foto-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .d-upload-foto-btn {
          padding: 9px 14px; background: rgba(90,136,105,0.1);
          border: 1.5px solid rgba(90,136,105,0.25); color: #3A7050;
          border-radius: 10px; font-size: 0.82rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: background 0.15s, border-color 0.15s;
          white-space: nowrap; display: flex; align-items: center; gap: 5px;
        }
        .d-upload-foto-btn:hover:not(:disabled) { background: rgba(90,136,105,0.18); border-color: rgba(90,136,105,0.45); }
        .d-upload-foto-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Map */
        .d-map-container {
          border-radius: 14px; overflow: hidden;
          border: 1.5px solid #EAD8C8;
          margin-bottom: 1rem;
          position: relative;
        }
        .d-map-iframe { width: 100%; height: 280px; border: 0; display: block; }
        .d-map-address {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 10px 12px; background: #FBF6EF;
          border-top: 1px solid #EAD8C8; font-size: 0.83rem; color: #7A5040;
        }
        .d-map-open-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; background: rgba(90,136,105,0.1);
          border: 1.5px solid rgba(90,136,105,0.25); color: #3A7050;
          border-radius: 9px; font-size: 0.8rem; font-weight: 600;
          text-decoration: none; transition: background 0.15s, border-color 0.15s;
          margin-top: 0.75rem; cursor: pointer;
        }
        .d-map-open-btn:hover { background: rgba(90,136,105,0.18); border-color: rgba(90,136,105,0.45); }

        /* Videos */
        .d-video-tabs {
          display: flex; gap: 6px; margin-bottom: 1rem; flex-wrap: wrap;
        }
        .d-video-tab {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 999px;
          font-size: 0.75rem; font-weight: 600; cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          border: 1.5px solid #EAD8C8; background: white; color: #7A5040;
          font-family: var(--font-body), 'Nunito', sans-serif;
        }
        .d-video-tab.active { background: #2A1A0E; border-color: #2A1A0E; color: white; }
        .d-video-tab:hover:not(.active) { background: #F5EDE4; border-color: #D4B8A0; }

        .d-video-embed {
          border-radius: 14px; overflow: hidden;
          border: 1.5px solid #EAD8C8; background: #000;
          margin-bottom: 1rem; position: relative;
        }
        .d-video-embed iframe { width: 100%; height: 380px; border: 0; display: block; }
        .d-video-del-btn {
          position: absolute; top: 8px; right: 8px;
          background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.2);
          color: white; border-radius: 6px; padding: 4px 8px;
          font-size: 0.7rem; cursor: pointer; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          transition: background 0.15s; display: flex; align-items: center; gap: 4px;
        }
        .d-video-del-btn:hover { background: rgba(192,60,60,0.85); }

        .d-tiktok-card {
          display: flex; align-items: center; gap: 12px;
          padding: 1rem; border-radius: 14px;
          border: 1.5px solid #EAD8C8; background: #FBF6EF;
          margin-bottom: 1rem;
        }
        .d-tiktok-icon {
          width: 48px; height: 48px; border-radius: 12px;
          background: #010101; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .d-tiktok-info { flex: 1; min-width: 0; }
        .d-tiktok-label { font-size: 0.72rem; color: #B09080; margin-bottom: 3px; }
        .d-tiktok-url {
          font-size: 0.8rem; color: #2A1A0E; font-weight: 500;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .d-tiktok-btn {
          padding: 8px 14px; background: #010101; color: white; border: none;
          border-radius: 8px; font-size: 0.78rem; font-weight: 700;
          font-family: var(--font-body), 'Nunito', sans-serif; cursor: pointer;
          text-decoration: none; white-space: nowrap; flex-shrink: 0;
          transition: background 0.15s;
        }
        .d-tiktok-btn:hover { background: #333; }

        .d-add-video-row { display: flex; gap: 8px; align-items: stretch; margin-top: 0.5rem; }
        .d-add-video-input {
          flex: 1; padding: 9px 12px;
          background: #FBF6EF; border: 1.5px solid #E0C8B8;
          border-radius: 10px; font-size: 0.84rem;
          font-family: var(--font-body), 'Nunito', sans-serif;
          color: #2A1A0E; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .d-add-video-input::placeholder { color: #C8B0A0; }
        .d-add-video-input:focus { border-color: #C05A3B; box-shadow: 0 0 0 3px rgba(192,90,59,0.12); }
        .d-add-video-btn {
          padding: 9px 16px; background: rgba(42,26,14,0.08);
          border: 1.5px solid rgba(42,26,14,0.15); color: #4A3020;
          border-radius: 10px; font-size: 0.82rem; font-weight: 600;
          font-family: var(--font-body), 'Nunito', sans-serif;
          cursor: pointer; transition: background 0.15s, border-color 0.15s;
          white-space: nowrap; display: flex; align-items: center; gap: 5px;
        }
        .d-add-video-btn:hover:not(:disabled) { background: rgba(42,26,14,0.14); }
        .d-add-video-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Lightbox */
        @keyframes d-lb-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes d-lb-img { from { opacity: 0; transform: scale(0.93); } to { opacity: 1; transform: scale(1); } }

        .d-lb-overlay {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(0,0,0,0.9); backdrop-filter: blur(12px);
          display: flex; align-items: center; justify-content: center;
          animation: d-lb-in 0.2s ease both;
        }
        .d-lb-img {
          max-width: 92vw; max-height: 88vh;
          object-fit: contain; border-radius: 10px;
          animation: d-lb-img 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
          user-select: none;
        }
        .d-lb-close {
          position: fixed; top: 18px; right: 18px;
          width: 40px; height: 40px; border-radius: 50%;
          background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: white; transition: background 0.15s; z-index: 301;
        }
        .d-lb-close:hover { background: rgba(255,255,255,0.22); }
        .d-lb-nav {
          position: fixed; top: 50%; transform: translateY(-50%);
          width: 44px; height: 44px; border-radius: 50%;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: white; transition: background 0.15s; z-index: 301;
        }
        .d-lb-nav:hover { background: rgba(255,255,255,0.2); }
        .d-lb-nav.lb-prev { left: 16px; }
        .d-lb-nav.lb-next { right: 16px; }
        .d-lb-counter {
          position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
          background: rgba(0,0,0,0.5); color: rgba(255,255,255,0.75);
          font-size: 0.78rem; padding: 5px 14px; border-radius: 999px;
          backdrop-filter: blur(4px); z-index: 301;
        }

        @media (min-width: 1024px) {
          .d-lb-nav.lb-prev { left: 240px; }
        }

        @media (max-width: 640px) {
          .d-wrap { padding: 0 1rem 5rem; }
          .d-header { padding: 1.25rem 0 1.25rem; }
          .d-piso-title { font-size: 1.5rem; }
          .d-big-score { font-size: 2rem; }
          .d-card { padding: 1.25rem; }
          .d-info-grid { grid-template-columns: 1fr 1fr; }
          .d-gallery { margin: -1.25rem -1.25rem 1.25rem; }
          .d-gallery-main { height: 200px; }
          .d-lb-nav.lb-prev { left: 8px; }
          .d-lb-nav.lb-next { right: 8px; }
          .d-map-iframe { height: 220px; }
          .d-video-embed iframe { height: 260px; }
          .d-add-foto-row { flex-wrap: wrap; }
          .d-row2 { grid-template-columns: 1fr; }
        }
        @media (max-width: 420px) {
          .d-wrap { padding: 0 0.75rem 5rem; }
          .d-card { padding: 1rem; }
          .d-gallery { margin: -1rem -1rem 1rem; }
          .d-piso-title { font-size: 1.3rem; }
          .d-info-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleSubirFotoArchivo}
      />

      <div className="d-root">
        <div className="d-bg" />

        <div className="d-wrap">

          {/* ── HEADER ── */}
          <div className="d-header">
            <div className="d-header-left">
              <button className="d-back" onClick={() => router.push(`/sala/${codigo}/pisos`)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="d-breadcrumb">
                Sala <span>{session.salaNombre}</span> &rsaquo; <span>Aptos</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="d-edit-btn" onClick={abrirEditar} disabled={loading || !piso}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Editar
              </button>
              <button className="d-del-btn" onClick={handleEliminarPiso} disabled={eliminando}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1.5 3h9M4 3V2h4v1M5 5.5v3M7 5.5v3M2 3l.75 7.5h6.5L10 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Eliminar
              </button>
            </div>
          </div>

          {/* ── LOADING ── */}
          {loading && (
            <div className="d-card d-main">
              <div className="d-skeleton" style={{ height: 36, width: '65%', marginBottom: 20 }} />
              <div className="d-skeleton" style={{ height: 20, width: '40%', marginBottom: 12 }} />
              <div className="d-skeleton" style={{ height: 20, width: '55%' }} />
            </div>
          )}

          {/* ── PISO DETAIL ── */}
          {!loading && piso && (
            <>
              <div className="d-card d-main">
                {/* ── GALERÍA ── */}
                {piso.fotos?.length > 0 && (
                  <div className="d-gallery">
                    <div className="d-gallery-img-wrap" onClick={() => setLightboxOpen(true)}>
                      <img
                        className="d-gallery-main"
                        src={piso.fotos[fotoActiva]}
                        alt={`Foto ${fotoActiva + 1}`}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <div className="d-gallery-expand">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M1 4V1h3M7 1h3v3M10 7v3H7M4 10H1V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Ver en grande
                      </div>
                    </div>
                    {piso.fotos.length > 1 && (
                      <>
                        <div className="d-gallery-count">{fotoActiva + 1} / {piso.fotos.length}</div>
                        <button className="d-gallery-nav prev" onClick={() => setFotoActiva(i => (i - 1 + piso.fotos.length) % piso.fotos.length)}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M8 10L4 6l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button className="d-gallery-nav next" onClick={() => setFotoActiva(i => (i + 1) % piso.fotos.length)}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <div className="d-gallery-dots">
                          {piso.fotos.map((_, i) => (
                            <button key={i} className={`d-gallery-dot${i === fotoActiva ? ' active' : ''}`} onClick={() => setFotoActiva(i)} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="d-piso-title">{piso.titulo}</div>

                {/* Score */}
                <div className="d-score-row">
                  {promedio !== null ? (
                    <>
                      <div className="d-big-score">{promedio.toFixed(1)}</div>
                      <div className="d-score-stars">
                        <div className="d-stars-row">
                          {Array.from({ length: 5 }, (_, i) => (
                            <svg key={i} width="18" height="18" viewBox="0 0 12 12"
                              fill={i < Math.round(promedio) ? '#C8823A' : 'none'}
                              stroke={i < Math.round(promedio) ? '#C8823A' : '#D0B8A8'}
                              strokeWidth="1"
                            >
                              <path d="M6 1l1.35 2.73 3.01.44-2.18 2.12.51 3.01L6 7.9 3.31 9.3l.51-3.01L1.64 4.17l3.01-.44z" />
                            </svg>
                          ))}
                        </div>
                        <div className="d-score-sub">{votos.length} voto{votos.length !== 1 ? 's' : ''} · promedio</div>
                      </div>
                    </>
                  ) : (
                    <div className="d-no-score">Aún no hay votos — ¡sé el primero!</div>
                  )}
                </div>

                {/* Info badges */}
                <div className="d-info-grid">
                  {piso.precio !== null && (
                    <div className="d-info-item">
                      <div className="d-info-label">Alquiler</div>
                      <div className="d-info-val d-info-val-price">$ {piso.precio.toLocaleString('es-UY')}</div>
                    </div>
                  )}
                  {piso.gastos_comunes !== null && (
                    <div className="d-info-item">
                      <div className="d-info-label">Gastos comunes</div>
                      <div className="d-info-val d-info-val-price">$ {piso.gastos_comunes.toLocaleString('es-UY')}</div>
                    </div>
                  )}
                  {piso.precio !== null && piso.gastos_comunes !== null && (
                    <div className="d-info-item">
                      <div className="d-info-label">Total/mes</div>
                      <div className="d-info-val d-info-val-price">$ {(piso.precio + piso.gastos_comunes).toLocaleString('es-UY')}</div>
                    </div>
                  )}
                  {piso.m2 !== null && (
                    <div className="d-info-item">
                      <div className="d-info-label">Superficie</div>
                      <div className="d-info-val d-info-val-m2">{piso.m2} m²</div>
                    </div>
                  )}
                  {piso.precio !== null && piso.m2 !== null && (
                    <div className="d-info-item">
                      <div className="d-info-label">$/m²</div>
                      <div className="d-info-val" style={{ color: '#A07060' }}>$ {(piso.precio / piso.m2).toFixed(0)}</div>
                    </div>
                  )}
                  {piso.zona && (
                    <div className="d-info-item">
                      <div className="d-info-label">Zona</div>
                      <div className="d-info-val d-info-val-zona">{piso.zona}</div>
                    </div>
                  )}
                </div>

                {piso.url && (
                  <a className="d-url-btn" href={piso.url} target="_blank" rel="noopener noreferrer">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M5 2.5H2.5V10.5H10.5V8M7.5 2.5H10.5M10.5 2.5V5.5M10.5 2.5L5.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Ver anuncio
                  </a>
                )}

                {piso.notas && (
                  <div className="d-notas-box">
                    <div className="d-notas-label">Notas</div>
                    <div className="d-notas-text">{piso.notas}</div>
                  </div>
                )}
              </div>

              {/* ── FOTOS ── */}
              <div className="d-card d-photos-card">
                <div className="d-section-title">Fotos</div>

                {piso.fotos?.length > 0 && (
                  <div className="d-photos-grid">
                    {piso.fotos.map((foto, i) => (
                      <div
                        key={i}
                        className={`d-photo-thumb${i === fotoActiva ? ' active-thumb' : ''}`}
                        onClick={() => setFotoActiva(i)}
                      >
                        <img src={foto} alt={`Foto ${i + 1}`} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
                        <button
                          className="d-photo-del"
                          onClick={e => { e.stopPropagation(); handleEliminarFoto(i) }}
                          title="Eliminar foto"
                        >
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Subir desde archivo */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    className="d-upload-foto-btn"
                    disabled={subiendoFoto}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {subiendoFoto ? (
                      <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(58,112,80,0.3)', borderTopColor: '#3A7050', animation: 'd-spin 0.7s linear infinite', display: 'inline-block' }} />
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M6.5 1.5v8M3 5l3.5-3.5L10 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M1.5 10.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    )}
                    {subiendoFoto ? 'Subiendo...' : 'Subir foto desde dispositivo'}
                  </button>
                </div>

                {/* URL manual */}
                <form className="d-add-foto-row" onSubmit={handleAgregarFotoUrl}>
                  <input
                    className="d-add-foto-input"
                    type="url"
                    placeholder="O pegar URL de imagen..."
                    value={nuevaFotoUrl}
                    onChange={e => setNuevaFotoUrl(e.target.value)}
                  />
                  <button type="submit" className="d-add-foto-btn" disabled={!nuevaFotoUrl.trim() || guardandoFoto}>
                    {guardandoFoto ? (
                      <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(192,90,59,0.3)', borderTopColor: '#C05A3B', animation: 'd-spin 0.7s linear infinite', display: 'inline-block' }} />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                    Añadir
                  </button>
                </form>
              </div>

              {/* ── MAPA ── */}
              {piso.direccion && (
                <div className="d-card d-map-card">
                  <div className="d-section-title">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6, marginBottom: 2 }}>
                      <path d="M8 1C5.79 1 4 2.79 4 5c0 3.25 4 10 4 10s4-6.75 4-10c0-2.21-1.79-4-4-4zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="#C05A3B"/>
                    </svg>
                    Ubicación
                  </div>
                  <div className="d-map-container">
                    <iframe
                      className="d-map-iframe"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(piso.direccion + ', Uruguay')}&output=embed&z=16`}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Mapa de ubicación"
                    />
                    <div className="d-map-address">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
                        <path d="M6.5 1C4.57 1 3 2.57 3 4.5c0 2.63 3.5 7.5 3.5 7.5S10 7.13 10 4.5C10 2.57 8.43 1 6.5 1zm0 4.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="#C05A3B"/>
                      </svg>
                      {piso.direccion}
                    </div>
                  </div>
                  <a
                    className="d-map-open-btn"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(piso.direccion + ', Uruguay')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M4 2H2V10H10V8M7 2h3M10 2v3M10 2L5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Abrir en Google Maps
                  </a>
                </div>
              )}

              {/* ── VIDEOS ── */}
              <div className="d-card d-videos-card">
                <div className="d-section-title">Videos</div>

                {/* Tabs */}
                {piso.videos && piso.videos.length > 0 && (
                  <div className="d-video-tabs">
                    {piso.videos.map((url, i) => {
                      const parsed = parseVideo(url)
                      const label = parsed.tipo === 'youtube' ? `▶ YouTube ${i + 1}` : parsed.tipo === 'tiktok' ? `♪ TikTok ${i + 1}` : `🔗 Video ${i + 1}`
                      return (
                        <button
                          key={i}
                          className={`d-video-tab${videoActivo === i ? ' active' : ''}`}
                          onClick={() => setVideoActivo(videoActivo === i ? null : i)}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Video activo */}
                {videoActivo !== null && piso.videos?.[videoActivo] && (() => {
                  const url = piso.videos[videoActivo]
                  const parsed = parseVideo(url)
                  if (parsed.tipo === 'youtube' && parsed.embedUrl) {
                    return (
                      <div className="d-video-embed" style={{ position: 'relative' }}>
                        <iframe
                          src={parsed.embedUrl}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title="YouTube video"
                        />
                        <button
                          className="d-video-del-btn"
                          onClick={() => { handleEliminarVideo(videoActivo); setVideoActivo(null) }}
                        >
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                          Eliminar
                        </button>
                      </div>
                    )
                  }
                  if (parsed.tipo === 'tiktok' && parsed.embedUrl) {
                    return (
                      <div className="d-video-embed" style={{ position: 'relative', background: '#000' }}>
                        <iframe
                          src={parsed.embedUrl}
                          allow="fullscreen"
                          title="TikTok video"
                          style={{ height: 580 }}
                        />
                        <button
                          className="d-video-del-btn"
                          onClick={() => { handleEliminarVideo(videoActivo); setVideoActivo(null) }}
                        >
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                          Eliminar
                        </button>
                      </div>
                    )
                  }
                  // URL desconocida
                  return (
                    <div className="d-tiktok-card" style={{ position: 'relative' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F0E8DF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <circle cx="9" cy="9" r="7.5" stroke="#C05A3B" strokeWidth="1.3"/>
                          <path d="M7 6l5 3-5 3V6z" fill="#C05A3B"/>
                        </svg>
                      </div>
                      <div className="d-tiktok-info">
                        <div className="d-tiktok-label">Video</div>
                        <div className="d-tiktok-url">{url}</div>
                      </div>
                      <a className="d-tiktok-btn" href={url} target="_blank" rel="noopener noreferrer">Abrir</a>
                      <button
                        onClick={() => { handleEliminarVideo(videoActivo); setVideoActivo(null) }}
                        style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#A07060', fontSize: '1.1rem', lineHeight: 1, padding: 4 }}
                        title="Eliminar video"
                      >×</button>
                    </div>
                  )
                })()}

                {/* Sin videos */}
                {(!piso.videos || piso.videos.length === 0) && (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '0.82rem', color: '#B09080', fontStyle: 'italic' }}>
                    No hay videos — agregá un TikTok o YouTube del apto
                  </div>
                )}

                {/* Agregar video */}
                <form onSubmit={handleAgregarVideo}>
                  <div className="d-add-video-row">
                    <input
                      className="d-add-video-input"
                      type="url"
                      placeholder="https://www.tiktok.com/... o https://youtu.be/..."
                      value={nuevaVideoUrl}
                      onChange={e => { setNuevaVideoUrl(e.target.value); setVideoError('') }}
                    />
                    <button type="submit" className="d-add-video-btn" disabled={!nuevaVideoUrl.trim() || guardandoVideo}>
                      {guardandoVideo ? (
                        <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(74,48,32,0.25)', borderTopColor: '#4A3020', animation: 'd-spin 0.7s linear infinite', display: 'inline-block' }} />
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      )}
                      {guardandoVideo ? 'Reconociendo...' : 'Añadir'}
                    </button>
                  </div>
                  {videoError && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#B03A1A', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M6 3.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <circle cx="6" cy="8.5" r="0.5" fill="currentColor"/>
                      </svg>
                      {videoError}
                    </div>
                  )}
                </form>
              </div>

              {/* ── VOTAR ── */}
              <div className="d-card d-vote-card">
                <div className="d-section-title">
                  Tu voto, <em>{session.miembroNombre}</em>
                </div>

                <form onSubmit={handleVotar}>
                  <div className="d-star-selector">
                    {Array.from({ length: 5 }, (_, i) => {
                      const val = i + 1
                      const filled = val <= (hovered || puntuacion)
                      return (
                        <button
                          key={val}
                          type="button"
                          className={`d-star-btn${puntuacion === val ? ' active' : ''}`}
                          onMouseEnter={() => setHovered(val)}
                          onMouseLeave={() => setHovered(0)}
                          onClick={() => setPuntuacion(val)}
                        >
                          <svg width="32" height="32" viewBox="0 0 32 32"
                            fill={filled ? '#C8823A' : 'none'}
                            stroke={filled ? '#C8823A' : '#D0B8A8'}
                            strokeWidth="1.5"
                            style={{ transition: 'fill 0.12s, stroke 0.12s, filter 0.12s', filter: filled ? 'drop-shadow(0 0 6px rgba(200,130,58,0.45))' : 'none' }}
                          >
                            <path d="M16 3l3.6 7.3 8.1 1.2-5.85 5.7 1.38 8.05L16 21.4l-7.23 3.85 1.38-8.05L4.3 11.5l8.1-1.2z" />
                          </svg>
                        </button>
                      )
                    })}
                  </div>

                  {puntuacion > 0 && (
                    <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#A07060', marginBottom: '1rem', letterSpacing: '0.04em' }}>
                      {['', 'Descartado', 'Flojo', 'Interesante', 'Me gusta', '¡Perfecto!'][puntuacion]}
                    </div>
                  )}

                  <textarea
                    className="d-comment-input"
                    placeholder="Deja un comentario (opcional)..."
                    value={comentario}
                    onChange={e => setComentario(e.target.value)}
                  />

                  {votoError && <div className="d-vote-err">{votoError}</div>}

                  <button type="submit" className={`d-vote-btn${votoGuardado ? ' saved' : ''}`} disabled={guardandoVoto}>
                    {guardandoVoto && <span className="d-spinner" />}
                    {votoGuardado ? (
                      <>
                        <span className="d-check">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        ¡Voto guardado!
                      </>
                    ) : (
                      guardandoVoto ? 'Guardando...' : (votos.find(v => v.miembro_id === session.miembroId) ? 'Actualizar voto' : 'Guardar voto')
                    )}
                  </button>
                </form>
              </div>

              {/* ── VOTOS DE TODOS ── */}
              <div className="d-card d-votes-card">
                <div className="d-section-title">Votos del grupo</div>
                {votos.length === 0 ? (
                  <div className="d-no-votes">Nadie ha votado todavía</div>
                ) : (
                  votos.map(voto => {
                    const m = miembros.find(mb => mb.id === voto.miembro_id)
                    if (!m) return null
                    const esTuyo = voto.miembro_id === session.miembroId
                    return (
                      <div key={voto.id} className="d-member-vote">
                        <MemberAvatar nombre={m.nombre} color={m.color} gradiente={m.gradiente} icono={m.icono} size="sm" />
                        <div className="d-mv-info">
                          <div className="d-mv-top">
                            <span className="d-mv-name">{m.nombre}</span>
                            {esTuyo && <span className="d-mv-you">tú</span>}
                            <div className="d-mv-stars">
                              {Array.from({ length: 5 }, (_, i) => (
                                <svg key={i} width="12" height="12" viewBox="0 0 12 12"
                                  fill={i < voto.puntuacion ? '#C8823A' : 'none'}
                                  stroke={i < voto.puntuacion ? '#C8823A' : '#D0B8A8'}
                                  strokeWidth="1"
                                >
                                  <path d="M6 1l1.35 2.73 3.01.44-2.18 2.12.51 3.01L6 7.9 3.31 9.3l.51-3.01L1.64 4.17l3.01-.44z" />
                                </svg>
                              ))}
                              <span className="d-mv-score">{voto.puntuacion}</span>
                            </div>
                          </div>
                          {voto.comentario && (
                            <div className="d-mv-comment">"{voto.comentario}"</div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MODAL EDITAR ── */}
      {editOpen && (
        <div className="d-modal-overlay">
          <div className="d-modal">
            <div className="d-modal-header">
              <div className="d-modal-title">Editar apto</div>
              <button className="d-modal-close" onClick={() => setEditOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditar}>
              <div className="d-field">
                <label className="d-label">
                  URL del anuncio
                  <span className="d-label-hint"> — pegá un link para importar datos</span>
                </label>
                <input
                  className="d-input"
                  type="url"
                  value={editForm.url}
                  autoFocus
                  onChange={e => {
                    const val = e.target.value
                    setEditForm(f => ({ ...f, url: val }))
                    setEditScrapeDetected(detectSupportedSite(val))
                    setEditScrapeMsg('')
                  }}
                  placeholder="https://infocasas.com.uy/..."
                />
                {(editScrapeDetected || editScraping || editScrapeMsg) && (
                  <div className="d-scrape-wrap">
                    {editScrapeDetected && !editScraping && !editScrapeMsg.startsWith('Importado') && (
                      <button type="button" onClick={handleEditScrape} disabled={editScraping} className="d-scrape-btn">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M14 8A6 6 0 104.5 12.96" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M10 8l4 0 0-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Importar datos de {editScrapeDetected}
                      </button>
                    )}
                    {editScraping && (
                      <div className="d-scrape-loading">
                        <span className="d-scrape-spinner" />
                        Extrayendo datos del enlace...
                      </div>
                    )}
                    {editScrapeMsg && !editScraping && (
                      <div className={`d-scrape-feedback ${editScrapeMsg.startsWith('Importado') ? 'success' : 'error'}`}>
                        {editScrapeMsg.startsWith('Importado') ? (
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
                        <span>{editScrapeMsg}</span>
                        {!editScrapeMsg.startsWith('Importado') && editScrapeDetected && (
                          <button type="button" className="d-scrape-retry" onClick={handleEditScrape}>Reintentar</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="d-field">
                <label className="d-label">Nombre / Título *</label>
                <input className="d-input" type="text" required value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Apto Pocitos 3 dorm" />
              </div>

              <div className="d-row2">
                <div className="d-field">
                  <label className="d-label">Alquiler <span className="d-label-hint">($ UYU)</span></label>
                  <input className="d-input" type="number" inputMode="decimal" min={0} value={editForm.alquiler} onChange={e => setEditForm(f => ({ ...f, alquiler: e.target.value }))} placeholder="22000" />
                </div>
                <div className="d-field">
                  <label className="d-label">Gastos comunes <span className="d-label-hint">($ UYU)</span></label>
                  <input className="d-input" type="number" inputMode="decimal" min={0} value={editForm.gastosCom} onChange={e => setEditForm(f => ({ ...f, gastosCom: e.target.value }))} placeholder="6000" />
                </div>
              </div>

              {(editForm.alquiler || editForm.gastosCom) && ((parseFloat(editForm.alquiler) || 0) + (parseFloat(editForm.gastosCom) || 0)) > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, background: 'rgba(46,125,82,0.08)', border: '1px solid rgba(46,125,82,0.15)', marginTop: -6, marginBottom: 14 }}>
                  <span style={{ fontSize: '0.72rem', color: '#3A7050' }}>Total mensual:</span>
                  <span style={{ fontFamily: 'var(--font-code), monospace', fontSize: '0.95rem', fontWeight: 500, color: '#2E7D52' }}>$ {((parseFloat(editForm.alquiler) || 0) + (parseFloat(editForm.gastosCom) || 0)).toLocaleString('es-UY')}</span>
                  {editForm.alquiler && editForm.gastosCom && (
                    <span style={{ fontSize: '0.68rem', color: '#5A8869', marginLeft: 'auto', opacity: 0.7 }}>
                      $ {parseFloat(editForm.alquiler).toLocaleString('es-UY')} + $ {parseFloat(editForm.gastosCom).toLocaleString('es-UY')} GC
                    </span>
                  )}
                </div>
              )}

              <div className="d-row2">
                <div className="d-field">
                  <label className="d-label">Metros cuadrados</label>
                  <input className="d-input" type="number" inputMode="numeric" min={0} value={editForm.m2} onChange={e => setEditForm(f => ({ ...f, m2: e.target.value }))} placeholder="75" />
                </div>
              </div>

              <div className="d-field">
                <label className="d-label">Zona / Barrio</label>
                <input className="d-input" type="text" value={editForm.zona} onChange={e => setEditForm(f => ({ ...f, zona: e.target.value }))} placeholder="Ej: Pocitos" />
              </div>

              <div className="d-field">
                <label className="d-label">Dirección <span className="d-label-hint">— se muestra en el mapa</span></label>
                <input className="d-input" type="text" value={editForm.direccion} onChange={e => setEditForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Ej: Av. Brasil 2850, Pocitos, Montevideo" />
              </div>

              <div className="d-field">
                <label className="d-label">Notas</label>
                <textarea className="d-input d-textarea" value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} placeholder="Impresiones, pros, contras..." />
              </div>

              {editError && (
                <div className="d-form-error">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6.5 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="6.5" cy="9" r="0.6" fill="currentColor" />
                  </svg>
                  {editError}
                </div>
              )}

              <button type="submit" className="d-save-btn" disabled={editGuardando || !editForm.titulo.trim()}>
                {editGuardando && <span className="d-spinner" />}
                {editGuardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX ── */}
      {lightboxOpen && piso && piso.fotos?.length > 0 && (
        <div className="d-lb-overlay" onClick={() => setLightboxOpen(false)}>
          <button className="d-lb-close" onClick={() => setLightboxOpen(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <img
            key={fotoActiva}
            className="d-lb-img"
            src={piso.fotos[fotoActiva]}
            alt={`Foto ${fotoActiva + 1}`}
            onClick={e => e.stopPropagation()}
          />

          {piso.fotos.length > 1 && (
            <>
              <button
                className="d-lb-nav lb-prev"
                onClick={e => { e.stopPropagation(); setFotoActiva(i => (i - 1 + piso.fotos.length) % piso.fotos.length) }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 12L5 7l4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className="d-lb-nav lb-next"
                onClick={e => { e.stopPropagation(); setFotoActiva(i => (i + 1) % piso.fotos.length) }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2l4 5-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="d-lb-counter">{fotoActiva + 1} / {piso.fotos.length}</div>
            </>
          )}
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
