// sw.js – Service Worker v2
// Strategie: Cache-First für App-Shell, Network-First für Navigation.
// Externe CDN-Ressourcen (Tesseract) werden NICHT gecacht.

const CACHE_NAME = 'haushalt-shell-v8';

// Nur App-Shell – keine externen CDN-URLs
const PRECACHE_URLS = [
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
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

// ── INSTALL ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Precache fehlgeschlagen:', err))
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────────
// Alte Caches bereinigen – keine Zombie-Stände
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log('[SW] Alter Cache entfernt:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Externe Requests (CDN, APIs) – immer ans Netzwerk weitergeben, nicht cachen
  if (url.origin !== self.location.origin) {
    // Kein event.respondWith → Browser handelt selbst
    return;
  }

  // Navigation (HTML-Seite) – Network-First mit Cache-Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // App-Shell-Ressourcen – Cache-First
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        // Nicht im Cache – ans Netzwerk, bei Erfolg eincachen
        return fetch(request).then((response) => {
          if (response.ok && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        }).catch((err) => {
          console.warn('[SW] Fetch fehlgeschlagen:', request.url, err);
          // Kein Fallback für nicht-Navigation-Requests – sauber scheitern lassen
        });
      })
    );
  }
});
