import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getSalaPlan, PLAN_LIMITS } from '@/lib/features'

/**
 * GET /api/billing/plan?salaId=xxx
 * Devuelve el plan activo de una sala y sus límites.
 * No requiere autenticación porque el plan es información pública de la sala.
 */
export async function GET(req: NextRequest) {
  const salaId = req.nextUrl.searchParams.get('salaId')
  if (!salaId) {
    return NextResponse.json({ error: 'salaId requerido' }, { status: 400 })
  }

  // Verificar que la sala existe
  const supabase = createAdminClient()
  const { data: sala } = await supabase
    .from('salas')
    .select('id, owner_user_id')
    .eq('id', salaId)
    .single()

  if (!sala) {
    return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 })
  }

  const plan = await getSalaPlan(salaId)
  const limites = PLAN_LIMITS[plan]

  return NextResponse.json({
    plan,
    limites: {
      maxNidos: limites.maxNidos === Infinity ? null : limites.maxNidos,
      maxMiembros: limites.maxMiembros === Infinity ? null : limites.maxMiembros,
      historialMeses: limites.historialMeses === Infinity ? null : limites.historialMeses,
    },
  })
}
