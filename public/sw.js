// Offline support. The page itself: network first (so updates arrive), cache as fallback.
// Build files in assets/ have unique names, so once stored they're used straight from the cache.
const CACHE = 'clipforge-v2'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png']
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        await c.addAll(CORE)
        // store every tool, font and model in the background so the whole editor works offline
        try {
          const list = await (await fetch('./precache.json', { cache: 'no-store' })).json()
          await Promise.allSettled(list.map((u) => c.add(u)))
        } catch {}
      })
      .then(() => self.skipWaiting()),
  )
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return // AI models, CDNs etc. go straight to the network
  const store = (r) => {
    if (r.ok && r.status === 200) {
      const copy = r.clone()
      caches.open(CACHE).then((c) => c.put(e.request, copy))
    }
    return r
  }
  // unique build files and the converter: cache first
  if (/\/assets\/|\/ffmpeg\//.test(u.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(store)))
    return
  }
  e.respondWith(
    fetch(e.request)
      .then(store)
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  )
})
