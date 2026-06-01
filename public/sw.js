const CACHE_NAME = 'creaticks-cache-v1';
const CORE_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  const networkFirst = () => {
    return fetch(req).then((res) => {
      if (req.method === 'GET' && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req));
  };

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
        return res;
      }).catch(() =>
        caches.match('/index.html').then((cached) =>
          cached || new Response('<!DOCTYPE html><html><head></head><body></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          })
        )
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || networkFirst())
  );
});