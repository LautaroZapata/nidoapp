import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const size        = { width: 512, height: 512 }
export const contentType = 'image/png'

export default async function Icon() {
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
        padding: '56px',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${baseUrl}/nido-icon.png`} width={400} height={400} alt="nido" />
    </div>,
    { ...size }
  )
}
