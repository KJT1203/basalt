/* ponytail: pass-through fetch handler, no caching. It exists so browsers offer
   "Install as app"; the server is on localhost, so offline caching would only
   ever serve stale code. Add real caching if the vault ever goes remote. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
