import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const size        = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: '#1E120A',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '110px', height: '110px' }}>
        <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '0', height: '0', borderLeft: '55px solid transparent', borderRight: '55px solid transparent', borderBottom: '46px solid #C05A3B' }} />
        <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', width: '84px', height: '60px', background: 'transparent', border: '7px solid #C05A3B', borderRadius: '2px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '24px', height: '32px', background: '#C05A3B', borderRadius: '12px 12px 0 0', opacity: 0.9 }} />
        </div>
      </div>
    </div>,
    { ...size }
  )
}
