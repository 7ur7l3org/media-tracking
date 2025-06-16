export async function func1(params, context) {
  const functionLocation = getFunctionDefinitionLocation('func1');

  console.log(`[func1.js] >>> [${context.requestId}] Function started`);
  console.log(`[func1.js] Defined at: ${functionLocation}`);
  console.log(`[func1.js] Context:`, context);

  await delay(5000); // simulate some async work

  return {
    source: 'service-worker',
    function: functionLocation,
    params,
    timestamp: new Date().toISOString()
  };
}

// --- Inlined helpers ---

function getCallerInfo({ functionName = null, depthAbove = 0 } = {}) {
  try {
    const stack = new Error().stack || '';
    const lines = stack.split('\n');

    let targetIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.includes('getCallerInfo')) continue;

      if (functionName && line.includes(functionName)) {
        targetIndex = i;
        break;
      }
    }

    const selectedIndex = functionName
      ? targetIndex + depthAbove
      : 3;

    if (selectedIndex >= 0 && selectedIndex < lines.length) {
      const selected = lines[selectedIndex].trim();

      const match = selected.match(/(?:at\s+)?(?:.*\()?([^()]+):(\d+):\d+\)?$/);
      if (match) {
        const [, file, lineNum] = match;
        const ref = `${file}:${lineNum}`;
        console.log(`[getCallerInfo] Selected: ${ref}`);
        return ref;
      }

      console.warn('[getCallerInfo] Unmatched stack line:', selected);
    }

    console.warn('[getCallerInfo] No usable caller frame found');
    return 'unknown';
  } catch (e) {
    console.error('getCallerInfo error:', e);
    return 'unknown';
  }
}

function getFunctionDefinitionLocation(functionName) {
  const loc = getCallerInfo({ functionName, depthAbove: 0 });
  const match = loc.match(/^(.*):(\d+)$/);
  if (!match) return loc;

  const [, file, line] = match;
  return `${file}:${parseInt(line) - 1}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- CLI runner block (stdin-safe) ---

const isRunningDirectly = typeof Bun !== 'undefined' ||
  (typeof process !== 'undefined' && (
    process.argv[1]?.endsWith('func1.js') || process.argv[1] === undefined
  ));

if (isRunningDirectly) {
  const rawArgs = typeof Bun !== 'undefined' ? Bun.argv.slice(2) : process.argv.slice(2);
  const url = new URL(`http://dummy?${rawArgs.join('&')}`);
  const params = Object.fromEntries(url.searchParams.entries());

  const context = {
    caller: 'standalone',
    requestId: Math.random().toString(36).slice(2),
    isManual: true,
    initiator: 'stdin-or-direct',
    serviceWorker: 'none'
  };

  func1(params, context).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(err => {
    console.error('Error running func1:', err);
    process.exit?.(1);
  });
}
