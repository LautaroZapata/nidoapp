import { describe, it, expect } from 'vitest'
import {
  extractMercadoLibre,
  mergeData,
  extractAllImages,
  isValidListingImage,
  parsePrice,
  extractNumber,
} from '../route'

// ── parsePrice ───────────────────────────────

describe('parsePrice', () => {
  it('parses USD prices with U$S prefix', () => {
    const result = parsePrice('U$S 1.200')
    expect(result).toEqual({ amount: 1200, currency: 'USD' })
  })

  it('parses UYU prices with $ prefix', () => {
    const result = parsePrice('$ 25000')
    expect(result).toEqual({ amount: 25000, currency: 'UYU' })
  })

  it('returns null for empty string', () => {
    expect(parsePrice('')).toBeNull()
  })
})

// ── extractNumber ────────────────────────────

describe('extractNumber', () => {
  it('extracts number from string with text', () => {
    expect(extractNumber('75 m2')).toBe(75)
  })

  it('returns null for null input', () => {
    expect(extractNumber(null)).toBeNull()
  })
})

// ── isValidListingImage ──────────────────────

describe('isValidListingImage', () => {
  it('accepts valid listing image URLs', () => {
    expect(isValidListingImage('https://http2.mlstatic.com/D_NQ_NP_123-MLU456.jpg', 'mercadolibre')).toBe(true)
  })

  it('rejects URLs with logo in path', () => {
    expect(isValidListingImage('https://example.com/logo.png', 'example')).toBe(false)
  })

  it('rejects SVG files', () => {
    expect(isValidListingImage('https://example.com/image.svg', 'example')).toBe(false)
  })

  it('rejects GIF files', () => {
    expect(isValidListingImage('https://example.com/image.gif', 'example')).toBe(false)
  })

  it('rejects non-http URLs', () => {
    expect(isValidListingImage('data:image/png;base64,abc', 'example')).toBe(false)
  })

  it('rejects tiny images by URL hint', () => {
    expect(isValidListingImage('https://example.com/img.jpg?w=50', 'example')).toBe(false)
  })

  it('accepts images with reasonable size hint', () => {
    expect(isValidListingImage('https://example.com/img.jpg?w=800', 'example')).toBe(true)
  })
})

// ── extractAllImages ─────────────────────────

describe('extractAllImages', () => {
  it('extracts images from img tags', () => {
    const html = `
      <img src="https://example.com/photo1.jpg" />
      <img src="https://example.com/photo2.jpg" />
    `
    const imgs = extractAllImages(html, 'example')
    expect(imgs).toContain('https://example.com/photo1.jpg')
    expect(imgs).toContain('https://example.com/photo2.jpg')
  })

  it('extracts images from data-src attributes', () => {
    const html = `<img data-src="https://example.com/lazy.jpg" />`
    const imgs = extractAllImages(html, 'example')
    expect(imgs).toContain('https://example.com/lazy.jpg')
  })

  it('extracts images from JSON arrays in HTML', () => {
    const html = `<script>var data = {"images":["https://example.com/json-photo.jpg"]}</script>`
    const imgs = extractAllImages(html, 'example')
    expect(imgs).toContain('https://example.com/json-photo.jpg')
  })

  it('deduplicates images', () => {
    const html = `
      <img src="https://example.com/photo.jpg" />
      <img src="https://example.com/photo.jpg" />
    `
    const imgs = extractAllImages(html, 'example')
    const count = imgs.filter(u => u === 'https://example.com/photo.jpg').length
    expect(count).toBe(1)
  })

  it('limits to 30 images', () => {
    const tags = Array.from({ length: 40 }, (_, i) =>
      `<img src="https://example.com/photo${i}.jpg" />`
    ).join('\n')
    const imgs = extractAllImages(tags, 'example')
    expect(imgs.length).toBe(30)
  })

  it('filters out junk images', () => {
    const html = `
      <img src="https://example.com/photo.jpg" />
      <img src="https://example.com/logo.png" />
      <img src="https://example.com/icon.png" />
    `
    const imgs = extractAllImages(html, 'example')
    expect(imgs).toContain('https://example.com/photo.jpg')
    expect(imgs).not.toContain('https://example.com/logo.png')
    expect(imgs).not.toContain('https://example.com/icon.png')
  })
})

// ── extractMercadoLibre ──────────────────────

