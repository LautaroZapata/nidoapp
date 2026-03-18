import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const size        = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function AppleIcon() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  return new ImageResponse(
    <div
      style={{
        background: '#FAF5EE',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${baseUrl}/nido-icon.png`} width={140} height={140} alt="nido" />
    </div>,
    { ...size }
  )
}
