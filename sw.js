// Hardened Service Worker for GoldSignalPWA
const CACHE_NAME = 'goldsSignals-shell-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './app.js',
  './app.js?v=3'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS.map(async (url) => {
      try { await cache.add(url); }
      catch (err) { console.warn('[SW] cache skip:', url, err && err.message); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => { if (n !== CACHE_NAME) return caches.delete(n); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const fresh = await fetch(event.request);
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = data.payload || {};
    event.waitUntil(self.registration.showNotification(title || 'GoldSignals', options || {}));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification && event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('navigate' in client) {
        client.focus();
        client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
