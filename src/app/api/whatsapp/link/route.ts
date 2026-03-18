import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

/**
 * POST /api/whatsapp/link
 * Genera un código temporal para vincular el WhatsApp de un miembro.
 * Requiere sesión autenticada de Supabase.
 * Body: { miembro_id, sala_id }
 */
export async function POST(req: NextRequest) {
  // ── 1. Verificar sesión autenticada ──
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // ── 2. Validar body ──
  let body: { miembro_id?: string; sala_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const { miembro_id, sala_id } = body
  if (!miembro_id || !sala_id) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  // ── 3. Verificar que el user pertenece al miembro/sala indicado ──
  const admin = createAdminClient()
  const { data: miembro } = await admin
    .from('miembros')
    .select('id, sala_id')
    .eq('id', miembro_id)
    .eq('sala_id', sala_id)
    .eq('user_id', user.id)
    .single()

  if (!miembro) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // ── 4. Generar código criptográficamente seguro ──
  // 3 bytes → 6 hex chars (256^3 = 16M combinaciones, cryptographically random)
  const code = randomBytes(3).toString('hex').toUpperCase()
  const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  // Eliminar códigos anteriores del mismo miembro
  await admin.from('whatsapp_link_codes').delete().eq('miembro_id', miembro_id)

  const { error } = await admin
    .from('whatsapp_link_codes')
    .insert({ miembro_id, sala_id, code, expires_at })

  if (error) {
    console.error('[WhatsApp Link] Error al generar código')
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  return NextResponse.json({ code })
}
