/**
 * Genera todas las variantes del logo de NidoApp desde el original PNG.
 *
 * Variantes generadas en branding/logos/:
 *   logo-original.png          — terracota sobre blanco (1400×1000, original)
 *   logo-transparente.png      — terracota sobre fondo transparente
 *   logo-sobre-crema.png       — terracota sobre crema (#FAF5EE)
 *   logo-sobre-oscuro.png      — terracota sobre marrón oscuro (#2A1A0E)
 *   logo-blanco.png            — logo blanco sobre fondo transparente
 *   logo-negativo.png          — logo blanco sobre marrón oscuro (#2A1A0E)
 *   logo-oscuro.png            — logo marrón oscuro sobre fondo transparente
 *   logo-app-512.png           — ícono app 512×512 (terracota sobre oscuro, padding)
 *   logo-app-1024.png          — ícono app 1024×1024 (App Store / Play Store)
 *   logo-favicon-32.png        — favicon 32×32
 *   logo-favicon-16.png        — favicon 16×16
 *   logo-og.png                — Open Graph 1200×630
 */

import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INPUT = path.join(__dirname, '../branding/Gemini_Generated_Image_g7vbjug7vbjug7vb.png')
const OUT   = path.join(__dirname, '../branding/logos')

// Colores de la marca
const TERRA  = { r: 192, g: 90,  b: 59  }  // #C05A3B
const DARK   = { r: 42,  g: 26,  b: 14  }  // #2A1A0E
const CREAM  = { r: 250, g: 245, b: 238 }  // #FAF5EE
const WHITE  = { r: 255, g: 255, b: 255 }

await mkdir(OUT, { recursive: true })

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extrae el logo con fondo transparente (hace transparentes los píxeles claros) */
async function transparente(size) {
  const img = sharp(INPUT)
  const meta = await img.metadata()
  const w = size ?? meta.width
  const h = size ?? meta.height

  const { data, info } = await sharp(INPUT)
    .resize(w, h, { fit: 'contain', background: WHITE })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const px = new Uint8Array(data)
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i+1], b = px[i+2]
    // Píxeles muy claros → transparentes
    if (r > 220 && g > 220 && b > 220) {
      px[i+3] = 0
    }
  }
  return sharp(Buffer.from(px), { raw: { width: info.width, height: info.height, channels: 4 } })
}

/** Retinta todos los píxeles visibles con un color dado */
async function recolorear(transparentSharp, color) {
  const { data, info } = await transparentSharp
    .raw()
    .toBuffer({ resolveWithObject: true })

  const px = new Uint8Array(data)
  for (let i = 0; i < px.length; i += 4) {
    if (px[i+3] > 10) {   // píxel visible
      px[i]   = color.r
      px[i+1] = color.g
      px[i+2] = color.b
    }
  }
  return sharp(Buffer.from(px), { raw: { width: info.width, height: info.height, channels: 4 } })
}

/** Compone un logo sobre un fondo de color sólido */
async function sobreFondo(logoSharp, bg, w, h) {
  const logoBuf = await logoSharp.png().toBuffer()
  return sharp({
    create: { width: w, height: h, channels: 4, background: { ...bg, alpha: 255 } }
  }).composite([{ input: logoBuf, gravity: 'center' }])
}

/** Genera ícono cuadrado con el logo centrado y con padding */
async function iconoCuadrado(size, logoBg, bg) {
  const padded = Math.round(size * 0.2)          // 20% padding cada lado
  const logoSize = size - padded * 2
  const logo = await recolorear(await transparente(logoSize), logoBg)
  const logoBuf = await logo.png().toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: { ...bg, alpha: 255 } }
  }).composite([{ input: logoBuf, gravity: 'center' }])
}

// ─── Generar variantes ────────────────────────────────────────────────────────

const meta = await sharp(INPUT).metadata()
const W = meta.width, H = meta.height

console.log(`📐 Original: ${W}×${H}`)

