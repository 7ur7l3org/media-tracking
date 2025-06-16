export function getCallerInfo({ functionName = null, depthAbove = 0 } = {}) {
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
        // console.log(`[getCallerInfo] Selected: ${ref}`);
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

export function getFunctionDefinitionLocation(functionName) {
  const loc = getCallerInfo({ functionName, depthAbove: 0 });
  const match = loc.match(/^(.*):(\d+)$/);
  if (!match) return loc;

  const [, file, line] = match;
  return `${file}:${parseInt(line) - 1}`;
}
