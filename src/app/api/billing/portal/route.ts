import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getCustomerPortalUrl } from '@/lib/lemonsqueezy'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * POST /api/billing/portal
 * Redirige al portal de Lemon Squeezy para gestionar la suscripción.
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
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const { salaId } = body
    if (!salaId || typeof salaId !== 'string') {
      return NextResponse.json({ error: 'salaId requerido' }, { status: 400 })
    }

    // ── Verificar ownership y obtener customer ID ──
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

    // ── Obtener URL del portal ──
    try {
      const url = await getCustomerPortalUrl(sala.stripe_customer_id)
      return NextResponse.json({ url })
    } catch (err) {
      console.error('[Billing] Error obteniendo portal:', err)
      return NextResponse.json({ error: 'Error abriendo portal' }, { status: 500 })
    }
  } catch (err) {
    console.error('[Portal]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
