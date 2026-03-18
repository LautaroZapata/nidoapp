import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase-admin'
import type Stripe from 'stripe'

/**
 * POST /api/webhooks/stripe
 * Maneja eventos de Stripe (pagos, cancelaciones, renovaciones).
 * Verifica la firma del webhook con HMAC para garantizar autenticidad.
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET no configurado')
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 })
  }

  // ── Verificar firma de Stripe ──
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Firma ausente' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[Stripe Webhook] Firma inválida:', err)
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── Procesar eventos ──
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const salaId = session.metadata?.sala_id
      if (!salaId || session.mode !== 'subscription') break

      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id
      if (!subscriptionId) break

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      // current_period_end viene en el objeto items o en billing_cycle_anchor
      // En la API 2026-02-25 está en items[0].current_period_end
      const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end

      await supabase
        .from('salas')
        .update({
          plan_type: 'pro',
          stripe_subscription_id: subscriptionId,
          subscription_status: subscription.status,
          subscription_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        })
        .eq('id', salaId)

      console.log(`[Billing] Nido ${salaId} upgraded to Pro`)
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const salaId = subscription.metadata?.sala_id
      if (!salaId) break

      const esPro = subscription.status === 'active'
      const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end

      await supabase
        .from('salas')
        .update({
          plan_type: esPro ? 'pro' : 'free',
          subscription_status: subscription.status,
          subscription_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        })
        .eq('id', salaId)

      console.log(`[Billing] Suscripción actualizada: nido ${salaId}, estado ${subscription.status}`)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const salaId = subscription.metadata?.sala_id
      if (!salaId) break

      await supabase
        .from('salas')
        .update({
          plan_type: 'free',
          stripe_subscription_id: null,
          subscription_status: 'cancelled',
          subscription_end: null,
        })
        .eq('id', salaId)

      console.log(`[Billing] Suscripción cancelada: nido ${salaId} vuelve a Free`)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      // En Stripe API 2026+ el subscription_id está en invoice.subscription_details o como parent
      const invoiceAny = invoice as unknown as { subscription?: string; subscription_details?: { metadata?: { subscription_id?: string } } }
      const subscriptionId = invoiceAny.subscription_details?.metadata?.subscription_id
        ?? invoiceAny.subscription

      if (!subscriptionId || typeof subscriptionId !== 'string') break

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const salaId = subscription.metadata?.sala_id
      if (!salaId) break

      await supabase
        .from('salas')
        .update({ subscription_status: 'past_due' })
        .eq('id', salaId)

      console.warn(`[Billing] Pago fallido: nido ${salaId}`)
      break
    }

    default:
      // Ignorar eventos no manejados
      break
  }

  return NextResponse.json({ received: true })
}
