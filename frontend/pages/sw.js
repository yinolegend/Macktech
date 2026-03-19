/**
 * Command Center — Service Worker
 *
 * Strategy:
 *  - App shell (HTML, CSS, JS, icons, vendor assets, manifest): Cache-first with
 *    a network fallback on miss. On activation the old cache is pruned.
 *  - API routes (/api/*): Network-first with a short timeout. Falls back to a
 *    cached response when offline. POST/PUT/DELETE are never cached.
 *  - Everything else: Network-first with a same-domain cache fallback.
 *
 * The service worker scope is "/" (registered from any page at root level).
 */

const CACHE_NAME = 'command-center-shell-v6';
const API_CACHE_NAME = 'command-center-api-v6';
const API_CACHE_SECONDS = 30; // how long a GET /api response is reused offline

// Static shell assets that should always be available offline.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/app.html',
  '/command-center.html',
  '/announcements.html',
  '/announcements_portal.html',
  '/ticket.html',
  '/Ticketform.html',
  '/hazmat-portal.html',
  '/mapping_portal.html',
  '/admin.html',
  '/admin-console.html',
  '/manifest.webmanifest',
  '/assets/icons/icon-192.svg',
  '/assets/icons/icon-512.svg',
];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  // Skip waiting so the new SW activates immediately on first install.
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const CURRENT_CACHES = [CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      )
    )
  );
  // Claim all clients immediately so pages don't need a reload.
  self.clients.claim();
});

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Never intercept non-GET mutations for API routes.
  if (url.pathname.startsWith('/api/') && request.method !== 'GET') return;

  // CAS lookups already have a client-side embedded fallback. Bypass service
  // worker API caching here so stale chemical matches do not survive fixes.
  if (url.pathname.startsWith('/api/command-center/cas/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiNetworkFirst(request));
  } else if (isDynamicDataRequest(url, request)) {
    // Announcement data changes frequently; prefer network and only fall back to cache.
    event.respondWith(dynamicDataNetworkFirst(request));
  } else if (isHtmlRequest(url, request)) {
    // Always fetch HTML from the network so page updates are visible immediately.
    // Only fall back to cache when offline.
    event.respondWith(htmlNetworkFirst(request));
  } else {
    event.respondWith(shellCacheFirst(request));
  }
});

function isHtmlRequest(url, request) {
  const p = url.pathname;
  if (p.endsWith('.html')) return true;
  if (p === '/' || p === '') return true;
  const accept = request.headers.get('Accept') || '';
  return accept.includes('text/html');
}

function isDynamicDataRequest(url, request) {
  if (request.method !== 'GET') return false;
  return url.pathname === '/announcements.json';
}

async function dynamicDataNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify([]), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Network-first for HTML pages — always try to get the freshest markup,
 * but fall back to a cached copy when offline.
 */
async function htmlNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline — Command Center is not available right now.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Cache-first for static shell assets.
 * If the cache misses, attempt network and cache the result for later.
 */
async function shellCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    // Offline and not cached — return a minimal offline page if available.
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline — Command Center is not available right now.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Network-first for /api/ GET requests.
 * Falls back to a cached response when offline.
 * Caches successful responses with a timestamp header.
 */
async function apiNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      // Store response in the API cache with a timestamp.
      const cache = await caches.open(API_CACHE_NAME);
      const timestamped = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers: (() => {
          const h = new Headers(response.headers);
          h.set('sw-cached-at', Date.now().toString());
          return h;
        })(),
      });
      cache.put(request, timestamped);
    }
    return response;
  } catch (_) {
    // Network failed — check the API cache.
    const cached = await caches.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0', 10);
      const ageSeconds = (Date.now() - cachedAt) / 1000;
      if (ageSeconds < API_CACHE_SECONDS * 60) {
        return cached;
      }
    }
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
