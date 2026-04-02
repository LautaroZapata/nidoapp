import { createAdminClient } from './supabase-admin'
import type { PlanType, TierType } from './features'

/** Devuelve el variant ID de LS para un tier */
export function getVariantId(tier: TierType): string | undefined {
  const map: Record<TierType, string | undefined> = {
    nido: process.env.LEMONSQUEEZY_VARIANT_NIDO,
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
    .not('user_id', 'is', null)
  return count ?? 0
}