// 1. Original (copia limpia)
await sharp(INPUT).toFile(path.join(OUT, 'logo-original.png'))
console.log('✓ logo-original.png')

// 2. Transparente (terracota, sin fondo)
const transp = await transparente()
await transp.clone().png().toFile(path.join(OUT, 'logo-transparente.png'))
console.log('✓ logo-transparente.png')

// 3. Sobre crema
const transpParaCrema = await transparente()
await (await sobreFondo(transpParaCrema, CREAM, W, H)).png().toFile(path.join(OUT, 'logo-sobre-crema.png'))
console.log('✓ logo-sobre-crema.png')

// 4. Sobre oscuro (terracota sobre marrón)
const transpParaOscuro = await transparente()
await (await sobreFondo(transpParaOscuro, DARK, W, H)).png().toFile(path.join(OUT, 'logo-sobre-oscuro.png'))
console.log('✓ logo-sobre-oscuro.png')

// 5. Logo blanco sobre transparente
const transpParaBlanco = await transparente()
const logoBlanco = await recolorear(transpParaBlanco, WHITE)
await logoBlanco.clone().png().toFile(path.join(OUT, 'logo-blanco.png'))
console.log('✓ logo-blanco.png')

// 6. Negativo: logo blanco sobre fondo oscuro
const transpParaNeg = await transparente()
const logoBlancoNeg = await recolorear(transpParaNeg, WHITE)
await (await sobreFondo(logoBlancoNeg, DARK, W, H)).png().toFile(path.join(OUT, 'logo-negativo.png'))
console.log('✓ logo-negativo.png')

// 7. Logo oscuro sobre transparente
const transpParaDark = await transparente()
const logoOscuro = await recolorear(transpParaDark, DARK)
await logoOscuro.clone().png().toFile(path.join(OUT, 'logo-oscuro.png'))
console.log('✓ logo-oscuro.png')

// 8. App icon 512×512 (terracota sobre oscuro, con padding — estilo iOS/Android)
await (await iconoCuadrado(512, TERRA, DARK)).png().toFile(path.join(OUT, 'logo-app-512.png'))
console.log('✓ logo-app-512.png')

// 9. App icon 1024×1024
await (await iconoCuadrado(1024, TERRA, DARK)).png().toFile(path.join(OUT, 'logo-app-1024.png'))
console.log('✓ logo-app-1024.png')

// 10. Favicon 32×32
const transpFav32 = await transparente(32)
await transpFav32.png().toFile(path.join(OUT, 'logo-favicon-32.png'))
console.log('✓ logo-favicon-32.png')

// 11. Favicon 16×16
const transpFav16 = await transparente(16)
await transpFav16.png().toFile(path.join(OUT, 'logo-favicon-16.png'))
console.log('✓ logo-favicon-16.png')

// 12. OG Image 1200×630 (fondo oscuro, logo centrado grande)
{
  const logoH = 340
  const logoW = Math.round(logoH * (W / H))
  const transp12 = await transparente()
  const logoBuf = await (await recolorear(transp12, TERRA))
    .resize(logoW, logoH, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
    .png()
    .toBuffer()

  // Texto "nido" como SVG overlay
  const textSvg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <text x="600" y="530" font-family="Georgia, serif" font-size="52" font-weight="bold"
      fill="rgba(250,245,238,0.85)" text-anchor="middle" letter-spacing="-1">nido</text>
    <text x="600" y="580" font-family="Georgia, serif" font-size="22"
      fill="rgba(250,245,238,0.4)" text-anchor="middle" letter-spacing="3">PARA CONVIVIR MEJOR</text>
  </svg>`

  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: { ...DARK, alpha: 255 } }
  })
    .composite([
      { input: logoBuf, gravity: 'center', top: 90, left: Math.round((1200 - logoW) / 2) },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ])
    .png()
    .toFile(path.join(OUT, 'logo-og.png'))
  console.log('✓ logo-og.png')
}

console.log(`\n✅ Todas las variantes generadas en branding/logos/`)
