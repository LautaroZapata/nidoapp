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
    statusBarStyle: 'default',
    title: 'Nido',
  },
  icons: {
    icon: '/nido-icon.png',
    apple: '/nido-icon.png',
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
