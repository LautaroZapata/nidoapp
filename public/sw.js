const CACHE = 'nido-v2'

// Archivos que se cachean al instalar
const PRECACHE = ['/', '/dashboard']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Solo interceptar GETs del mismo origen
  if (e.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return   // ← excluye Supabase, CDNs externos
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/auth/')) return
  if (url.pathname.startsWith('/_next/')) return    // Next.js chunks ya tienen cache-busting en URL

  // Network-first → cache fallback → offline page
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(e.request)
        if (cached) return cached
        // Para navegación, devolver la página raíz cacheada
        if (e.request.mode === 'navigate') {
          const root = await caches.match('/')
          if (root) return root
        }
        return new Response('Sin conexión', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      })
  )
})

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener('push', e => {
  if (!e.data) return

  let data = {}
  try { data = e.data.json() } catch { data = { title: 'Nido', body: e.data.text() } }

  const title   = data.title  ?? 'Nido'
  const options = {
    body:    data.body    ?? '',
    icon:    data.icon    ?? '/nido-icon.png',
    badge:   data.badge   ?? '/nido-icon.png',
    tag:     data.tag     ?? 'nido-notif',
    renotify: true,
    data: { url: data.url ?? '/' },
    actions: [
      { action: 'open', title: 'Ver' },
      { action: 'close', title: 'Cerrar' },
    ],
  }

  e.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()

  if (e.action === 'close') return

  const url = e.notification.data?.url ?? '/'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      clients.openWindow(url)
    })
  )
})
