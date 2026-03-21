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

// ── Site-specific: Facebook ──────────────────
// Facebook Marketplace y posts de grupos/páginas inmobiliarias.
// Meta whitelist-ea el UA "facebookexternalhit" y devuelve OG tags incluso en Marketplace.

function extractFacebook(html: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {}

  // OG tags — Facebook los incluye en Marketplace y posts públicos
  const title = getMetaContent(html, 'og:title')
  if (title) data.titulo = title

  const desc = getMetaContent(html, 'og:description') || getMetaContent(html, 'description')
  if (desc) {
    data.notas = desc
    // Intentar extraer precio de la descripción (común en Marketplace y grupos)
    const priceMatch = desc.match(/(U\$S|USD|US\$|\$)\s*([\d.,]+)/i)
    if (priceMatch) {
      const p = parsePrice(`${priceMatch[1]} ${priceMatch[2]}`)
      if (p) { data.precio = p.amount; data.moneda = p.currency }
    }
    // m2
    const m2 = desc.match(/([\d]+)\s*m[²2]/i)
    if (m2) data.m2 = parseInt(m2[1])
    // dormitorios
    const dorm = desc.match(/(\d+)\s*(?:dorm|dormitorio|hab|ambiente)/i)
    if (dorm) data.dormitorios = parseInt(dorm[1])
    // baños
    const bano = desc.match(/(\d+)\s*(?:baño|ba[ñn]o)/i)
    if (bano) data.banos = parseInt(bano[1])
    // zona — a menudo aparece "en Pocitos" o "Barrio: Cordón"
    const zona = desc.match(/(?:en|barrio:?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{2,25})/i)
    if (zona) data.zona = zona[1].trim()
  }

  // Fotos OG
  const images = getAllMetaContent(html, 'og:image')
  if (images.length > 0) data.fotos = images.filter(u => !u.includes('static.xx.fbcdn') || u.includes('/t51.'))

  // Marketplace: el precio a veces aparece en el titulo ("Apartamento 2d - $25000")
  if (data.titulo && !data.precio) {
    const pMatch = data.titulo.match(/(U\$S|USD|US\$|\$)\s*([\d.,]+)/i)
    if (pMatch) {
      const p = parsePrice(`${pMatch[1]} ${pMatch[2]}`)
      if (p) { data.precio = p.amount; data.moneda = p.currency }
    }
  }

  return data
}

// ── Site-specific: Instagram ─────────────────

/** Extrae la caption real del HTML del embed de Instagram.
 *  Instagram pone el caption en el cuerpo del embed, no en og:description. */
