import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getSalaPlan, FREE_LIMITS } from '@/lib/features'

/**
 * GET /api/billing/plan?salaId=xxx
 * Devuelve el plan activo de una sala y sus límites.
 */
export async function GET(req: NextRequest) {
  const salaId = req.nextUrl.searchParams.get('salaId')
  if (!salaId) {
    return NextResponse.json({ error: 'salaId requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: sala } = await supabase
    .from('salas')
    .select('id')
    .eq('id', salaId)
    .single()

  if (!sala) {
    return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 })
  }

  const plan = await getSalaPlan(salaId)

  return NextResponse.json({
    plan,
    limites: plan === 'free' ? {
      historialMeses: FREE_LIMITS.historialMeses,
      maxMiembros: FREE_LIMITS.maxMiembros,
    } : {
      historialMeses: null,
      maxMiembros: null,
    },
  })
}
