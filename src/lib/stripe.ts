import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  // Solo lanzar en runtime, no en build time
  console.warn('[Stripe] STRIPE_SECRET_KEY no configurada')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2026-02-25.clover',
})
