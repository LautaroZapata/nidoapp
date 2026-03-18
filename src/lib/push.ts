'use client'

/**
 * Helpers cliente para manejar notificaciones push.
 * Solo se puede importar en componentes 'use client'.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const array = new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
  return array.buffer as ArrayBuffer
}

export async function registrarPush(miembroId: string, salaId: string): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) await existing.unsubscribe()

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), miembro_id: miembroId, sala_id: salaId }),
    })

    return res.ok
  } catch (err) {
    console.error('[Push] Error al registrar:', err)
    return false
  }
}

export async function cancelarPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return true

    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })

    return await sub.unsubscribe()
  } catch {
    return false
  }
}

export async function estadoPush(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  return Notification.permission as 'granted' | 'denied' | 'default'
}

/** Notifica a los miembros de la sala (llama al endpoint interno). */
export async function notificarSala(params: {
  salaId: string
  excluirMiembroId?: string
  titulo: string
  cuerpo: string
  url?: string
}) {
  try {
    await fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sala_id: params.salaId,
        excluir_miembro_id: params.excluirMiembroId,
        titulo: params.titulo,
        cuerpo: params.cuerpo,
        url: params.url,
      }),
    })
  } catch {
    // push es best-effort, nunca debe romper el flujo principal
  }
}
