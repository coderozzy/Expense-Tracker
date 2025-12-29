

const CACHE_NAME = 'expense-tracker-v1.0.7';
const STATIC_CACHE = 'expense-tracker-static-v1.0.4';
const DYNAMIC_CACHE = 'expense-tracker-dynamic-v1.0.4';
const IMAGE_CACHE = 'expense-tracker-images-v1.0.4';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles/main.css',
    '/js/app.js',
    '/js/service-worker.js',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/icons/icon-32x32.png',
    '/icons/icon-16x16.png',
    '/icons/icon-144x144.png'
];

const CACHE_STRATEGIES = {
    CACHE_FIRST: 'cache-first',
    NETWORK_FIRST: 'network-first',
    STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

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
                            cacheName !== DYNAMIC_CACHE && 
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
    } else if (isAPIRequest(request)) {
        event.respondWith(networkFirstStrategy(request));
    } else {
        event.respondWith(staleWhileRevalidateStrategy(request));
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

function isAPIRequest(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith('/api/') || 
           url.hostname.includes('api');
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

async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Service Worker: Network failed, trying cache (network-first)', request.url);
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        if (request.mode === 'navigate') {
            const cachedIndex = await caches.match('/index.html');
            if (cachedIndex) {
                console.log('Service Worker: Serving cached index.html for offline navigation');
                return cachedIndex;
            }
        }
        
        return new Response('Offline - Data not available', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

async function staleWhileRevalidateStrategy(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => {
        return cachedResponse;
    });
    
    return cachedResponse || fetchPromise;
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
            
            const cacheSize = await getCacheSize(IMAGE_CACHE);
            if (cacheSize < 50 * 1024 * 1024) { 
                cache.put(request, networkResponse.clone());
            } else {
                await cleanImageCache();
                cache.put(request, networkResponse.clone());
            }
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

async function getCacheSize(cacheName) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    let size = 0;
    
    for (const key of keys) {
        const response = await cache.match(key);
        if (response) {
            const blob = await response.blob();
            size += blob.size;
        }
    }
    
    return size;
}

async function cleanImageCache() {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();
    
    const keysToDelete = keys.slice(0, Math.floor(keys.length * 0.25));
    
    for (const key of keysToDelete) {
        await cache.delete(key);
    }
    
    console.log('Service Worker: Cleaned old images from cache');
}

self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync triggered', event.tag);
    
    if (event.tag === 'expense-sync') {
        event.waitUntil(syncExpenses());
    }
});

async function syncExpenses() {
    try {
        const offlineExpenses = await getOfflineExpenses();
        
        if (offlineExpenses.length > 0) {
            console.log('Service Worker: Syncing offline expenses', offlineExpenses.length);
            
            for (const expense of offlineExpenses) {
                console.log('Syncing expense:', expense);
            }
            
            await clearOfflineExpenses();
        }
    } catch (error) {
        console.error('Service Worker: Failed to sync expenses', error);
    }
}

async function getOfflineExpenses() {
    return new Promise((resolve) => {
        const request = indexedDB.open('ExpenseTrackerDB', 1);
        
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['expenses'], 'readonly');
            const store = transaction.objectStore('expenses');
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = () => {
                resolve(getAllRequest.result.filter(expense => expense.offline));
            };
        };
        
        request.onerror = () => resolve([]);
    });
}

async function clearOfflineExpenses() {
    return new Promise((resolve) => {
        const request = indexedDB.open('ExpenseTrackerDB', 1);
        
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['expenses'], 'readwrite');
            const store = transaction.objectStore('expenses');
            const index = store.index('offline');
            const clearRequest = index.openCursor();
            
            clearRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        };
        
        request.onerror = () => resolve();
    });
}

self.addEventListener('push', (event) => {
    console.log('Service Worker: Push notification received');
    
    const options = {
        body: event.data ? event.data.text() : 'New expense reminder',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'View Expenses',
                icon: '/icons/icon-192x192.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/icons/icon-192x192.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Expense Tracker', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

self.addEventListener('message', (event) => {
    console.log('Service Worker: Message received', event.data);
    
    if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting')) {
        console.log('Service Worker: Skipping waiting and taking control');
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating new version');
    event.waitUntil(
        self.clients.claim().then(() => {
            console.log('Service Worker: Now controlling all clients');
        })
    );
});

console.log('Service Worker: Script loaded successfully');