function parseInstagramEmbedCaption(html: string): string | null {
  // Patrón 1: <div class="Caption"> ... texto ... </div>
  const captionDivMatch = html.match(/<div[^>]+class="[^"]*Caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  if (captionDivMatch) {
    const text = stripHtml(captionDivMatch[1]).trim()
    if (text.length > 10 && !/^see (this|an) instagram/i.test(text)) return text.slice(0, 600)
  }

  // Patrón 2: <p class="..."> con la caption
  const pTagMatch = html.match(/<p[^>]+class="[^"]*[Cc]aption[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
  if (pTagMatch) {
    const text = stripHtml(pTagMatch[1]).trim()
    if (text.length > 10) return text.slice(0, 600)
  }

  // Patrón 3: buscar el JSON _sharedData o additionalData embebido en el HTML
  const sharedDataMatch = html.match(/window\._sharedData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/)
  if (sharedDataMatch) {
    try {
      const json = JSON.parse(sharedDataMatch[1])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const edges: any[] = json?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media?.edge_media_to_caption?.edges
      if (edges?.[0]?.node?.text) return String(edges[0].node.text).slice(0, 600)
    } catch { /* ignorar */ }
  }

  // Patrón 4: buscar texto entre comillas largas en el HTML del embed (último recurso)
  const textBlockMatch = html.match(/<article[\s\S]*?<\/article>/i)
  if (textBlockMatch) {
    const text = stripHtml(textBlockMatch[0]).replace(/\s+/g, ' ').trim()
    // Ignorar si parece boilerplate de Instagram
    if (text.length > 20 && !/^(instagram|see this|view this)/i.test(text)) {
      return text.slice(0, 600)
    }
  }

  return null
}

function extractInstagram(html: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {}

  const title = getMetaContent(html, 'og:title')
  if (title) data.titulo = title

  const desc = getMetaContent(html, 'og:description') || getMetaContent(html, 'description')
  // Solo usar og:description si no es el texto genérico de Instagram
  if (desc && !/^see (this|an) instagram (post|photo|reel)/i.test(desc)) {
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
  if (host.includes('facebook') || host.includes('fb.me') || host.includes('fb.com')) return 'facebook'
  return 'generic'
}

// ── MercadoLibre: API pública (evita problemas de JS/SPA) ──

function extractMLItemId(url: string): string | null {
  const match = url.match(/(ML[A-Z])-?(\d+)/i)
  if (!match) return null
  return `${match[1].toUpperCase()}${match[2]}`
}

async function fetchMLApi(itemId: string): Promise<Partial<ScrapedData>> {
  const data: Partial<ScrapedData> = {}

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const [itemRes, descRes] = await Promise.all([
      fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      }),
      fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      }).catch(() => null),
    ])
    clearTimeout(timeout)

    if (!itemRes.ok) return {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item: any = await itemRes.json()

    data.titulo = item.title || null
    if (item.price) data.precio = item.price
    if (item.currency_id) data.moneda = item.currency_id

    // Fotos — usar tamaño original (-O)
    if (item.pictures && Array.isArray(item.pictures)) {
      data.fotos = item.pictures
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => {
          const u: string = p.secure_url || p.url || ''
          return u.replace(/-[A-Z]\.(\w+)$/, '-O.$1')
        })
        .filter(Boolean)
        .slice(0, 20)
    }

    // Atributos (m², dormitorios, baños, gastos comunes)
    if (item.attributes && Array.isArray(item.attributes)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const attr of item.attributes as any[]) {
        const id = (attr.id || '').toUpperCase()
        const val: string = attr.value_name || ''
        if (!val) continue
        if (['TOTAL_AREA', 'COVERED_AREA'].includes(id) && !data.m2)
          data.m2 = parseFloat(val) || null
        if (['ROOMS', 'BEDROOMS'].includes(id) && !data.dormitorios)
          data.dormitorios = parseInt(val) || null
        if (['FULL_BATHROOMS', 'BATHROOMS'].includes(id) && !data.banos)
          data.banos = parseInt(val) || null
        if (id === 'MAINTENANCE_FEE' && !data.gastosCom)
          data.gastosCom = parseFloat(val.replace(/\D/g, '')) || null
      }
    }

    // Ubicación
    if (item.location) {
      if (item.location.neighborhood?.name) data.zona = item.location.neighborhood.name
      else if (item.location.city?.name) data.zona = item.location.city.name
      if (item.location.address_line) data.direccion = item.location.address_line
    }

    // Descripción
    if (descRes?.ok) {
      try {
        const desc = await descRes.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((desc as any).plain_text) data.notas = String((desc as any).plain_text).slice(0, 500)
      } catch { /* ignore */ }
    }

    return data
  } catch {
    return {}
  }
}

// ── Instagram: URL de embed como fallback ────

