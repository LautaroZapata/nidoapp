import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL ?? 'mailto:nido@nido.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export interface PushPayload {
  sala_id: string
  excluir_miembro_id?: string  // quien generó el evento, no recibe notificación
  solo_miembro_ids?: string[]  // si se pasa, solo notifica a estos miembros
  titulo: string
  cuerpo: string
  url?: string
}

/**
 * POST /api/push/notify
 * Envía una notificación push a todos los miembros de una sala,
 * excepto al que generó el evento.
 *
 * Autenticación (cualquiera de las dos):
 * - Header x-push-secret (para llamadas server-to-server o webhooks)
 * - Cookie de sesión Supabase (para llamadas desde el cliente)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_NOTIFY_SECRET
  const headerSecret = req.headers.get('x-push-secret')

  let autenticado = false

  // Opción 1: secret header
  if (secret && headerSecret === secret) {
    autenticado = true
  }

  // Opción 2: sesión de usuario autenticado
  if (!autenticado) {
    try {
      const cookieStore = await cookies()
      const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
      )
      const { data: { user } } = await supabaseAuth.auth.getUser()
      if (user) autenticado = true
    } catch {
      // ignorar errores de auth
    }
  }

  if (!autenticado) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: PushPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { sala_id, excluir_miembro_id, solo_miembro_ids, titulo, cuerpo, url } = payload
  if (!sala_id || !titulo || !cuerpo) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Obtener suscripciones de la sala, filtrando según corresponda
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = admin.from('push_subscriptions').select('*').eq('sala_id', sala_id) as any
  if (solo_miembro_ids && solo_miembro_ids.length > 0) {
    query = query.in('miembro_id', solo_miembro_ids)
  }
  if (excluir_miembro_id) {
    query = query.neq('miembro_id', excluir_miembro_id)
  }
  const { data: subs } = await query

  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const notifPayload = JSON.stringify({
    title: titulo,
    body: cuerpo,
    icon: '/nido-icon-192.png',
    badge: '/favicon-32.png',
    url: url ?? '/',
    timestamp: Date.now(),
  })

  const results = await Promise.allSettled(
    subs.map(async (sub: { endpoint: string; p256dh: string; auth: string; id: string }) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notifPayload,
        )
      } catch (err: unknown) {
        // 410 Gone = suscripción inválida/expirada → eliminarla
        if ((err as { statusCode?: number })?.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        }
        throw err
      }
    }),
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  return NextResponse.json({ ok: true, sent, total: subs.length })
}
