import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * POST /api/billing/portal
 * Redirige al portal de Stripe para gestionar la suscripción (cancelar, cambiar tarjeta, etc.)
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

  // ── Verificar ownership y obtener stripe_customer_id ──
  const supabaseAdmin = createAdminClient()
  const { data: sala } = await supabaseAdmin
    .from('salas')
    .select('id, stripe_customer_id, owner_user_id')
    .eq('id', salaId)
    .single()

  if (!sala) {
    return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 })
  }

  if (sala.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Solo el dueño del nido puede gestionar el plan' }, { status: 403 })
  }

  if (!sala.stripe_customer_id) {
    return NextResponse.json({ error: 'No hay suscripción activa para gestionar' }, { status: 400 })
  }

  // ── Crear sesión del portal ──
  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sala.stripe_customer_id,
    return_url: `${origin}/sala/${encodeURIComponent(salaId)}`,
  })

  return NextResponse.json({ url: portalSession.url })
}
