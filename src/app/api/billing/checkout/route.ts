import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createCheckout } from '@/lib/lemonsqueezy'
import { createAdminClient } from '@/lib/supabase-admin'
import { getTierParaMiembros, getVariantId, TIERS } from '@/lib/features'
import type { TierType } from '@/lib/features'

/**
 * POST /api/billing/checkout
 * Crea una sesión de Lemon Squeezy Checkout para el tier correspondiente
 * según la cantidad de miembros actuales del nido.
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

  const supabaseUser = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }

  // ── Validar body ──
  let body: { salaId?: string; tier?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const { salaId } = body
  if (!salaId || typeof salaId !== 'string') {
    return NextResponse.json({ error: 'salaId requerido' }, { status: 400 })
  }

  // ── Verificar que el usuario es el owner del nido ──
  const supabaseAdmin = createAdminClient()
  const { data: sala } = await supabaseAdmin
    .from('salas')
    .select('id, nombre, plan_type, owner_user_id')
    .eq('id', salaId)
    .single()

  if (!sala) {
    return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 })
  }
  if (sala.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Solo el dueño del nido puede gestionar el plan' }, { status: 403 })
  }
  if (sala.plan_type === 'pro') {
    return NextResponse.json({ error: 'Este nido ya tiene el plan Pro' }, { status: 400 })
  }

  // ── Determinar tier según cantidad de miembros ──
  const { count } = await supabaseAdmin
    .from('miembros')
    .select('id', { count: 'exact', head: true })
    .eq('sala_id', salaId)

  const miembroCount = count ?? 1
  const tierFromBody = body.tier && ['nido', 'casa'].includes(body.tier) ? body.tier as TierType : null
  const tier = tierFromBody ?? getTierParaMiembros(miembroCount)
  const variantId = getVariantId(tier)
  const storeId = process.env.LEMONSQUEEZY_STORE_ID

  if (!storeId || !variantId) {
    console.error('[Billing] Variables de entorno de LS no configuradas')
    return NextResponse.json({ error: 'Plan no disponible en este momento' }, { status: 503 })
  }

  const tierInfo = TIERS[tier]
  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const { url } = await createCheckout({
      storeId,
      variantId,
      email: user.email ?? undefined,
      customData: {
        sala_id: salaId,
        user_id: user.id,
        tier,
        miembro_count: String(miembroCount),
      },
      redirectUrl: `${origin}/sala/${encodeURIComponent(salaId)}/gastos?upgraded=1`,
    })

    return NextResponse.json({ url, tier, tierInfo: { nombre: tierInfo.nombre, precio: tierInfo.precio, miembroCount } })
  } catch (err) {
    console.error('[Billing] Error creando checkout:', err)
    return NextResponse.json({ error: 'Error creando checkout' }, { status: 500 })
  }
}
