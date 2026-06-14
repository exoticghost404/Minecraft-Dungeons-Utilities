const CACHE_NAME = 'mc-util-v12';
const ASSET_CACHE_NAME = 'mc-util-assets-v12';

const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'e.png'
];

function shouldCache(request, response) {
  if (request.method !== 'GET') return false;
  
  const isStatusOk = response.status === 200 || response.status === 0;
  const isTypeOk = response.type === 'basic' || response.type === 'cors' || response.type === 'opaque';
  
  return isStatusOk && isTypeOk;
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Precaching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheAllowlist = [CACHE_NAME, ASSET_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheAllowlist.includes(cacheName)) {
            console.log('[Service Worker] Cleaning up old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network First for index.html / navigation
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('./') || caches.match('index.html');
        })
    );
    return;
  }

  // Stale-While-Revalidate for CDNs and assets
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          if (event.request.url.includes('.js') || event.request.url.includes('.css') || event.request.url.includes('cdn')) {
            fetch(event.request).then(networkResponse => {
              if (shouldCache(event.request, networkResponse)) {
                caches.open(ASSET_CACHE_NAME).then(cache => {
                  cache.put(event.request, networkResponse);
                });
              }
            }).catch(() => {});
          }
          return cachedResponse;
        }

        return fetch(event.request).then(networkResponse => {
          if (shouldCache(event.request, networkResponse)) {
            const responseToCache = networkResponse.clone();
            caches.open(ASSET_CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
  );
});
