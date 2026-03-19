import { createAdminClient } from './supabase-admin'

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

/** Devuelve el variant ID de LS para un tier */
export function getVariantId(tier: TierType): string | undefined {
  const map: Record<TierType, string | undefined> = {
    nido: process.env.LEMONSQUEEZY_VARIANT_NIDO ?? process.env.LEMONSQUEEZY_VARIANT_HOGAR,
    casa: process.env.LEMONSQUEEZY_VARIANT_CASA,
  }
  return map[tier]
}

/** Obtiene el plan activo de una sala */
export async function getSalaPlan(salaId: string): Promise<PlanType> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('salas')
    .select('plan_type, subscription_status, subscription_end')
    .eq('id', salaId)
    .single()

  if (!data) return 'free'

  const esPro =
    data.plan_type === 'pro' &&
    (data.subscription_status === 'active' || data.subscription_status === 'on_trial') &&
    (!data.subscription_end || new Date(data.subscription_end) > new Date())

  return esPro ? 'pro' : 'free'
}

/** Cantidad de miembros activos en una sala */
export async function getSalaMiembroCount(salaId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('miembros')
    .select('id', { count: 'exact', head: true })
    .eq('sala_id', salaId)
  return count ?? 0
}
