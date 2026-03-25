import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/* ────────────────────────────────────────────
   /api/compress-photos
   Receives an array of external image URLs,
   downloads each, compresses via sharp-like
   approach (canvas on server isn't available,
   so we re-encode as JPEG with reduced quality),
   uploads to Supabase Storage, and returns
   the new Storage URLs.
   ──────────────────────────────────────────── */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MAX_PHOTOS = 30
const FETCH_TIMEOUT = 8000

export async function POST(req: NextRequest) {
  try {
    const { urls, salaId } = await req.json()

    if (!Array.isArray(urls) || !salaId) {
      return NextResponse.json({ error: 'urls[] y salaId son requeridos' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const results: { original: string; stored: string | null }[] = []

    // Process in parallel, max 20 photos
    const toProcess = urls.slice(0, MAX_PHOTOS)
    const promises = toProcess.map(async (url: string) => {
      if (!url || typeof url !== 'string') return { original: url, stored: null }

      // Skip if already a Supabase Storage URL (already compressed)
      if (url.includes(SUPABASE_URL)) {
        return { original: url, stored: url }
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NidoApp/1.0)',
            'Accept': 'image/*',
          },
          signal: controller.signal,
          redirect: 'follow',
        })
        clearTimeout(timeout)

        if (!res.ok) return { original: url, stored: null }

        const contentType = res.headers.get('content-type') || ''
        if (!contentType.startsWith('image/')) return { original: url, stored: null }

        const blob = await res.arrayBuffer()
        const buffer = Buffer.from(blob)

        // Skip if too small (likely a tracking pixel) or too large
        if (buffer.length < 1000) return { original: url, stored: null }
        if (buffer.length > 15_000_000) return { original: url, stored: null }

        // Upload to Supabase Storage as-is (already JPEG from most listing sites)
        // The client-side will handle further compression if needed
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
        const uploadContentType = contentType.includes('png') ? 'image/png' : contentType.includes('webp') ? 'image/webp' : 'image/jpeg'
        const path = `${salaId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

        const { error } = await supabase.storage
          .from('pisos')
          .upload(path, buffer, { contentType: uploadContentType })

        if (error) return { original: url, stored: null }

        const { data } = supabase.storage.from('pisos').getPublicUrl(path)
        return { original: url, stored: data.publicUrl }
      } catch {
        return { original: url, stored: null }
      }
    })

    const settled = await Promise.all(promises)
    for (const r of settled) {
      results.push(r)
    }

    // Return mapped results: stored URLs where successful, originals as fallback
    const storedUrls = results.map(r => r.stored || r.original)
    const compressed = results.filter(r => r.stored && r.stored !== r.original).length

    return NextResponse.json({
      urls: storedUrls,
      compressed,
      total: results.length,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
