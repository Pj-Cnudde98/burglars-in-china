/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// App shell: works fully offline once opened.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// Brush font chunks, fetched on demand.
registerRoute(({ url }) => url.pathname.includes('ma-shan-zheng'),
  new CacheFirst({ cacheName: 'fonts', plugins: [new ExpirationPlugin({ maxEntries: 60 })] }))

// Map tiles: keep what you have looked at, so the map still shows offline.
registerRoute(({ url }) => url.hostname.endsWith('is.autonavi.com'),
  new CacheFirst({ cacheName: 'map-tiles', plugins: [new ExpirationPlugin({ maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 })] }))

// Weather: show the last forecast when offline.
registerRoute(({ url }) => url.hostname === 'api.open-meteo.com',
  new StaleWhileRevalidate({ cacheName: 'weather', plugins: [new ExpirationPlugin({ maxEntries: 20 })] }))

// Push notifications for chat and Bolleke.
self.addEventListener('push', (event) => {
  const d = event.data?.json() ?? {}
  event.waitUntil(self.registration.showNotification(d.title ?? 'Burglars in China', {
    body: d.body ?? '',
    tag: d.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url ?? '/' }
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data?.url as string) ?? '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { await (c as WindowClient).navigate(url).catch(() => {}); return (c as WindowClient).focus() }
    }
    return self.clients.openWindow(url)
  })())
})
