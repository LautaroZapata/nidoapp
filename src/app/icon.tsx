import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const size        = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#1E120A',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '96px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          width: '320px',
          height: '320px',
        }}
      >
        {/* Techo */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '0',
          height: '0',
          borderLeft: '160px solid transparent',
          borderRight: '160px solid transparent',
          borderBottom: '130px solid #C05A3B',
        }} />
        {/* Cuerpo */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '240px',
          height: '170px',
          background: 'transparent',
          border: '18px solid #C05A3B',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}>
          {/* Puerta */}
          <div style={{
            width: '68px',
            height: '90px',
            background: '#C05A3B',
            borderRadius: '34px 34px 0 0',
            marginBottom: '0px',
            opacity: 0.9,
          }} />
        </div>
      </div>
    </div>,
    { ...size }
  )
}
