// sw.js – Service Worker
const CACHE = 'haushalt-v2-1';
const STATIC = [
  './',
  './index.html',
  './styles.css',
  './debug.js',
  './utils.js',
  './storage.js',
  './state.js',
  './categories.js',
  './validation.js',
  './months.js',
  './transactions.js',
  './csv.js',
  './pdf.js',
  './ocr.js',
  './ui.js',
  './app.js',
  './manifest.json',
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => c.addAll(STATIC))
    .then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
