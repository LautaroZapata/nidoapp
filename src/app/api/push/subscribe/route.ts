import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'

/**
 * POST /api/push/subscribe
 * Guarda la suscripción push del navegador para un miembro.
 * Body: { subscription: PushSubscriptionJSON, miembro_id: string, sala_id: string }
 */
export async function POST(req: NextRequest) {
  // Verificar sesión
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { subscription, miembro_id, sala_id } = body
  if (!subscription?.endpoint || !miembro_id || !sala_id) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verificar que el user pertenece al miembro/sala
  const { data: miembro } = await admin
    .from('miembros')
    .select('id')
    .eq('id', miembro_id)
    .eq('sala_id', sala_id)
    .eq('user_id', user.id)
    .single()

  if (!miembro) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  // Upsert de la suscripción (por endpoint — unique)
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        miembro_id,
        sala_id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh ?? '',
        auth: subscription.keys?.auth ?? '',
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    console.error('[Push Subscribe] Error:', error.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/push/subscribe
 * Elimina la suscripción push del miembro.
 * Body: { endpoint: string }
 */
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 })

  await createAdminClient().from('push_subscriptions').delete().eq('endpoint', endpoint)
  return NextResponse.json({ ok: true })
}
