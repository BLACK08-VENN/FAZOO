const CACHE_NAME = 'fazoo-v4';
const PRECACHE = ['/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache authenticated API responses, signed file responses or OCR assets.
  // These must always come from the current production deployment.
  if (url.pathname.startsWith('/api/')) return;

  // Portal pages are dynamic/authenticated. Always prefer the network so a new
  // deployment cannot be hidden behind an old cached page or JS reference.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match('/offline.html')) || Response.error(),
      ),
    );
    return;
  }

  // Next.js build files already have long-lived HTTP caching. Do not copy them
  // into Cache Storage as well: each deployment has new hashed filenames and
  // old versions would otherwise accumulate until a phone reaches its quota.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(fetch(request));
  }
});
