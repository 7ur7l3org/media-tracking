import { add } from './api/add.js';
import { multiply } from './api/multiply.js';
import { calculateArea } from './api/calculateArea.js';

const handlers = {
  'add.js': add,
  'multiply.js': multiply,
  'calculateArea.js': calculateArea,
};

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/api/')) return;

  const filename = url.pathname.split('/').pop();
  const handler = handlers[filename];
  if (!handler) return;

  event.respondWith(handleRequest(handler, event.request));
});

async function handleRequest(fn, req) {
  try {
    const url = new URL(req.url);
    const args = Object.fromEntries(url.searchParams.entries());
    const result = await fn(args);
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