describe('extractMercadoLibre', () => {
  it('extracts gastos comunes with "Expensas $X" pattern', () => {
    const html = `
      <html>
        <head><meta property="og:title" content="Apartamento 2 dormitorios" /></head>
        <body>
          <span>Expensas $8500</span>
        </body>
      </html>
    `
    const result = extractMercadoLibre(html)
    expect(result.gastosCom).toBe(8500)
  })

  it('extracts gastos comunes with "Gastos comunes $X" pattern', () => {
    const html = `
      <html>
        <head><meta property="og:title" content="Apartamento" /></head>
        <body>
          <div>Gastos comunes $6.500</div>
        </body>
      </html>
    `
    const result = extractMercadoLibre(html)
    expect(result.gastosCom).toBe(6500)
  })

  it('extracts gastos comunes with "G.C. $X" pattern', () => {
    const html = `
      <html>
        <head><meta property="og:title" content="Monoambiente" /></head>
        <body>
          <span>G.C. $4500</span>
        </body>
      </html>
    `
    const result = extractMercadoLibre(html)
    expect(result.gastosCom).toBe(4500)
  })

  it('extracts title and price from og:title', () => {
    const html = `
      <html>
        <head><meta property="og:title" content="Apartamento U$S 850 - 65m2 - 2 dormitorios en Pocitos" /></head>
        <body></body>
      </html>
    `
    const result = extractMercadoLibre(html)
    expect(result.titulo).toBe('Apartamento U$S 850 - 65m2 - 2 dormitorios en Pocitos')
    expect(result.precio).toBe(850)
    expect(result.moneda).toBe('USD')
    expect(result.m2).toBe(65)
    expect(result.dormitorios).toBe(2)
  })

  it('extracts ML images from embedded JSON pictures array', () => {
    const html = `
      <html>
        <head><meta property="og:title" content="Apartamento" /></head>
        <body>
          <script>
            var data = {"pictures":[{"url":"https://http2.mlstatic.com/D_NQ_NP_1.jpg"},{"url":"https://http2.mlstatic.com/D_NQ_NP_2.jpg"}]};
          </script>
        </body>
      </html>
    `
    const result = extractMercadoLibre(html)
    expect(result.fotos).toContain('https://http2.mlstatic.com/D_NQ_NP_1.jpg')
    expect(result.fotos).toContain('https://http2.mlstatic.com/D_NQ_NP_2.jpg')
  })

  it('extracts mlstatic.com image URLs from HTML body', () => {
    const html = `
      <html>
        <head><meta property="og:title" content="Apartamento" /></head>
        <body>
          <div data-url="https://http2.mlstatic.com/D_NQ_NP_photo.jpg"></div>
        </body>
      </html>
    `
    const result = extractMercadoLibre(html)
    expect(result.fotos).toContain('https://http2.mlstatic.com/D_NQ_NP_photo.jpg')
  })
})

// ── mergeData ────────────────────────────────

describe('mergeData', () => {
  it('preserves long descriptions up to 2000 chars', () => {
    const longDesc = 'A'.repeat(1500)
    const result = mergeData({ notas: longDesc })
    expect(result.notas).toBe(longDesc)
    expect(result.notas!.length).toBe(1500)
  })

  it('does NOT truncate description at 500 chars', () => {
    const desc = 'B'.repeat(800)
    const result = mergeData({ notas: desc })
    expect(result.notas).toBe(desc)
    expect(result.notas!.length).toBe(800)
  })

  it('truncates descriptions longer than 2000 chars', () => {
    const desc = 'C'.repeat(2500)
    const result = mergeData({ notas: desc })
    expect(result.notas!.length).toBe(2000)
    expect(result.notas!.endsWith('...')).toBe(true)
  })

  it('merges data from multiple sources with priority', () => {
    const source1 = { titulo: 'First', precio: 100 }
    const source2 = { titulo: 'Second', precio: 200, zona: 'Pocitos' }
    const result = mergeData(source1, source2)
    expect(result.titulo).toBe('First') // first source wins
    expect(result.precio).toBe(100)
    expect(result.zona).toBe('Pocitos') // second source fills gap
  })

  it('prefers the source with more photos', () => {
    const source1 = { fotos: ['a.jpg'] }
    const source2 = { fotos: ['b.jpg', 'c.jpg', 'd.jpg'] }
    const result = mergeData(source1, source2)
    expect(result.fotos).toEqual(['b.jpg', 'c.jpg', 'd.jpg'])
  })

  it('fills in gastosCom from first available source', () => {
    const source1 = {}
    const source2 = { gastosCom: 5000 }
    const result = mergeData(source1, source2)
    expect(result.gastosCom).toBe(5000)
  })
})
