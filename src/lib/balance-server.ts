import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularBalance } from './balance'
import type { Gasto, Miembro, Pago } from './types'

/**
 * Calcula el balance neto de un miembro en una sala.
 * Valor positivo = le deben. Valor negativo = debe.
 * Extrae la lógica duplicada del webhook de WhatsApp.
 */
export async function calcularNetMiembro(
  supabase: SupabaseClient,
  salaId: string,
  miembroId: string
): Promise<number> {
  const [{ data: gastos }, { data: pagos }, { data: miembros }] = await Promise.all([
    supabase.from('gastos').select('id, tipo, pagado_por, importe, splits, creado_en').eq('sala_id', salaId),
    supabase.from('pagos').select('de_id, a_id, importe').eq('sala_id', salaId),
    supabase.from('miembros').select('id, creado_en').eq('sala_id', salaId).not('user_id', 'is', null),
  ])

  const { net } = calcularBalance(
    (gastos ?? []) as unknown as Gasto[],
    (miembros ?? []) as unknown as Miembro[],
    (pagos ?? []) as unknown as Pago[],
  )
  return net[miembroId] ?? 0
}
