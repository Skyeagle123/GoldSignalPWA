// Simple Service Worker for caching shell and enabling offline view
const CACHE_NAME = 'goldsignals-shell-v1';
const ASSETS = ['/', '/index.html', '/app.js', '/manifest.json'];

self.addEventListener('install', (e)=>{ e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e)=>{ if(e.request.method !== 'GET') return; e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request))); });

// --- GoldSignals: notification helpers (added) ---
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = data.payload || {};
    event.waitUntil(
      self.registration.showNotification(title || 'GoldSignals', options || {})
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const win of clientsArr) {
        if (win.url.includes(target)) { win.focus(); return; }
      }
      return self.clients.openWindow(target);
    })
  );
});
// --- end additions ---
