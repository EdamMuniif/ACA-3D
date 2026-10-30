/* Offline cache, scoped to the GitHub Pages project subdirectory.
   Pages, scripts and styles are fetched network-first so a new deploy shows up on the
   next visit; the cache is the offline fallback. Fonts and icons never change, so they
   are served from the cache first. */
const VERSION = 'arrow-cube-away-cache-v7';
const ASSETS = ['./', './index.html', './styles.css', './core.js', './game.js', './icon.svg', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './fonts/InstrumentSans-Regular.woff2', './fonts/InstrumentSans-Bold.woff2', './fonts/InstrumentSerif-Regular.woff2', './fonts/InstrumentSerif-Italic.woff2'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('arrow-cube-away-cache-') && key !== VERSION).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
const isStatic = url => /\/(fonts|icons)\//.test(url.pathname) || url.pathname.endsWith('/icon.svg');
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (isStatic(url)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
    return;
  }
  event.respondWith((async () => {
    try {
      const fresh = await fetch(request, { cache: 'no-cache' });
      if (fresh.ok) { const copy = fresh.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {}); }
      return fresh;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw new Error('offline');
    }
  })());
});
