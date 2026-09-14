/* Service worker: makes Kharcha open instantly and work with no signal.

   There is no server and no API, so everything the app needs is in this list.
   Strategy is stale-while-revalidate: open from the cache immediately, fetch
   the latest copy in the background, and use it next time. Bump VERSION on
   every release so old files are cleared out. */

const VERSION = 'kharcha-v3';
const FILES = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/api.js',
  './js/store.js',
  './js/parser.js',
  './js/merchants.js',
  './js/categories.js',
  './js/money.js',
  './js/ui.js',
  './js/views.js',
  './js/demo.js',
  './js/smsbackup.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache: 'reload' skips the browser's HTTP cache, so an update never
    // installs yesterday's copy of a file.
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A shared SMS arrives as "./?text=...". Serve the app shell for it, but key
  // the cache on the bare path so SMS text is never written into the cache.
  const cacheKey = url.search ? new Request(url.origin + url.pathname) : request;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(cacheKey);
      const network = fetch(cacheKey)
        .then((response) => {
          if (response.ok) cache.put(cacheKey, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
