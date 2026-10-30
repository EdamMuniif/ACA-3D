/* Offline cache, scoped to the GitHub Pages project subdirectory. */
const VERSION = 'arrow-cube-away-cache-v4';
const ASSETS = ['./', './index.html', './styles.css', './core.js', './game.js', './icon.svg', './manifest.webmanifest',
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
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