function getInstagramEmbedUrl(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)
  if (!match) return null
  return `https://www.instagram.com/p/${match[1]}/embed/captioned/`
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

    // ── Normalizar URLs de mobile ──
    // m.facebook.com → www.facebook.com (OG tags más completos)
    if (parsedUrl.hostname === 'm.facebook.com') {
      parsedUrl.hostname = 'www.facebook.com'
    }
    const normalizedUrl = parsedUrl.toString()

    const site = detectSite(normalizedUrl)

    // ── MercadoLibre: intentar API pública primero (no requiere JS) ──
    let mlApiData: Partial<ScrapedData> = {}
    if (site === 'mercadolibre') {
      const itemId = extractMLItemId(url)
      if (itemId) mlApiData = await fetchMLApi(itemId)
    }

    // ── Fetch HTML ──
    // Para Instagram y Facebook, usar UA del crawler de Facebook — Meta lo whitelistea para OG tags
    const ua = (site === 'instagram' || site === 'facebook')
      ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
      : USER_AGENT

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const hasMLData = !!(mlApiData.titulo || (mlApiData.fotos && mlApiData.fotos.length > 0))

    let html = ''
    try {
      const res = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-UY,es;q=0.9,en;q=0.5',
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timeout)

      if (res.ok) {
        html = await res.text()
      } else if (!hasMLData) {
        return NextResponse.json(
          { error: `No se pudo acceder al sitio (HTTP ${res.status})` },
          { status: 422 }
        )
      }
    } catch (err) {
      clearTimeout(timeout)
      // Si tenemos datos de la API de ML, podemos continuar sin HTML
      if (!hasMLData) {
        const message = err instanceof Error && err.name === 'AbortError'
          ? 'El sitio tardó demasiado en responder'
          : 'No se pudo conectar al sitio'
        return NextResponse.json({ error: message }, { status: 422 })
      }
    }

    // ── Facebook: detectar login wall antes de parsear ──
    if (site === 'facebook' && html) {
      const fbTitle = getMetaContent(html, 'og:title') ?? ''
      const isLoginWall =
        /log\s*in|iniciar\s*sesión|inicia\s*sesión/i.test(fbTitle) ||
        html.includes('"requireLogin":true') ||
        html.includes('"isLoginPage":true') ||
        html.includes('id="login_form"') ||
        (html.includes('login') && !html.includes('og:description'))
      if (isLoginWall) {
        return NextResponse.json(
          { error: 'Facebook requiere iniciar sesión para ver este contenido. Probá con un enlace público o de Marketplace abierto.' },
          { status: 422 }
        )
      }
    }

    // ── Extract from HTML (si tenemos) ──
    const ogData: Partial<ScrapedData> = html ? extractFromOG(html) : {}
    const jsonLdData: Partial<ScrapedData> = html ? extractFromJsonLd(html) : {}

    let siteData: Partial<ScrapedData> = {}
    if (html) {
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
        case 'facebook':
          siteData = extractFacebook(html)
          break
        default: {
          const host = parsedUrl.hostname
          siteData = { fotos: extractAllImages(html, host) }
          break
        }
      }
    }

    // ── Instagram: siempre intentar embed para caption real y fotos adicionales ──
    // og:description de Instagram es siempre texto genérico ("See this Instagram post by @user...")
    // El embed contiene la caption real y a veces más fotos.
    if (site === 'instagram') {
      const embedUrl = getInstagramEmbedUrl(url)
      if (embedUrl) {
        try {
          const embedCtrl = new AbortController()
          const embedTimeout = setTimeout(() => embedCtrl.abort(), 10000)
          const embedRes = await fetch(embedUrl, {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'es-UY,es;q=0.9,en;q=0.5',
            },
            signal: embedCtrl.signal,
          })
          clearTimeout(embedTimeout)
          if (embedRes.ok) {
            const embedHtml = await embedRes.text()

            // 1. Intentar extraer caption real del embed
            const embedCaption = parseInstagramEmbedCaption(embedHtml)
            if (embedCaption) {
              siteData.notas = embedCaption
              // Re-extraer datos numéricos de la caption real
              const priceM = embedCaption.match(/(U\$S|USD|US\$|\$)\s*([\d.,]+)/i)
              if (priceM && !siteData.precio) {
                const p = parsePrice(`${priceM[1]} ${priceM[2]}`)
                if (p) { siteData.precio = p.amount; siteData.moneda = p.currency }
              }
              const m2M = embedCaption.match(/([\d]+)\s*m[²2]/i)
              if (m2M && !siteData.m2) siteData.m2 = parseInt(m2M[1])
              const dormM = embedCaption.match(/(\d+)\s*(?:dorm|dormitorio|hab)/i)
              if (dormM && !siteData.dormitorios) siteData.dormitorios = parseInt(dormM[1])
            }

            // 2. Si el embed tiene más fotos que OG, usarlas
            const embedSite = extractInstagram(embedHtml)
            const embedOg = extractFromOG(embedHtml)
            const embedFotos = (embedSite.fotos?.length ?? 0) > (embedOg.fotos?.length ?? 0)
              ? embedSite.fotos ?? []
              : embedOg.fotos ?? []
            if (embedFotos.length > (siteData.fotos?.length ?? 0)) {
              siteData.fotos = embedFotos
            }

            // 3. Si no teníamos titulo, tomarlo del embed
            if (!siteData.titulo && (embedSite.titulo || embedOg.titulo)) {
              siteData.titulo = embedSite.titulo || embedOg.titulo
            }
          }
        } catch { /* embed fallback es best-effort */ }
      }
    }

    // Merge: ML API > site-specific > JSON-LD > OG (priority order)
    const result = mergeData(mlApiData, siteData, jsonLdData, ogData)

    // AI analysis: extract data from page text for missing fields
    const pageText = html ? stripHtml(html) : ''
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
