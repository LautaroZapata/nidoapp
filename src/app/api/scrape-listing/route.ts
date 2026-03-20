import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

/* ────────────────────────────────────────────
   /api/scrape-listing
   Receives a URL, fetches the page HTML,
   and extracts apartment listing data via:
   1. OpenGraph meta tags (universal)
   2. JSON-LD structured data
   3. Site-specific HTML parsing
   4. AI-powered description analysis (Groq)
   ──────────────────────────────────────────── */

interface ScrapedData {
  titulo: string | null
  precio: number | null        // alquiler
  gastosCom: number | null     // gastos comunes
  m2: number | null
  zona: string | null
  direccion: string | null
  fotos: string[]
  notas: string | null
  moneda: string | null        // UYU, USD
  dormitorios: number | null
  banos: number | null
}

const EMPTY: ScrapedData = {
  titulo: null, precio: null, gastosCom: null, m2: null,
  zona: null, direccion: null, fotos: [], notas: null,
  moneda: null, dormitorios: null, banos: null,
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ── Helpers ──────────────────────────────────

function getMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapeRegex(property)}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeHtmlEntities(m[1].trim())
  }
  return null
}

function getAllMetaContent(html: string, property: string): string[] {
  const results: string[] = []
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]+content=["']([^"']*)["']`, 'gi'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapeRegex(property)}["']`, 'gi'),
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(html)) !== null) {
      if (m[1]?.trim()) results.push(decodeHtmlEntities(m[1].trim()))
    }
  }
  return [...new Set(results)]
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1])
      if (Array.isArray(parsed)) results.push(...parsed)
      else results.push(parsed)
    } catch { /* skip malformed JSON-LD */ }
  }
  return results
}

function parsePrice(s: string): { amount: number; currency: string } | null {
  if (!s) return null
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  const match = cleaned.match(/(U\$S|USD|US\$|UYU|\$U|\$)\s*([\d.]+)/)
  if (match) {
    const amount = parseFloat(match[2])
    if (isNaN(amount)) return null
    const raw = match[1].toUpperCase()
    const currency = (raw.includes('U$S') || raw.includes('USD') || raw.includes('US$')) ? 'USD' : 'UYU'
    return { amount, currency }
  }
  const numMatch = cleaned.match(/([\d.]+)/)
  if (numMatch) {
    const amount = parseFloat(numMatch[1])
    if (!isNaN(amount) && amount > 0) return { amount, currency: 'UYU' }
  }
  return null
}

function extractNumber(s: string | null): number | null {
  if (!s) return null
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  const m = cleaned.match(/([\d.]+)/)
  return m ? parseFloat(m[1]) || null : null
}

/** Strip HTML tags, collapse whitespace */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract all image URLs from HTML, filtering out junk */
function extractAllImages(html: string, siteHost: string): string[] {
  const imgs: string[] = []
  // 1. src and data-src attributes on img tags
  const imgTagRe = /<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = imgTagRe.exec(html)) !== null) {
    const url = m[1].trim()
    if (isValidListingImage(url, siteHost)) imgs.push(url)
  }
  // 2. Background images in style attributes
  const bgRe = /url\(["']?(https?:\/\/[^"')]+\.(?:jpg|jpeg|png|webp)[^"')]*)["']?\)/gi
  while ((m = bgRe.exec(html)) !== null) {
    const url = m[1].trim()
    if (isValidListingImage(url, siteHost)) imgs.push(url)
  }
  // 3. JSON arrays with image URLs (common in SPA data props)
  const jsonImgRe = /"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi
  while ((m = jsonImgRe.exec(html)) !== null) {
    const url = m[1].trim()
    if (isValidListingImage(url, siteHost)) imgs.push(url)
  }
  // Dedupe, preserve order, limit to 20
  return [...new Set(imgs)].slice(0, 20)
}

