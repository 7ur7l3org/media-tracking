import { runCli } from '../lib/_cli.js';
import { serveFunction } from '../lib/_cloudflare.js';

export function multiply({ x, y }) {
  return { result: Number(x) * Number(y) };
}

if (import.meta.main) runCli(multiply);
export default serveFunction(multiply);
