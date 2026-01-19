

const CACHE_NAME = 'expense-tracker-v1.0.9';
const STATIC_CACHE = 'expense-tracker-static-v1.0.5';
const IMAGE_CACHE = 'expense-tracker-images-v1.0.5';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles/main.css',
    '/js/app.js',
    '/service-worker.js',
    '/icons/icon-192x192.svg',
    '/icons/icon-512x512.svg',
    '/icons/icon-32x32.svg',
    '/icons/icon-16x16.svg',
    '/icons/icon-144x144.svg'
];



self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('Service Worker: Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('Service Worker: Static assets cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Failed to cache static assets', error);
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE &&
                            cacheName !== IMAGE_CACHE) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated successfully');
                return self.clients.claim();
            })
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') {
        return;
    }

    if (!url.protocol.startsWith('http')) {
        return;
    }

    if (url.origin !== location.origin) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }

    if (isStaticAsset(request)) {
        event.respondWith(cacheFirstStrategy(request));
    } else if (isImageRequest(request)) {
        event.respondWith(imageCacheStrategy(request));

    } else {
        // Fallback for non-cachable requests
        return;
    }
});

async function handleNavigation(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            console.log('Service Worker: Serving network response for navigation');
            return networkResponse;
        }
    } catch (error) {
        console.log('Service Worker: Network failed, trying cache');
    }

    const cachedResponse = await caches.match('/index.html');
    if (cachedResponse) {
        console.log('Service Worker: Serving cached index.html');
        return cachedResponse;
    }

    return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Offline - Expense Tracker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .offline-message { color: #666; }
                </style>
            </head>
            <body>
                <h1>📱 Expense Tracker</h1>
                <p class="offline-message">You're offline. Please check your connection and try again.</p>
                <button onclick="location.reload()">Retry</button>
            </body>
            </html>
        `, {
        headers: { 'Content-Type': 'text/html' }
    });
}

function isStaticAsset(request) {
    const url = new URL(request.url);
    return url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.json') ||
        url.pathname === '/';
}

function isImageRequest(request) {
    const url = new URL(request.url);
    return url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
}



async function cacheFirstStrategy(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('Service Worker: Serving from cache (cache-first)', request.url);
            return cachedResponse;
        }

        console.log('Service Worker: Not in cache, fetching from network', request.url);
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
            console.log('Service Worker: Cached network response', request.url);
        }

        return networkResponse;
    } catch (error) {
        console.error('Service Worker: Cache first strategy failed', error);

        if (request.mode === 'navigate') {
            const cachedIndex = await caches.match('/index.html');
            if (cachedIndex) {
                console.log('Service Worker: Serving cached index.html for navigation');
                return cachedIndex;
            }
        }

        return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

async function imageCacheStrategy(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('Service Worker: Serving image from cache', request.url);
            return cachedResponse;
        }

        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(IMAGE_CACHE);
            cache.put(request, networkResponse.clone());

            cleanImageCache();
        }

        return networkResponse;
    } catch (error) {
        console.error('Service Worker: Image cache strategy failed', error);
        return new Response('Image not available offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}



async function cleanImageCache() {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();
    const maxItems = 50;

    if (keys.length > maxItems) {
        const keysToDelete = keys.slice(0, keys.length - maxItems);

        for (const key of keysToDelete) {
            await cache.delete(key);
        }

        console.log(`Service Worker: Cleaned ${keysToDelete.length} images from cache (Limit: ${maxItems})`);
    }
}





self.addEventListener('message', (event) => {
    console.log('Service Worker: Message received', event.data);

    if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting')) {
        console.log('Service Worker: Skipping waiting and taking control');
        self.skipWaiting();
    }


});



console.log('Service Worker: Script loaded successfully');
