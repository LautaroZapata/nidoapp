import { createAdminClient } from './supabase-admin'

export type PlanType = 'free' | 'pro'
export type TierType = 'starter' | 'hogar' | 'casa_grande'

export const TIERS = {
  starter:     { nombre: 'Starter',     label: 'hasta 3 miembros', maxMiembros: 3,        precio: 150, variantKey: 'LEMONSQUEEZY_VARIANT_STARTER' },
  hogar:       { nombre: 'Hogar',       label: '4 a 8 miembros',   maxMiembros: 8,        precio: 400, variantKey: 'LEMONSQUEEZY_VARIANT_HOGAR'   },
  casa_grande: { nombre: 'Casa Grande', label: '9+ miembros',      maxMiembros: Infinity, precio: 800, variantKey: 'LEMONSQUEEZY_VARIANT_CASA'    },
} as const

export const FREE_LIMITS = {
  historialMeses: 3,
  maxMiembros: 3,
}

/** Devuelve el tier que corresponde según la cantidad de miembros */
export function getTierParaMiembros(count: number): TierType {
  if (count <= 3) return 'starter'
  if (count <= 8) return 'hogar'
  return 'casa_grande'
}

/** Devuelve el variant ID de LS para un tier */
export function getVariantId(tier: TierType): string | undefined {
  const map: Record<TierType, string | undefined> = {
    starter:     process.env.LEMONSQUEEZY_VARIANT_STARTER,
    hogar:       process.env.LEMONSQUEEZY_VARIANT_HOGAR,
    casa_grande: process.env.LEMONSQUEEZY_VARIANT_CASA,
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
