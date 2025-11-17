/**
 * Service Worker for Expense Tracker PWA
 * Implements offline functionality and caching strategies
 */

const CACHE_NAME = 'expense-tracker-v1.0.7';
const STATIC_CACHE = 'expense-tracker-static-v1.0.4';
const DYNAMIC_CACHE = 'expense-tracker-dynamic-v1.0.4';
const IMAGE_CACHE = 'expense-tracker-images-v1.0.4';

// Static assets to cache immediately
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

// Cache strategies for different resource types
const CACHE_STRATEGIES = {
    // Cache first strategy for static assets
    CACHE_FIRST: 'cache-first',
    // Network first strategy for dynamic content
    NETWORK_FIRST: 'network-first',
    // Stale while revalidate for frequently updated content
    STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

/**
 * Install event - cache static assets
 */
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

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Delete old caches that don't match current version
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

/**
 * Fetch event - implement caching strategies
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension and other non-http requests
    if (!url.protocol.startsWith('http')) {
        return;
    }
    
    // Only handle requests from our domain
    if (url.origin !== location.origin) {
        return;
    }
    
        // For navigation requests, always try network first
        if (request.mode === 'navigate') {
            event.respondWith(handleNavigation(request));
            return;
        }
    
    // Determine caching strategy based on request type
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

    /**
     * Handle navigation requests (page loads)
     */
    async function handleNavigation(request) {
        try {
            // Try network first
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200) {
                console.log('Service Worker: Serving network response for navigation');
                return networkResponse;
            }
        } catch (error) {
            console.log('Service Worker: Network failed, trying cache');
        }
        
        // Fallback to cache
        const cachedResponse = await caches.match('/index.html');
        if (cachedResponse) {
            console.log('Service Worker: Serving cached index.html');
            return cachedResponse;
        }
        
        // Last resort - simple offline page
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

/**
 * Check if request is for a static asset
 */
function isStaticAsset(request) {
    const url = new URL(request.url);
    return url.pathname.endsWith('.css') ||
           url.pathname.endsWith('.js') ||
           url.pathname.endsWith('.html') ||
           url.pathname.endsWith('.json') ||
           url.pathname === '/';
}

/**
 * Check if request is for an image
 */
function isImageRequest(request) {
    const url = new URL(request.url);
    return url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
}

/**
 * Check if request is for API data
 */
function isAPIRequest(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith('/api/') || 
           url.hostname.includes('api');
}

/**
 * Cache First Strategy - for static assets
 * Check cache first, fallback to network
 */
async function cacheFirstStrategy(request) {
    try {
        // Try to get from cache first
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('Service Worker: Serving from cache (cache-first)', request.url);
            return cachedResponse;
        }
        
        // If not in cache, try network
        console.log('Service Worker: Not in cache, fetching from network', request.url);
        const networkResponse = await fetch(request);
        
        // If network request successful, cache it
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
            console.log('Service Worker: Cached network response', request.url);
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Service Worker: Cache first strategy failed', error);
        
        // For navigation requests, return cached index.html
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

/**
 * Network First Strategy - for API requests
 * Try network first, fallback to cache
 */
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
        
        // Return offline page for navigation requests
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

/**
 * Stale While Revalidate Strategy - for frequently updated content
 * Return cached version immediately, update cache in background
 */
async function staleWhileRevalidateStrategy(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => {
        // Network failed, return cached version if available
        return cachedResponse;
    });
    
    // Return cached version immediately if available, otherwise wait for network
    return cachedResponse || fetchPromise;
}

/**
 * Image Cache Strategy - optimized for images
 * Cache images with size limits and expiration
 */
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
            
            // Check cache size before adding new images
            const cacheSize = await getCacheSize(IMAGE_CACHE);
            if (cacheSize < 50 * 1024 * 1024) { // 50MB limit
                cache.put(request, networkResponse.clone());
            } else {
                // Clean old images if cache is full
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

/**
 * Get cache size in bytes
 */
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

/**
 * Clean old images from cache
 */
async function cleanImageCache() {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();
    
    // Remove oldest 25% of images
    const keysToDelete = keys.slice(0, Math.floor(keys.length * 0.25));
    
    for (const key of keysToDelete) {
        await cache.delete(key);
    }
    
    console.log('Service Worker: Cleaned old images from cache');
}

/**
 * Background Sync for offline data
 */
self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync triggered', event.tag);
    
    if (event.tag === 'expense-sync') {
        event.waitUntil(syncExpenses());
    }
});

/**
 * Sync offline expenses when connection is restored
 */
async function syncExpenses() {
    try {
        // Get offline expenses from IndexedDB
        const offlineExpenses = await getOfflineExpenses();
        
        if (offlineExpenses.length > 0) {
            console.log('Service Worker: Syncing offline expenses', offlineExpenses.length);
            
            // In a real app, you would send these to your server
            // For this demo, we'll just log them
            for (const expense of offlineExpenses) {
                console.log('Syncing expense:', expense);
                // await fetch('/api/expenses', { method: 'POST', body: JSON.stringify(expense) });
            }
            
            // Clear offline expenses after successful sync
            await clearOfflineExpenses();
        }
    } catch (error) {
        console.error('Service Worker: Failed to sync expenses', error);
    }
}

/**
 * Get offline expenses from IndexedDB
 */
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

/**
 * Clear offline expenses from IndexedDB
 */
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

/**
 * Push notification handling
 */
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

/**
 * Notification click handling
 */
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

/**
 * Message handling from main thread
 */
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

// Handle service worker activation
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating new version');
    event.waitUntil(
        self.clients.claim().then(() => {
            console.log('Service Worker: Now controlling all clients');
        })
    );
});

console.log('Service Worker: Script loaded successfully');
