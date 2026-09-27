/* Есеп жолы · sw.js — makes the site installable and lets a page that was opened once open again without a network.
   Owner: platform owner.

   ONE rule, on purpose: NETWORK FIRST. Online, every file comes from the server exactly as before — the ?v= cache
   busting in tests/cachebust.js keeps working, and a release reaches a device on its next page load. The cache is only
   the fallback when the network is gone or too slow (school wifi): then the page opens from the last copy it saw.
   A page and the ?v= files it references are cached together, so a fallback page never mixes versions.

   Never touched: anything that is not a GET (every database call is a POST to /rest/v1/rpc/…), and anything on another
   origin (Supabase, Google Fonts) — the browser handles those itself, as it did before this file existed. */
const CACHE = 'esep-v1';
const WAIT_MS = 4000;                                   // slower than this → answer from the cache, keep updating behind
const PAGES = ['./', 'wp/', 'fr/', 'pv/', 'ar/', 'te/', 'room/', 'challenge/'];   // teacher/ is online-only work

const here = p => new URL(p, self.registration.scope).href;
const isPage = req => req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
const pageKey = url => { const u = new URL(url); u.search = ''; u.hash = ''; return u.href; };   // room/?id=5 and room/ are one page

/* keep one copy per file: storing core.js?v=14 drops core.js?v=13 */
async function put(cache, key, res) {
  const u = new URL(key);
  if (u.search) for (const old of await cache.keys()) {
    const o = new URL(old.url); if (o.pathname === u.pathname && o.search !== u.search) await cache.delete(old);
  }
  await cache.put(key, res);
}

/* the files a page asks for: static src/href only (template ${…} links are built at run time and skipped) */
function assetsOf(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'${}]+)["']/gi)) {
    const v = m[1]; if (/^(#|data:|mailto:|javascript:)/i.test(v)) continue;
    const u = new URL(v, base); if (u.origin !== self.location.origin) continue;
    if (/\.(js|css|png|svg|webmanifest)$/i.test(u.pathname)) out.add(u.href);
  }
  return [...out];
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const p of PAGES) {                            // one page failing (offline route, 404) must not stop the rest
      try {
        const url = here(p), res = await fetch(url, { cache: 'reload' });
        if (!res.ok) continue;
        const html = await res.clone().text(); await put(cache, pageKey(url), res);
        await Promise.all(assetsOf(html, url).map(async a => {
          try { const r = await fetch(a, { cache: 'reload' }); if (r.ok) await put(cache, a, r); } catch (_) {}
        }));
      } catch (_) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const page = isPage(req), key = page ? pageKey(req.url) : req.url;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then(async res => {
      if (res.ok && res.type === 'basic') await put(cache, key, res.clone());
      return res;
    });
    net.catch(() => {});                                // an offline fetch must not surface as an unhandled rejection
    e.waitUntil(net.then(() => {}, () => {}));          // let a slow response finish updating the cache after we answered
    const slow = new Promise(r => setTimeout(r, WAIT_MS, 'slow'));
    try {
      const first = await Promise.race([net, slow]);
      if (first !== 'slow') return first;
      const hit = await cache.match(key); if (hit) return hit;
      return await net;                                 // nothing cached: keep waiting for the network after all
    } catch (_) {
      const hit = await cache.match(key); if (hit) return hit;
      if (page) { const home = await cache.match(here('./')); if (home) return home; }
      return new Response('Интернет жоқ', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
