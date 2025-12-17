const CACHE_NAME = 'music-player-v1';
const STATIC_ASSETS = [
    '/',
    '/static/style.css',
    '/static/script.js',
    '/static/default-album.svg',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/api/songs/') && event.request.url.includes('/audio')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }
            
            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                
                if (event.request.method === 'GET' && 
                    (event.request.url.includes('/static/') || 
                     event.request.url.endsWith('/'))) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                
                return response;
            });
        }).catch(() => {
            if (event.request.mode === 'navigate') {
                return caches.match('/');
            }
        })
    );
});
