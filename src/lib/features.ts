export type PlanType = 'free' | 'pro'
export type TierType = 'nido' | 'casa'

export const TIERS = {
  nido: {
    nombre: 'Nido',
    label: 'hasta 8 miembros',
    maxMiembros: 8,
    precio: 290,
    variantKey: 'LEMONSQUEEZY_VARIANT_NIDO',
    features: [
      'Hasta 8 miembros',
      'Historial de gastos ilimitado',
      'Bot de WhatsApp incluido',
      'Gastos, compras y aptos sin límites',
    ],
  },
  casa: {
    nombre: 'Casa',
    label: 'miembros ilimitados',
    maxMiembros: Infinity,
    precio: 590,
    variantKey: 'LEMONSQUEEZY_VARIANT_CASA',
    features: [
      'Miembros ilimitados',
      'Historial de gastos ilimitado',
      'Bot de WhatsApp incluido',
      'Estadísticas avanzadas de gastos',
      'Exportar datos en CSV',
      'Soporte prioritario',
    ],
  },
} as const

export const FREE_LIMITS = {
  historialMeses: 2,
  maxMiembros: 3,
}

export const FREE_FEATURES = [
  'Hasta 3 miembros',
  '2 meses de historial de gastos',
  'Gastos, compras y aptos',
]

/** Devuelve el tier recomendado según la cantidad de miembros */
export function getTierParaMiembros(count: number): TierType {
  return count <= 8 ? 'nido' : 'casa'
}

/** Normaliza valores legacy del DB al nuevo sistema */
export function normalizeTier(tier: string | null | undefined): TierType | null {
  if (!tier) return null
  if (tier === 'nido' || tier === 'starter' || tier === 'hogar') return 'nido'
  if (tier === 'casa' || tier === 'casa_grande') return 'casa'
  return null
}
