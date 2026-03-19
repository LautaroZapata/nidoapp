import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase-admin'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL ?? 'mailto:nido@nido.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export interface PushPayload {
  sala_id: string
  excluir_miembro_id?: string  // quien generó el evento, no recibe notificación
  titulo: string
  cuerpo: string
  url?: string
}

/**
 * POST /api/push/notify
 * Envía una notificación push a todos los miembros de una sala,
 * excepto al que generó el evento.
 *
 * Puede ser llamado:
 * - Internamente desde otras API routes (con la misma SUPABASE_SERVICE_ROLE_KEY)
 * - Desde un Supabase Database Webhook (agregar PUSH_NOTIFY_SECRET como header)
 */
export async function POST(req: NextRequest) {
  // Autenticación: PUSH_NOTIFY_SECRET debe estar configurado
  const secret = process.env.PUSH_NOTIFY_SECRET
  if (!secret) {
    console.error('[Push Notify] PUSH_NOTIFY_SECRET no configurado')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const headerSecret = req.headers.get('x-push-secret')
  if (headerSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: PushPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { sala_id, excluir_miembro_id, titulo, cuerpo, url } = payload
  if (!sala_id || !titulo || !cuerpo) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Obtener suscripciones de la sala (excepto quien generó el evento)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = admin.from('push_subscriptions').select('*').eq('sala_id', sala_id) as any
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