function isValidListingImage(url: string, _siteHost: string): boolean {
  if (!url.startsWith('http')) return false
  const lower = url.toLowerCase()
  // Skip tiny icons, logos, avatars, tracking pixels, social icons
  const junkPatterns = [
    'logo', 'icon', 'avatar', 'favicon', 'sprite',
    'tracking', 'pixel', 'badge', 'button', 'arrow',
    'placeholder', 'loading', 'spinner', 'blank',
    'facebook', 'twitter', 'whatsapp', 'instagram.com/static',
    'google', 'analytics', 'adsense',
    '1x1', '2x2', 'spacer', 'transparent',
    '.svg', '.gif',
  ]
  if (junkPatterns.some(p => lower.includes(p))) return false
  // Skip tiny images by URL hints (e.g., w=50, size=small)
  const tinyMatch = lower.match(/[?&](?:w|width|size)=(\d+)/i)
  if (tinyMatch && parseInt(tinyMatch[1]) < 100) return false
  // Prefer images that look like listing photos (larger dimensions in URL)
  return true
}

// ── Generic OG extractor ─────────────────────

function extractFromOG(html: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {}
  const title = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title')
  if (title) data.titulo = title
  const desc = getMetaContent(html, 'og:description') || getMetaContent(html, 'description')
  if (desc) data.notas = desc
  const images = getAllMetaContent(html, 'og:image')
  if (images.length > 0) data.fotos = images
  const priceStr = getMetaContent(html, 'og:price:amount') || getMetaContent(html, 'product:price:amount')
  if (priceStr) {
    const p = parseFloat(priceStr.replace(/\./g, '').replace(',', '.'))
    if (!isNaN(p)) data.precio = p
  }
  const currencyStr = getMetaContent(html, 'og:price:currency') || getMetaContent(html, 'product:price:currency')
  if (currencyStr) data.moneda = currencyStr
  return data
}

// ── JSON-LD extractor ────────────────────────

function extractFromJsonLd(html: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {}
  const items = extractJsonLd(html)

  for (const item of items) {
    const type = String(item['@type'] || '').toLowerCase()
    if (type.includes('product') || type.includes('realestate') || type.includes('apartment') || type.includes('residence')) {
      if (item.name) data.titulo = String(item.name)
      if (item.description) data.notas = String(item.description)
      if (item.image) {
        const imgs = Array.isArray(item.image) ? item.image : [item.image]
        data.fotos = imgs.map(String).filter(Boolean)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offers = item.offers as any
      if (offers) {
        const offer = Array.isArray(offers) ? offers[0] : offers
        if (offer?.price) data.precio = parseFloat(String(offer.price))
        if (offer?.priceCurrency) data.moneda = String(offer.priceCurrency)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const address = item.address as any
      if (address) {
        if (typeof address === 'string') data.direccion = address
        else {
          const parts = [address.streetAddress, address.addressLocality, address.addressRegion].filter(Boolean)
          if (parts.length) data.direccion = parts.join(', ')
          if (address.addressLocality) data.zona = String(address.addressLocality)
        }
      }
      if (item.floorSize) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fs = item.floorSize as any
        const val = typeof fs === 'object' ? fs.value : fs
        data.m2 = extractNumber(String(val))
      }
      if (item.numberOfRooms) data.dormitorios = parseInt(String(item.numberOfRooms))
      if (item.numberOfBathroomsTotal) data.banos = parseInt(String(item.numberOfBathroomsTotal))
    }
  }
  return data
}

// ── Site-specific: InfoCasas ─────────────────

function extractInfoCasas(html: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {}

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) data.titulo = decodeHtmlEntities(h1[1].replace(/<[^>]+>/g, '').trim())

  // Price: "U$S 25.000" or "$ 25.000"
  const priceMatch = html.match(/(U\$S|USD|\$)\s*([\d.,]+)/i)
  if (priceMatch) {
    const p = parsePrice(`${priceMatch[1]} ${priceMatch[2]}`)
    if (p) { data.precio = p.amount; data.moneda = p.currency }
  }

  // Gastos comunes
  const gcMatch = html.match(/(?:gastos?\s*comunes?|G\.?C\.?)\s*(?::?\s*)\$?\s*([\d.,]+)/i)
    || html.match(/([\d.,]+)\s*(?:G\.?C\.?)/i)
  if (gcMatch) data.gastosCom = extractNumber(gcMatch[1])

  // m2
  const m2Match = html.match(/([\d.,]+)\s*m[²2]/i)
  if (m2Match) data.m2 = extractNumber(m2Match[1])

  // Dormitorios
  const dormMatch = html.match(/(\d+)\s*(?:dorm|dormitorio|hab|habitaci[oó]n)/i)
  if (dormMatch) data.dormitorios = parseInt(dormMatch[1])

  // Baños
  const banoMatch = html.match(/(\d+)\s*(?:baño|ba[ñn]o)/i)
  if (banoMatch) data.banos = parseInt(banoMatch[1])

  // Location
  const zonaMatch = html.match(/(?:barrio|zona|ubicaci[oó]n)\s*:?\s*([^<,\n]+)/i)
  if (zonaMatch) data.zona = zonaMatch[1].trim()

  // Images — extract ALL from page
  data.fotos = extractAllImages(html, 'infocasas')

  return data
}

