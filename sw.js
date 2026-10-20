/* Otech Digital Menu – Offline-first Service Worker */
const CACHE_NAME = 'otech-menu-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (req.method === 'GET' && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() =>
        caches.match(req).then((r) =>
          r || new Response(JSON.stringify({ offline: true, error: 'Offline' }), {
            headers: { 'Content-Type': 'application/json' }
          })
        )
      )
    );
    return;
  }

  // HTML / navigation (includes /?loc=TOKEN): network-first so QR always opens live app
  const isNav = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    url.pathname === '/' || url.pathname.endsWith('.html');

  if (isNav) {
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Other static: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        if (res.ok && req.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
