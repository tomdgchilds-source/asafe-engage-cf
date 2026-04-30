/* eslint-disable */
/**
 * A-SAFE Engage service worker.
 *
 * Goal: keep the Site Survey UX usable for a surveyor on flaky 4G in a
 * warehouse. Two strategies, both deliberately simple:
 *
 *   1. Cache-first for static assets   — JS/CSS/images/fonts that vite
 *                                        ships under hashed filenames.
 *   2. Network-first for /api/*        — always reach for fresh data;
 *                                        fall back to cached only as a
 *                                        last resort, so the user sees
 *                                        the latest surveys when online.
 *
 * Anything authenticated must NEVER be cached: /api/auth/*, /api/admin/*,
 * /api/users/*, /api/cart/*. We let those requests bypass the SW entirely.
 *
 * Bumps the cache name on every release so old shells don't survive.
 */

const VERSION = "v3-2026-04-30";
const STATIC_CACHE = `asafe-static-${VERSION}`;
const RUNTIME_CACHE = `asafe-runtime-${VERSION}`;
const API_CACHE = `asafe-api-${VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/asafe-logo.jpeg",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/apple-touch-icon.png",
];

// Anything matching these patterns must always hit the network — never
// served from cache, never written to cache. Auth tokens & PII flows.
const AUTH_BYPASS_PATTERNS = [
  /\/api\/auth(\/|$)/,
  /\/api\/admin(\/|$)/,
  /\/api\/users(\/|$)/,
  /\/api\/cart(\/|$)/,
  /\/api\/objects(\/|$)/,        // user-scoped uploads
  /\/api\/orders(\/|$)/,
  /\/api\/quotes(\/|$)/,
  /\/api\/payments(\/|$)/,
];

// API GETs that are safe to fall back to cache (read-only, non-PII).
const API_CACHEABLE = [
  /\/api\/products(\/|$|\?)/,
  /\/api\/case-studies(\/|$|\?)/,
  /\/api\/resources(\/|$|\?)/,
  /\/api\/faqs(\/|$|\?)/,
  /\/api\/site-surveys(\/|$|\?)/, // surveyor's own list — refreshed on every online request
  /\/api\/site-survey-areas(\/|$|\?)/,
  /\/api\/calculations(\/|$|\?)/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (k) =>
              k.startsWith("asafe-") &&
              ![STATIC_CACHE, RUNTIME_CACHE, API_CACHE].includes(k),
          )
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isAuthBypass(url) {
  return AUTH_BYPASS_PATTERNS.some((re) => re.test(url.pathname));
}

function isCacheableApi(url) {
  return API_CACHEABLE.some((re) => re.test(url.pathname));
}

function isStaticAsset(url) {
  // hashed vite assets (/assets/*-abc123.js etc), images, fonts, css
  if (url.pathname.startsWith("/assets/")) return true;
  if (/\.(?:js|css|woff2?|ttf|eot|png|jpg|jpeg|webp|svg|ico|gif)$/i.test(url.pathname)) return true;
  if (url.pathname.startsWith("/pwa/")) return true;
  if (url.pathname === "/manifest.json") return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache POST/PUT/DELETE

  const url = new URL(req.url);

  // Same-origin only — let cross-origin (fonts.googleapis.com, Matterport,
  // logo CDNs) flow through the browser's HTTP cache untouched.
  if (url.origin !== self.location.origin) return;

  // Auth flows: always hit network, no cache reads or writes.
  if (isAuthBypass(url)) return;

  if (url.pathname.startsWith("/api/")) {
    if (!isCacheableApi(url)) return; // unknown API — let it hit the network normally
    event.respondWith(networkFirst(req));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Top-level navigations: try network, fall back to cached index for SPA.
  if (req.mode === "navigate") {
    event.respondWith(navigationHandler(req));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    // last-ditch: any cache we have
    const runtime = await caches.open(RUNTIME_CACHE);
    const fallback = await runtime.match(req);
    if (fallback) return fallback;
    throw err;
  }
}

async function networkFirst(req) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) {
      // Tag the cached response so the client can show "stale" UI.
      const headers = new Headers(cached.headers);
      headers.set("x-asafe-cache", "stale");
      return new Response(await cached.clone().blob(), {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    throw err;
  }
}

async function navigationHandler(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(STATIC_CACHE);
    cache.put("/", res.clone()).catch(() => {});
    return res;
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const cachedRoot = await cache.match("/");
    if (cachedRoot) return cachedRoot;
    return new Response(
      "<html><body style='font-family:sans-serif;padding:2rem;text-align:center;background:#FFC72C'>" +
        "<h1>A-SAFE Site Survey</h1>" +
        "<p>You're offline and we don't have this page cached yet. Open this URL once with a connection and it'll work next time.</p>" +
        "</body></html>",
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 200 },
    );
  }
}
