const CACHE_NAME = 'diff-cache-v1.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?h=d49c4da8',
  './app.js?h=24423efd',
  './diff.js?h=52ba9aad',
  './diff.worker.js?h=eeed30b0',
  './manifest.json?h=2c311878',
  './sw-registration.js?h=bfa8fde5',
  './icon-192x192.png',
  './icon-512x512.png',
  './apple-touch-icon.png',
  './favicon.ico'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
