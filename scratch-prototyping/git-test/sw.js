// sw.js

self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
  // Force waiting service worker to become active.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating.');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simply forward the request and log it. You can add caching logic here.
  event.respondWith(
    fetch(event.request).catch(() =>
      new Response("Offline: Could not fetch " + event.request.url)
    )
  );
});