// ── Site-specific: MercadoLibre ──────────────

function extractMercadoLibre(html: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {}

  const title = getMetaContent(html, 'og:title')
  if (title) {
    data.titulo = title
    const pMatch = title.match(/(U\$S|USD|US\$)\s*([\d.,]+)/i)
    if (pMatch) {
      const p = parsePrice(`${pMatch[1]} ${pMatch[2]}`)
      if (p) { data.precio = p.amount; data.moneda = p.currency }
    }
    const m2 = title.match(/([\d]+)\s*m[²2]/i)
    if (m2) data.m2 = parseInt(m2[1])
    const dorm = title.match(/(\d+)\s*(?:dorm|dormitorio|amb)/i)
    if (dorm) data.dormitorios = parseInt(dorm[1])
  }

  const priceMatch = html.match(/price[^>]*>(U?\$?S?\s*[\d.,]+)/i)
    || html.match(/(U\$S|USD)\s*([\d.,]+)/i)
  if (priceMatch && !data.precio) {
    const p = parsePrice(priceMatch[0])
    if (p) { data.precio = p.amount; data.moneda = p.currency }
  }

  const locMatch = (data.titulo || '').match(/en\s+([^-–,]+?)(?:\s*[-–]|\s*$)/i)
  if (locMatch) data.zona = locMatch[1].trim()

  // Images from ML
  data.fotos = extractAllImages(html, 'mercadolibre')

  return data
}

// ── Site-specific: VeoCasas ──────────────────

function extractVeoCasas(html: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {}

  const title = getMetaContent(html, 'og:title')
  if (title) data.titulo = title

  const priceMatch = html.match(/(US?\$|U\$S|USD)\s*([\d.,]+)/i)
  if (priceMatch) {
    const p = parsePrice(`${priceMatch[1]} ${priceMatch[2]}`)
    if (p) { data.precio = p.amount; data.moneda = p.currency }
  }

  const m2 = html.match(/([\d]+)\s*m[²2]/i)
  if (m2) data.m2 = parseInt(m2[1])

  const dorm = html.match(/(\d+)\s*(?:dorm|dormitorio|habitaci[oó]n)/i)
  if (dorm) data.dormitorios = parseInt(dorm[1])

  const bano = html.match(/(\d+)\s*(?:baño|ba[ñn]o)/i)
  if (bano) data.banos = parseInt(bano[1])

  data.fotos = extractAllImages(html, 'veocasas')

  return data
}

// ── Site-specific: Instagram ─────────────────

