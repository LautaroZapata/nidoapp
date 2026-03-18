import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * POST /api/billing/checkout
 * Crea una sesión de Stripe Checkout para upgradear un nido a Pro.
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
  let body: { salaId?: string }
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
    .select('id, nombre, plan_type, stripe_customer_id, owner_user_id')
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

  // ── Obtener o crear cliente en Stripe ──
  let stripeCustomerId = sala.stripe_customer_id

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        user_id: user.id,
        sala_id: salaId,
        sala_nombre: sala.nombre,
      },
    })
    stripeCustomerId = customer.id

    // Guardar el customer_id en la sala
    await supabaseAdmin
      .from('salas')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', salaId)
  }

  // ── Verificar que el precio Pro esté configurado ──
  const priceId = process.env.STRIPE_PRO_PRICE_ID
  if (!priceId) {
    console.error('[Billing] STRIPE_PRO_PRICE_ID no configurado')
    return NextResponse.json({ error: 'Plan no disponible en este momento' }, { status: 503 })
  }

  // ── Crear sesión de Checkout ──
  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      sala_id: salaId,
      user_id: user.id,
    },
    subscription_data: {
      metadata: {
        sala_id: salaId,
        user_id: user.id,
      },
    },
    success_url: `${origin}/sala/${encodeURIComponent(body.salaId ?? '')}/gastos?upgraded=1`,
    cancel_url: `${origin}/sala/${encodeURIComponent(body.salaId ?? '')}?upgrade=cancelled`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
