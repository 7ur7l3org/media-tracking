import { add } from './add.js';
import { multiply } from './multiply.js';
import { calculateArea } from './calculateArea.js';

const handlers = {
  'add.js': add,
  'multiply.js': multiply,
  'calculateArea.js': calculateArea,
};

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const fn = handlers[path];

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    if (!fn) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }

    const args = Object.fromEntries(url.searchParams.entries());
    const result = await fn(args);
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
