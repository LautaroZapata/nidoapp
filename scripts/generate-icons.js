const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const publicDir = path.join(__dirname, '..', 'public')
const appDir = path.join(__dirname, '..', 'src', 'app')

const regularSVG = fs.readFileSync(path.join(publicDir, 'icon.svg'))
const maskableSVG = fs.readFileSync(path.join(publicDir, 'icon-maskable.svg'))

async function gen(svgBuffer, size, outPath) {
  await sharp(svgBuffer, { density: Math.round(size * 96 / 512) })
    .resize(size, size)
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(outPath)
  const bytes = fs.statSync(outPath).size
  console.log(`✓ ${path.basename(outPath)} — ${size}×${size}px — ${(bytes/1024).toFixed(1)}KB`)
}

async function main() {
  console.log('Generating NidoApp icons...\n')

  // PWA icons (public/)
  await gen(regularSVG,  192, path.join(publicDir, 'nido-icon-192.png'))
  await gen(regularSVG,  512, path.join(publicDir, 'nido-icon-512.png'))
  await gen(regularSVG,  512, path.join(publicDir, 'nido-icon.png'))
  await gen(maskableSVG, 512, path.join(publicDir, 'nido-icon-maskable.png'))

  // Additional sizes for app/ (Next.js favicon/apple-icon)
  await gen(regularSVG,  180, path.join(publicDir, 'apple-touch-icon.png'))
  await gen(regularSVG,   32, path.join(publicDir, 'favicon-32.png'))
  await gen(regularSVG,   16, path.join(publicDir, 'favicon-16.png'))

  // Next.js app/ icons (overwrite)
  await gen(regularSVG, 1024, path.join(appDir, 'icon.png'))
  await gen(regularSVG,  180, path.join(appDir, 'apple-icon.png'))

  console.log('\nAll icons generated successfully.')
}

main().catch(err => { console.error('Error:', err); process.exit(1) })
