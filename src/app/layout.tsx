import type { Metadata, Viewport } from 'next'
import { Fraunces, Nunito } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'], weight: 'variable' })
const nunito   = Nunito({ variable: '--font-nunito', subsets: ['latin'], weight: ['300','400','500','600','700'] })

export const metadata: Metadata = {
  title: 'Nido — Tu piso compartido',
  description: 'Gastos, compras y convivencia para pisos compartidos. Con bot de WhatsApp incluido.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nido',
    startupImage: '/apple-touch-icon.png',
  },
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16',   type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32',   type: 'image/png' },
      { url: '/nido-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/nido-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon-32.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#2A1A0E',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${fraunces.variable} ${nunito.variable} antialiased`}>
        <main className="min-h-screen">{children}</main>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {})
            })
          }
        `}} />
      </body>
    </html>
  )
}
