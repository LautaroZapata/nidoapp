import { createAdminClient } from './supabase-admin'

export type PlanType = 'free' | 'pro'

export const PLAN_LIMITS = {
  free: {
    maxNidos: 1,
    maxMiembros: 4,
    historialMeses: 3,
  },
  pro: {
    maxNidos: Infinity,
    maxMiembros: Infinity,
    historialMeses: Infinity,
  },
} as const

/**
 * Obtiene el plan activo de una sala, verificando que la suscripción esté vigente.
 * Siempre se ejecuta server-side con el cliente admin.
 */
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
    data.subscription_status === 'active' &&
    (!data.subscription_end || new Date(data.subscription_end) > new Date())

  return esPro ? 'pro' : 'free'
}

/**
 * Cantidad de nidos que el usuario creó (como owner).
 */
export async function getUserNidoCount(userId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('salas')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId)
  return count ?? 0
}

/**
 * Cantidad de miembros activos en una sala.
 */
export async function getSalaMiembroCount(salaId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('miembros')
    .select('id', { count: 'exact', head: true })
    .eq('sala_id', salaId)
  return count ?? 0
}

/**
 * Verifica si una sala puede agregar un nuevo miembro según su plan.
 * Devuelve { permitido: true } o { permitido: false, plan, limite }
 */
export async function puedeAgregarMiembro(salaId: string): Promise<
  { permitido: true } | { permitido: false; plan: PlanType; limite: number }
> {
  const [plan, count] = await Promise.all([
    getSalaPlan(salaId),
    getSalaMiembroCount(salaId),
  ])
  const limite = PLAN_LIMITS[plan].maxMiembros
  if (count < limite) return { permitido: true }
  return { permitido: false, plan, limite }
}

/**
 * Verifica si un usuario puede crear un nuevo nido según su plan.
 * Devuelve { permitido: true } o { permitido: false, plan, limite, salaId }
 */
export async function puedeCcrearNido(userId: string): Promise<
  { permitido: true } | { permitido: false; plan: PlanType; limite: number; salaOwnerDeId?: string }
> {
  // Buscar si ya tiene un nido como owner
  const supabase = createAdminClient()
  const { data: salas } = await supabase
    .from('salas')
    .select('id, plan_type, subscription_status, subscription_end')
    .eq('owner_user_id', userId)

  if (!salas || salas.length === 0) return { permitido: true }

  // Verificar si alguno de sus nidos tiene plan Pro
  const tieneProActivo = salas.some(s =>
    s.plan_type === 'pro' &&
    s.subscription_status === 'active' &&
    (!s.subscription_end || new Date(s.subscription_end) > new Date())
  )

  if (tieneProActivo) return { permitido: true }

  // En Free: máximo 1 nido
  if (salas.length >= PLAN_LIMITS.free.maxNidos) {
    return { permitido: false, plan: 'free', limite: PLAN_LIMITS.free.maxNidos, salaOwnerDeId: salas[0].id }
  }

  return { permitido: true }
}