function extractInstagram(html: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {}

  const title = getMetaContent(html, 'og:title')
  if (title) data.titulo = title

  const desc = getMetaContent(html, 'og:description') || getMetaContent(html, 'description')
  if (desc) {
    data.notas = desc
    const priceMatch = desc.match(/(U\$S|USD|US\$|\$)\s*([\d.,]+)/i)
    if (priceMatch) {
      const p = parsePrice(`${priceMatch[1]} ${priceMatch[2]}`)
      if (p) { data.precio = p.amount; data.moneda = p.currency }
    }
    const m2 = desc.match(/([\d]+)\s*m[²2]/i)
    if (m2) data.m2 = parseInt(m2[1])
    const dorm = desc.match(/(\d+)\s*(?:dorm|dormitorio|hab)/i)
    if (dorm) data.dormitorios = parseInt(dorm[1])
  }

  // Instagram can have multiple images in OG
  const images = getAllMetaContent(html, 'og:image')
  if (images.length > 0) data.fotos = images

  return data
}

// ── Detect site type ─────────────────────────

function detectSite(url: string): string {
  const host = new URL(url).hostname.toLowerCase()
  if (host.includes('infocasas')) return 'infocasas'
  if (host.includes('mercadolibre')) return 'mercadolibre'
  if (host.includes('veocasas')) return 'veocasas'
  if (host.includes('instagram')) return 'instagram'
  return 'generic'
}

// ── AI-powered description analysis ──────────

async function extractWithAI(text: string, existingData: ScrapedData): Promise<Partial<ScrapedData>> {
  if (!process.env.GROQ_API_KEY) return {}
  // Only call AI if we're missing key fields and have text to analyze
  const missingFields = !existingData.m2 || !existingData.zona || !existingData.gastosCom
    || !existingData.dormitorios || !existingData.banos || !existingData.direccion
  if (!missingFields || !text || text.length < 20) return {}

  // Trim text to avoid sending too much
  const input = text.slice(0, 3000)

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: `Sos un extractor de datos de avisos inmobiliarios uruguayos. Dado el texto de un aviso, extraé los datos estructurados. Devolvé SOLO un JSON válido sin markdown.

Campos a extraer (null si no se encuentra):
- precio: number (alquiler mensual, sin puntos ni comas)
- gastosCom: number (gastos comunes mensuales)
- moneda: "USD" o "UYU"
- m2: number (metros cuadrados, puede aparecer como "m2", "m²", "metros")
- zona: string (barrio/zona, ej: "Pocitos", "Centro", "Cordón")
- direccion: string (dirección completa si aparece)
- dormitorios: number
- banos: number

Ejemplo: {"precio":25000,"gastosCom":6500,"moneda":"UYU","m2":75,"zona":"Pocitos","direccion":"Av. Brasil 2850","dormitorios":2,"banos":1}`
        },
        {
          role: 'user',
          content: input
        }
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) return {}

    // Parse JSON — handle potential markdown wrapping
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(jsonStr)
    const data: Partial<ScrapedData> = {}

    if (parsed.precio != null && !existingData.precio) data.precio = Number(parsed.precio) || null
    if (parsed.gastosCom != null && !existingData.gastosCom) data.gastosCom = Number(parsed.gastosCom) || null
    if (parsed.moneda && !existingData.moneda) data.moneda = parsed.moneda
    if (parsed.m2 != null && !existingData.m2) data.m2 = Number(parsed.m2) || null
    if (parsed.zona && !existingData.zona) data.zona = String(parsed.zona)
    if (parsed.direccion && !existingData.direccion) data.direccion = String(parsed.direccion)
    if (parsed.dormitorios != null && !existingData.dormitorios) data.dormitorios = Number(parsed.dormitorios) || null
    if (parsed.banos != null && !existingData.banos) data.banos = Number(parsed.banos) || null

    return data
  } catch {
    // AI extraction is best-effort, don't fail the whole request
    return {}
  }
}

// ── Main merge logic ─────────────────────────

