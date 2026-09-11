/*
 * TIGER Field Trial — Service Worker
 * 
 * Caching strategy:
 * - HTML/JS/CSS: Network first, fall back to cache (prevent stale protocol)
 * - Models/Audio/Three.js: Cache first (large, versioned assets)
 * - API/WebSocket: Never cache (always live)
 * 
 * Version management:
 * - CACHE_NAME includes version string
 * - On install: precache static assets
 * - On activate: purge old caches
 * - Clients can message to skipWaiting() for forced update
 */

const CACHE_NAME = 'tiger-field-v1';
const VERSION = 'v1';

// Static assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/battle.css',
  '/app-manifest.js',
  '/client/bootstrap.js',
  '/manifest.webmanifest',
  // Icons
  '/client/icons/icon-192x192.png',
  '/client/icons/icon-512x512.png',
  '/client/icons/icon-maskable-512x512.png',
];

// Assets that should be cache-first (large, versioned)
const CACHE_FIRST_PATTERNS = [
  '/vendor/three.min.js',
  '/client/models/',
  '/client/environment/',
  '/client/audio/',
  '/core/',
  '/plugins/',
];

// URLs that should never be cached
const NO_CACHE_PATTERNS = [
  '/api/',
  '/ws',
  '/healthz',
];

// Install: precache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Installation complete, skipping waiting');
        self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Precache failed:', err);
      })
  );
});

// Activate: purge old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete, claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch: network-first for HTML/JS, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Never cache API or WebSocket
  if (NO_CACHE_PATTERNS.some(pattern => url.pathname.startsWith(pattern))) {
    return;
  }
  
  // Determine strategy based on request type
  const isStaticAsset = CACHE_FIRST_PATTERNS.some(pattern => 
    url.pathname.includes(pattern)
  );
  const isHTML = request.destination === 'document' || 
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/';
  
  if (isStaticAsset) {
    // Cache-first for large assets
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            console.log('[SW] Cache hit:', url.pathname);
            return cached;
          }
          console.log('[SW] Cache miss, fetching:', url.pathname);
          return fetch(request)
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(request, clone));
              }
              return response;
            })
            .catch((err) => {
              console.error('[SW] Fetch failed:', err);
              return new Response('Offline', { status: 503 });
            });
        })
    );
  } else if (isHTML) {
    // Network-first for HTML (always get latest version)
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          console.log('[SW] Network failed, trying cache for:', url.pathname);
          return caches.match(request)
            .then((cached) => {
              if (cached) {
                console.log('[SW] Serving cached HTML (offline)');
                return cached;
              }
              console.log('[SW] No cached HTML available');
              return new Response('Offline - no cached version', { status: 503 });
            });
        })
    );
  } else {
    // Default: network first, fall back to cache
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});

// Message handler: allow clients to force update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION, cacheName: CACHE_NAME });
  }
});
