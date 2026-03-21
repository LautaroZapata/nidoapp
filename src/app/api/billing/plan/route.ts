import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getSalaPlan, FREE_LIMITS, TIERS, normalizeTier } from '@/lib/features'

/**
 * GET /api/billing/plan?salaId=xxx
 * Devuelve el plan activo de una sala y sus límites.
 */
export async function GET(req: NextRequest) {
  const salaId = req.nextUrl.searchParams.get('salaId')
  if (!salaId) {
    return NextResponse.json({ error: 'salaId requerido' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const { data: sala } = await supabase
      .from('salas')
      .select('id, plan_tier')
      .eq('id', salaId)
      .single()

    if (!sala) {
      return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 })
    }

    const plan = await getSalaPlan(salaId)

    if (plan === 'free') {
      return NextResponse.json({
        plan,
        limites: {
          historialMeses: FREE_LIMITS.historialMeses,
          maxMiembros: FREE_LIMITS.maxMiembros,
        },
      })
    }

    // Pro: determinar maxMiembros según tier
    const tier = normalizeTier(sala.plan_tier)
    const maxMiembros = tier === 'casa' ? null : TIERS.nido.maxMiembros

    return NextResponse.json({
      plan,
      tier,
      limites: {
        historialMeses: null,
        maxMiembros,
      },
    })
  } catch (err) {
    console.error('[BillingPlan]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
