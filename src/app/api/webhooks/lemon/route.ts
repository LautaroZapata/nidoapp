import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import crypto, { timingSafeEqual } from 'crypto'

interface LsWebhookPayload {
  meta: {
    event_name: string
    custom_data?: { sala_id?: string; user_id?: string }
  }
  data: {
    id: string
    attributes: {
      status: string
      ends_at: string | null
      customer_id: number
    }
  }
}

/**
 * POST /api/webhooks/lemon
 * Maneja eventos de Lemon Squeezy (pagos, cancelaciones, renovaciones).
 * Verifica la firma HMAC-SHA256 con la cabecera x-signature.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
    if (!secret) {
      console.error('[LS Webhook] LEMONSQUEEZY_WEBHOOK_SECRET no configurado')
      return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 })
    }

    const rawBody = await req.text()
    const signature = req.headers.get('x-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Firma ausente' }, { status: 400 })
    }

    // ── Verificar firma HMAC-SHA256 ──
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    try {
      if (!timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex'))) {
        console.error('[LS Webhook] Firma inválida')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let payload: LsWebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const { meta, data } = payload
    const salaId = meta.custom_data?.sala_id
    const supabase = createAdminClient()

    switch (meta.event_name) {
      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_payment_recovered': {
        if (!salaId) break
        const esPro = data.attributes.status === 'active' || data.attributes.status === 'on_trial'
        const tierRaw = (meta.custom_data as Record<string, string>)?.tier ?? null
        const tier = (tierRaw === 'nido' || tierRaw === 'casa') ? tierRaw : null
        await supabase
          .from('salas')
          .update({
            plan_type: esPro ? 'pro' : 'free',
            plan_tier: esPro ? tier as 'nido' | 'casa' | null : null,
            stripe_subscription_id: data.id,
            stripe_customer_id: String(data.attributes.customer_id),
            subscription_status: data.attributes.status,
            subscription_end: data.attributes.ends_at ?? null,
          })
          .eq('id', salaId)
        console.log(`[Billing] Nido ${salaId} → ${esPro ? `Pro (${tier})` : 'Free'} (${meta.event_name})`)
        break
      }

      case 'subscription_cancelled':
      case 'subscription_expired': {
        if (!salaId) break
        await supabase
          .from('salas')
          .update({
            plan_type: 'free',
            plan_tier: null,
            stripe_subscription_id: null,
            subscription_status: meta.event_name === 'subscription_cancelled' ? 'cancelled' : 'expired',
            subscription_end: null,
          })
          .eq('id', salaId)
        console.log(`[Billing] Nido ${salaId} vuelve a Free (${meta.event_name})`)
        break
      }

      case 'subscription_payment_failed': {
        if (!salaId) break
        await supabase
          .from('salas')
          .update({ subscription_status: 'past_due' })
          .eq('id', salaId)
        console.warn(`[Billing] Pago fallido: nido ${salaId}`)
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[LemonWebhook]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
