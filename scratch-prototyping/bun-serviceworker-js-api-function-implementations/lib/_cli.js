function parseQueryStringArg(str) {
  const [query] = str.match(/\?.+/) || [];
  if (!query) return {};
  return Object.fromEntries(new URLSearchParams(query));
}

function parseValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (!isNaN(val)) return Number(val);
  return val;
}

export function parseArgs(argv) {
  const out = {};

  // Step 1: query string
  for (const arg of argv) {
    if (arg.startsWith('?')) {
      Object.assign(out, parseQueryStringArg(arg));
    }
  }

  // Step 2: flags override
  for (const arg of argv) {
    const m = arg.match(/^--?([^=]+)=?(.*)$/);
    if (m) {
      out[m[1]] = parseValue(m[2]);
    } else if (arg.includes('=') && !arg.startsWith('?')) {
      const [k, v] = arg.split('=');
      out[k] = parseValue(v);
    }
  }

  return out;
}

export async function runCli(fn) {
  const isBun = typeof Bun !== 'undefined';
  const isDeno = typeof Deno !== 'undefined';
  const argv = isBun ? Bun.argv.slice(2) : isDeno ? Deno.args : [];

  const args = parseArgs(argv);
  if (isBun && "bun-serve" in args) {
    // Bun will export the fetch handler
  } else {
    const result = await fn(args);
    console.log(JSON.stringify(result, null, 2));
    if (isBun) process.exit(0);
    if (isDeno) Deno.exit(0);
  }
}
