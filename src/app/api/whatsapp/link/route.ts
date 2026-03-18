import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * POST /api/whatsapp/link
 * Genera un código temporal para vincular el WhatsApp de un miembro.
 * Body: { miembro_id, sala_id }
 */
export async function POST(req: NextRequest) {
  const { miembro_id, sala_id } = await req.json()

  if (!miembro_id || !sala_id) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  // Generamos un código legible de 6 caracteres, ej: "A3K9X2"
  const code = Math.random().toString(36).substring(2, 8).toUpperCase()

  // Expira en 15 minutos
  const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  // Eliminamos códigos anteriores del mismo miembro para no acumular basura
  await supabase
    .from('whatsapp_link_codes')
    .delete()
    .eq('miembro_id', miembro_id)

  const { error } = await supabase
    .from('whatsapp_link_codes')
    .insert({ miembro_id, sala_id, code, expires_at })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ code })
}
