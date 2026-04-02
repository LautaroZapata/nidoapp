import { createClient } from '@/lib/supabase'

export const SUPPORTED_SITES = [
  { pattern: /infocasas/i, label: 'InfoCasas' },
  { pattern: /mercadolibre/i, label: 'MercadoLibre' },
  { pattern: /veocasas/i, label: 'VeoCasas' },
  { pattern: /instagram\.com/i, label: 'Instagram' },
  { pattern: /facebook\.com|fb\.me|fb\.com/i, label: 'Facebook' },
]

export function detectSupportedSite(url: string): string | null {
  if (!url.trim()) return null
  try { new URL(url) } catch { return null }
  for (const s of SUPPORTED_SITES) {
    if (s.pattern.test(url)) return s.label
  }
  if (/^https?:\/\/.+\..+/.test(url)) return 'sitio'
  return null
}

export function buildNotas(d: { notas?: string; dormitorios?: number; banos?: number; moneda?: string }): string {
  const parts: string[] = []
  if (d.dormitorios) parts.push(`${d.dormitorios} dormitorio${d.dormitorios > 1 ? 's' : ''}`)
  if (d.banos) parts.push(`${d.banos} baño${d.banos > 1 ? 's' : ''}`)
  if (d.moneda) parts.push(`Moneda: ${d.moneda}`)
  const header = parts.length > 0 ? parts.join(' · ') : ''
  if (d.notas && header) return `${header}\n${d.notas}`
  return d.notas || header
}

export async function resolverVideoUrl(url: string): Promise<string> {
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

export async function comprimirImagen(file: File, maxWidth = 1600, quality = 0.82): Promise<File> {
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

export async function subirArchivoStorage(salaId: string, file: File): Promise<string | null> {
  const supabase = createClient()
  const compressed = await comprimirImagen(file)
  const path = `${salaId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
  const { error } = await supabase.storage.from('pisos').upload(path, compressed, { contentType: 'image/jpeg' })
  if (error) return null
  const { data } = supabase.storage.from('pisos').getPublicUrl(path)
  return data.publicUrl
}
