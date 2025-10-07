// Disabled Service Worker temporarily to force live reload and bypass cache
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());
self.addEventListener('fetch', (e) => {
  // Always go to the network; no cache
  e.respondWith(fetch(e.request));
});
