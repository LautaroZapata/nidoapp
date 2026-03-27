'use client'

import { useState, useEffect } from 'react'

/**
 * MemberAvatar — Avatar for each member.
 *
 * Shows the member's photo if available, otherwise a flat-color circle
 * with their emoji or initial.
 */

const SIZES = { sm: 22, md: 34, lg: 48 } as const

type AvatarSize = keyof typeof SIZES

interface MemberAvatarProps {
  nombre: string
  color: string
  icono?: string | null
  fotoUrl?: string | null
  size?: AvatarSize
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export default function MemberAvatar({
  nombre,
  color,
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
        background: showPhoto ? undefined : color,
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
      ) : icono ? (
        <span
          style={{
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
    </div>
  )
}
