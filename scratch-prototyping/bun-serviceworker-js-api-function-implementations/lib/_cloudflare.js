import { parseArgs } from './_cli.js';

export function createWorkerHandler(fn) {
  return {
    async fetch(req) {
      const url = new URL(req.url);
      const params = Object.fromEntries(url.searchParams.entries());

      if (req.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

      const result = await fn(params);
      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    },
  };
}

export function serveFunction(fn) {
  const isBun = typeof Bun !== 'undefined';
  const args = isBun ? parseArgs(Bun.argv.slice(2)) : {};
  const isWrangler = typeof fetch === 'function';

  if (isBun && 'bun-serve' in args) {
    return createWorkerHandler(fn);
  }

  if (!isBun && isWrangler) {
    return createWorkerHandler(fn);
  }

  return {};
}
