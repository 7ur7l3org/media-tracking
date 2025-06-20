import { runCli } from '../lib/_cli.js';
import { serveFunction } from '../lib/_cloudflare.js';

export function add({ a, b }) {
  return { result: Number(a) + Number(b) };
}

if (import.meta.main) runCli(add);
export default serveFunction(add);
