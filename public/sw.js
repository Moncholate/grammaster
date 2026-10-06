/* Service worker de Grammaster — NETWORK-FIRST, calcado del que usan el Hub y
   Question Lab. Con red disponible siempre sirve la versión recién publicada
   (nunca queda pegado en una vieja, el problema que tuvo Desgram con
   cache-first); sin red, cae a la última copia cacheada.

   Existe sobre todo para que la app sea INSTALABLE: Grammaster era la única de
   las cuatro sin service worker, y sin uno Chrome no dispara
   `beforeinstallprompt` ni ofrece «Instalar app» en el menú.

   Los assets con hash (dist/assets/*) no se listan aquí a propósito: cambian de
   nombre en cada build y el fetch de red los va cacheando solos. */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `grammaster-${CACHE_VERSION}`;
const BASE = '/grammaster/';

const urlsToCache = [
  BASE,
  `${BASE}index.html`,
  `${BASE}favicon.svg`,
  `${BASE}logo.svg`,
  `${BASE}site.webmanifest`,
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(urlsToCache).catch(err => {
        console.log('Cache addAll error:', err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.map(name => {
        if (name !== CACHE_NAME) return caches.delete(name);
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match(`${BASE}index.html`);
          }
          return new Response('Offline', { status: 503 });
        })
      )
  );
});
