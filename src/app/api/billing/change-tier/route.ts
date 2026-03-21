import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { updateSubscriptionVariant } from '@/lib/lemonsqueezy'
import { createAdminClient } from '@/lib/supabase-admin'
import { getTierParaMiembros, getVariantId, normalizeTier } from '@/lib/features'

/**
 * POST /api/billing/change-tier
 * Cambia el tier de una suscripción activa según la cantidad actual de miembros.
 *
 * Body: { salaId: string }
 * Requiere autenticación Supabase.
 */
export async function POST(req: NextRequest) {
  // ── Autenticación ──
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const supabaseUser = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
    }

    // ── Validar body ──
    let body: { salaId?: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const { salaId } = body
    if (!salaId) return NextResponse.json({ error: 'salaId requerido' }, { status: 400 })

    // ── Verificar ownership y que tenga suscripción activa ──
    const supabaseAdmin = createAdminClient()
    const { data: sala } = await supabaseAdmin
      .from('salas')
      .select('id, plan_type, plan_tier, owner_user_id, stripe_subscription_id')
      .eq('id', salaId)
      .single()

    if (!sala) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 })
    if (sala.owner_user_id !== user.id) return NextResponse.json({ error: 'Solo el dueño puede gestionar el plan' }, { status: 403 })
    if (sala.plan_type !== 'pro' || !sala.stripe_subscription_id) {
      return NextResponse.json({ error: 'No hay suscripción activa' }, { status: 400 })
    }

    // ── Determinar nuevo tier según miembros actuales ──
    const { count } = await supabaseAdmin
      .from('miembros')
      .select('id', { count: 'exact', head: true })
      .eq('sala_id', salaId)

    const miembroCount = count ?? 1
    const nuevoTier = getTierParaMiembros(miembroCount)

    if (normalizeTier(sala.plan_tier) === nuevoTier) {
      return NextResponse.json({ error: 'Ya estás en el tier correcto para tu cantidad de miembros' }, { status: 400 })
    }

    const variantId = getVariantId(nuevoTier)
    if (!variantId) {
      return NextResponse.json({ error: 'Variant no configurado' }, { status: 503 })
    }

    // ── Actualizar suscripción en Lemon Squeezy ──
    try {
      await updateSubscriptionVariant(sala.stripe_subscription_id, variantId)
    } catch (err) {
      console.error('[ChangeTier] Error en LS:', err)
      return NextResponse.json({ error: 'Error actualizando suscripción' }, { status: 500 })
    }

    // ── Actualizar tier en Supabase ──
    await supabaseAdmin
      .from('salas')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ plan_tier: nuevoTier as any })
      .eq('id', salaId)

    console.log(`[Billing] Nido ${salaId}: ${sala.plan_tier} → ${nuevoTier}`)
    return NextResponse.json({ ok: true, tier: nuevoTier })
  } catch (err) {
    console.error('[ChangeTier]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
