const CACHE = 'nido-v1'

// Archivos que se cachean al instalar
const PRECACHE = ['/dashboard', '/']

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
  // Solo cachear GETs, ignorar API calls y rutas de auth
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/auth/')) return

  // Network-first para páginas dinámicas, fallback a cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request))
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
      // Si ya hay una ventana abierta de la app, enfocarla y navegar
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Si no, abrir nueva ventana
      clients.openWindow(url)
    })
  )
})
