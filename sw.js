// Simple Service Worker for caching shell and enabling offline view
const CACHE_NAME = 'goldsignals-shell-v1';
const ASSETS = ['/', '/index.html', '/app.js', '/manifest.json'];

self.addEventListener('install', (e)=>{ e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e)=>{ if(e.request.method !== 'GET') return; e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request))); });
