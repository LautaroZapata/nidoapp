const LS_API = 'https://api.lemonsqueezy.com/v1'

function getApiKey() {
  const key = process.env.LEMONSQUEEZY_API_KEY
  if (!key) console.warn('[LemonSqueezy] LEMONSQUEEZY_API_KEY no configurada')
  return key ?? ''
}

function headers() {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
  }
}

export interface LsCheckoutResult {
  url: string
}

/**
 * Crea una sesión de checkout en Lemon Squeezy.
 * Devuelve la URL a la que redirigir al usuario.
 */
export async function createCheckout(params: {
  storeId: string
  variantId: string
  email?: string
  customData: Record<string, string>
  redirectUrl: string
}): Promise<LsCheckoutResult> {
  const res = await fetch(`${LS_API}/checkouts`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_options: { embed: false, media: false, logo: true },
          checkout_data: {
            email: params.email,
            custom: params.customData,
          },
          product_options: {
            redirect_url: params.redirectUrl,
            receipt_button_text: 'Volver a Nido',
            receipt_thank_you_note: '¡Gracias por suscribirte a Nido Pro! 🐣',
          },
          expires_at: null,
        },
        relationships: {
          store: { data: { type: 'stores', id: params.storeId } },
          variant: { data: { type: 'variants', id: params.variantId } },
        },
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LS checkout error ${res.status}: ${err}`)
  }

  const json = await res.json()
  const url = json?.data?.attributes?.url
  if (!url) throw new Error('LS no devolvió URL de checkout')
  return { url }
}

/**
 * Cambia el variant de una suscripción existente (upgrade/downgrade de tier).
 */
export async function updateSubscriptionVariant(subscriptionId: string, variantId: string): Promise<void> {
  const res = await fetch(`${LS_API}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: 'subscriptions',
        id: subscriptionId,
        attributes: { variant_id: Number(variantId) },
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LS update subscription error ${res.status}: ${err}`)
  }
}

/**
 * Obtiene la URL del portal de cliente de Lemon Squeezy.
 * El customerId es el ID numérico guardado en sala.stripe_customer_id.
 */
export async function getCustomerPortalUrl(customerId: string): Promise<string> {
  const res = await fetch(`${LS_API}/customers/${customerId}`, {
    headers: headers(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LS customer error ${res.status}: ${err}`)
  }

  const json = await res.json()
  const url = json?.data?.attributes?.urls?.customer_portal
  if (!url) throw new Error('LS no devolvió URL del portal')
  return url
}
