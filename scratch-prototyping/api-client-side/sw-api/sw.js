// sw.js
self.addEventListener('install', event => {
  // Skip waiting so SW takes control immediately
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Claim control of all clients immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname === '/api/func1') {
    event.respondWith((async () => {
      const params = Object.fromEntries(url.searchParams.entries());

      // Simulate delay (e.g., expensive computation)
      await new Promise(r => setTimeout(r, 4000));

      const result = {
        source: 'service-worker',
        apiLogic: 'return JSON with params and timestamp',
        params,
        timestamp: new Date().toISOString()
      };

      console.log('[SW] Responding to /api/func1 with:', result);

      return new Response(JSON.stringify(result, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'X-Client-API': 'service-worker-v1'
        }
      });
    })());
  }
});
