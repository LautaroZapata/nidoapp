import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'

/**
 * POST /api/sala/remove-member
 * Quita un miembro del nido (soft-delete: user_id → null)
 * y envía push notification a los demás miembros.
 * Body: { miembro_id: string, sala_id: string }
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { miembro_id: string; sala_id: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { miembro_id, sala_id } = body
  if (!miembro_id || !sala_id) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verificar que quien hace la request es miembro de la sala
  const { data: caller } = await admin
    .from('miembros')
    .select('id, nombre')
    .eq('sala_id', sala_id)
    .eq('user_id', user.id)
    .single()

  if (!caller) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  // Obtener nombre del miembro a remover (antes de quitarlo)
  const { data: target } = await admin
    .from('miembros')
    .select('id, nombre, sala_id')
    .eq('id', miembro_id)
    .eq('sala_id', sala_id)
    .single()

  if (!target) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })

  // Soft-delete: poner user_id en null
  const { error } = await admin
    .from('miembros')
    .update({ user_id: null })
    .eq('id', miembro_id)

  if (error) {
    console.error('[Remove Member] Error:', error.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  // Obtener código de sala para la URL de notificación
  const { data: sala } = await admin
    .from('salas')
    .select('codigo')
    .eq('id', sala_id)
    .single()

  // Enviar push notification a los demás miembros
  const pushSecret = process.env.PUSH_NOTIFY_SECRET
  if (pushSecret && sala) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
      await fetch(`${baseUrl}/api/push/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-push-secret': pushSecret,
        },
        body: JSON.stringify({
          sala_id,
          excluir_miembro_id: caller.id,
          titulo: 'Miembro removido',
          cuerpo: `${target.nombre} fue quitado del nido`,
          url: `/sala/${sala.codigo}`,
        }),
      })
    } catch (err) {
      console.error('[Remove Member] Push error:', err)
    }
  }

  return NextResponse.json({ ok: true, nombre: target.nombre })
}
