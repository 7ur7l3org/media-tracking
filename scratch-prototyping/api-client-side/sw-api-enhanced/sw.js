import { func1 } from './api/func1.js';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname === '/api/func1') {
    event.respondWith((async () => {
      const params = Object.fromEntries(url.searchParams.entries());
      const headers = event.request.headers;

      const caller = headers.get('X-Caller');
      const requestId = headers.get('X-Request-ID');

      const client = event.clientId
        ? await self.clients.get(event.clientId)
        : null;

      const isManual = !(caller && requestId);

      const context = {
        caller: caller || 'unknown',
        requestId: requestId || 'no-rid',
        isManual,
        initiator: client?.url || 'unknown',
        serviceWorker: self.registration?.active?.scriptURL || 'unknown-sw'
      };

      console.log(`[SW] [${context.requestId}] From ${context.caller} →`, context);

      const result = await func1(params, context);

      const workerURL = context.serviceWorker;
      const apiLocation = `${result.function} (via ${workerURL})`;

      return new Response(JSON.stringify(result, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'X-Caller': context.caller,
          'X-Request-ID': context.requestId,
          'X-API-Location': apiLocation
        }
      });
    })());
  }
});
