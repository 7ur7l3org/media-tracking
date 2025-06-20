import { runCli } from '../lib/_cli.js';
import { serveFunction } from '../lib/_cloudflare.js';
import { add } from './add.js';
import { multiply } from './multiply.js';

export function calculateArea({ width, height, margin = 0 }) {
  const totalW = add({ a: width, b: 2 * margin }).result;
  const totalH = add({ a: height, b: 2 * margin }).result;
  const area = multiply({ x: totalW, y: totalH }).result;
  return { area, totalW, totalH };
}

if (import.meta.main) runCli(calculateArea);
export default serveFunction(calculateArea);
