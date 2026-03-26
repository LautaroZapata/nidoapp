'use client'

import { useState, useEffect } from 'react'

/**
 * MemberAvatar — Avatar generado automáticamente para cada miembro.
 *
 * Genera un SVG único basado en el nombre del miembro usando formas geométricas.
 * Soporta gradiente (color secundario) e icono personal (emoji).
 * Cuando se proporciona fotoUrl, muestra la foto en lugar del SVG.
 */

const SIZES = { sm: 22, md: 34, lg: 48 } as const

type AvatarSize = keyof typeof SIZES

interface MemberAvatarProps {
  nombre: string
  color: string
  gradiente?: string | null
  icono?: string | null
  fotoUrl?: string | null
  size?: AvatarSize
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

/** Hash simple y determinístico del string */
function hashStr(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Aclara/oscurece un color hex */
function shiftColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Genera colores derivados del color base */
function deriveColors(color: string, nombre: string) {
  const h = hashStr(nombre)
  return {
    bg: shiftColor(color, 40),
    shape1: color,
    shape2: shiftColor(color, -30),
    shape3: shiftColor(color, (h % 60) - 30),
  }
}

export default function MemberAvatar({
  nombre,
  color,
  gradiente,
  icono,
  fotoUrl,
  size = 'md',
  className,
  style,
  onClick,
}: MemberAvatarProps) {
  const [imgError, setImgError] = useState(false)

  // Reset error state when fotoUrl changes
  useEffect(() => {
    setImgError(false)
  }, [fotoUrl])

  const px = SIZES[size]
  const h = hashStr(nombre)
  const colors = deriveColors(color, nombre)

  // Deterministic shape parameters from name hash
  const r1 = 20 + (h % 15)             // radio shape 1
  const r2 = 12 + ((h >> 4) % 12)      // radio shape 2
  const x1 = 15 + ((h >> 8) % 20)      // pos x shape 1
  const y1 = 15 + ((h >> 12) % 20)     // pos y shape 1
  const x2 = 25 + ((h >> 16) % 15)     // pos x shape 2
  const y2 = 25 + ((h >> 20) % 15)     // pos y shape 2
  const rot = (h >> 24) % 360           // rotación

  const bgStyle = gradiente
    ? `url(#grad-${h})`
    : colors.bg

  const emojiSize = size === 'sm' ? 11 : size === 'md' ? 16 : 22
  const initial = nombre[0]?.toUpperCase() ?? '?'

  const showPhoto = !!fotoUrl && !imgError

  return (
    <div
      className={className}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        width: px,
        height: px,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
        ...style,
      }}
    >
      {showPhoto ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={fotoUrl!}
          alt={nombre}
          width={px}
          height={px}
          style={{
            width: px,
            height: px,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
          }}
          onError={() => setImgError(true)}
        />
      ) : (
        <>
          <svg
            width={px}
            height={px}
            viewBox="0 0 50 50"
            style={{ position: 'absolute', inset: 0 }}
          >
            {gradiente && (
              <defs>
                <linearGradient id={`grad-${h}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={color} />
                  <stop offset="100%" stopColor={gradiente} />
                </linearGradient>
              </defs>
            )}
            <rect width="50" height="50" fill={bgStyle} />
            <circle cx={x1} cy={y1} r={r1} fill={colors.shape1} opacity="0.5" />
            <circle cx={x2} cy={y2} r={r2} fill={colors.shape2} opacity="0.4" />
            <rect
              x={10 + ((h >> 3) % 15)}
              y={10 + ((h >> 7) % 15)}
              width={r2}
              height={r2}
              rx={r2 / 3}
              fill={colors.shape3}
              opacity="0.35"
              transform={`rotate(${rot} 25 25)`}
            />
          </svg>
          {icono ? (
            <span
              style={{
                position: 'relative',
                zIndex: 1,
                fontSize: emojiSize,
                lineHeight: 1,
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
              }}
            >
              {icono}
            </span>
          ) : (
            <span
              style={{
                position: 'relative',
                zIndex: 1,
                color: '#fff',
                fontWeight: 700,
                fontSize: px * 0.42,
                lineHeight: 1,
                textShadow: '0 1px 3px rgba(0,0,0,0.35)',
                textTransform: 'uppercase',
              }}
            >
              {initial}
            </span>
          )}
        </>
      )}
    </div>
  )
}