function mergeData(...sources: Partial<ScrapedData>[]): ScrapedData {
  const result: ScrapedData = { ...EMPTY }

  for (const src of sources) {
    if (src.titulo && !result.titulo) result.titulo = src.titulo
    if (src.precio != null && result.precio == null) result.precio = src.precio
    if (src.gastosCom != null && result.gastosCom == null) result.gastosCom = src.gastosCom
    if (src.m2 != null && result.m2 == null) result.m2 = src.m2
    if (src.zona && !result.zona) result.zona = src.zona
    if (src.direccion && !result.direccion) result.direccion = src.direccion
    if (src.notas && !result.notas) result.notas = src.notas
    if (src.moneda && !result.moneda) result.moneda = src.moneda
    if (src.dormitorios != null && result.dormitorios == null) result.dormitorios = src.dormitorios
    if (src.banos != null && result.banos == null) result.banos = src.banos
    // Fotos: prefer the source with most images
    if (src.fotos && src.fotos.length > result.fotos.length) result.fotos = src.fotos
  }

  if (!result.titulo && result.dormitorios) {
    const parts = [`${result.dormitorios} dorm`]
    if (result.zona) parts.push(result.zona)
    result.titulo = `Apto ${parts.join(' - ')}`
  }

  if (result.notas && result.notas.length > 500) {
    result.notas = result.notas.slice(0, 497) + '...'
  }

  return result
}

// ── Route handler ────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL es requerida' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
    }

    // Fetch the page
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    let html: string
    try {
      const res = await fetch(parsedUrl.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-UY,es;q=0.9,en;q=0.5',
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timeout)

      if (!res.ok) {
        return NextResponse.json(
          { error: `No se pudo acceder al sitio (HTTP ${res.status})` },
          { status: 422 }
        )
      }

      html = await res.text()
    } catch (err) {
      clearTimeout(timeout)
      const message = err instanceof Error && err.name === 'AbortError'
        ? 'El sitio tardó demasiado en responder'
        : 'No se pudo conectar al sitio'
      return NextResponse.json({ error: message }, { status: 422 })
    }

    // Extract data from multiple sources
    const site = detectSite(url)
    const ogData = extractFromOG(html)
    const jsonLdData = extractFromJsonLd(html)

    let siteData: Partial<ScrapedData> = {}
    switch (site) {
      case 'infocasas':
        siteData = extractInfoCasas(html)
        break
      case 'mercadolibre':
        siteData = extractMercadoLibre(html)
        break
      case 'veocasas':
        siteData = extractVeoCasas(html)
        break
      case 'instagram':
        siteData = extractInstagram(html)
        break
      default: {
        // Generic: extract all images from the page
        const host = parsedUrl.hostname
        siteData = { fotos: extractAllImages(html, host) }
        break
      }
    }

    // Merge: site-specific > JSON-LD > OG (priority order)
    const result = mergeData(siteData, jsonLdData, ogData)

    // AI analysis: extract data from page text for missing fields
    const pageText = stripHtml(html)
    const descText = [result.notas, result.titulo, pageText].filter(Boolean).join('\n')
    const aiData = await extractWithAI(descText, result)

    // Merge AI data into result (only fills gaps)
    if (aiData.precio != null && result.precio == null) result.precio = aiData.precio
    if (aiData.gastosCom != null && result.gastosCom == null) result.gastosCom = aiData.gastosCom
    if (aiData.m2 != null && result.m2 == null) result.m2 = aiData.m2
    if (aiData.zona && !result.zona) result.zona = aiData.zona
    if (aiData.direccion && !result.direccion) result.direccion = aiData.direccion
    if (aiData.moneda && !result.moneda) result.moneda = aiData.moneda
    if (aiData.dormitorios != null && result.dormitorios == null) result.dormitorios = aiData.dormitorios
    if (aiData.banos != null && result.banos == null) result.banos = aiData.banos

    // Check if we got anything useful
    const hasData = result.titulo || result.precio != null || result.fotos.length > 0 || result.m2 != null
    if (!hasData) {
      return NextResponse.json(
        { error: 'No se pudo extraer información del enlace. El sitio podría requerir JavaScript o bloquear el acceso.', data: result },
        { status: 422 }
      )
    }

    return NextResponse.json({ data: result, site })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
