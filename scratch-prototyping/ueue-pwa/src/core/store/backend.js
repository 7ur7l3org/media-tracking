import { pfs, repoDir } from './fs.js';

const PATH = `${repoDir}/ueue-media-tracking.json`;
const bc   = new BroadcastChannel('ueue-store');
let cache;                                  // in-memory copy

export async function load() {
  if (cache) return cache;
  try { cache = JSON.parse(await pfs.readFile(PATH,'utf8')); }
  catch { cache = { media: {} }; await save(cache); }
  return cache;
}

export async function read()   { return structuredClone(await load()); }

/* generic mutate helper – NO validation yet */
export async function mutate(fn) {
  const db = await load();
  await fn(db);
  await save(db);
}

async function save(obj){
  await pfs.writeFile(PATH, JSON.stringify(obj,null,2), 'utf8');
  bc.postMessage('update');
  window.dispatchEvent(new Event('backend:changed'));
}

bc.onmessage = () => window.dispatchEvent(new Event('backend:changed'));

/* called by sync layer after fast-forward */
export async function reload(){ cache = null; await load(); }
