// thanks https://chatgpt.com/c/6848beb1-a9b4-800c-a335-0dcc3fd8f0bf

// === resolve "https://www.imdb.com/title/tt0168366" ===
// [URL→prop] 1 hit(s) in 738.2 ms
// [prop+ID "tt0168366"] 1 hit(s) in 178.5 ms
// result-1 [{…}]0: {item: 'http://www.wikidata.org/entity/Q239937', itemLabel: 'Pokémon', property: 'http://www.wikidata.org/entity/P345', propertyLbl: '', id: 'tt0168366', …}length: 1[[Prototype]]: Array(0)
// demo-1: 918.572021484375 ms

// === resolve "imdb.com/title/tt0168366" ===
// [URL→prop] 0 hit(s) in 458.0 ms
// [ID-lookup "imdb.com/title/tt0168366"] 0 hit(s) in 234.3 ms
// [ID-lookup "tt0168366"] 1 hit(s) in 105.6 ms
// result-2 [{…}]0: {item: 'http://www.wikidata.org/entity/Q239937', itemLabel: 'Pokémon', property: 'http://www.wikidata.org/entity/P345', propertyLbl: 'IMDb ID', id: 'tt0168366', …}length: 1[[Prototype]]: Array(0)
// demo-2: 799.77392578125 ms

// === resolve "tt0168366" ===
// [ID-lookup "tt0168366"] 1 hit(s) in 114.9 ms
// result-3 [{…}]0: {item: 'http://www.wikidata.org/entity/Q239937', itemLabel: 'Pokémon', property: 'http://www.wikidata.org/entity/P345', propertyLbl: 'IMDb ID', id: 'tt0168366', …}length: 1[[Prototype]]: Array(0)
// demo-3: 115.571044921875 ms

// === resolve "doi:10.1038/nphys1170" ===
// [URL→prop] 0 hit(s) in 667.5 ms
// [ID-lookup "doi:10.1038/nphys1170"] 0 hit(s) in 59.8 ms
// [ID-lookup "nphys1170"] 0 hit(s) in 48.2 ms
// result-4 []
// demo-4: 776.919921875 ms

// === resolve "https://myanimelist.net/anime.php?id=48736" ===
// [URL→prop] 0 hit(s) in 403.8 ms
// [ID-lookup "https://myanimelist.net/anime.php?id=48736"] 0 hit(s) in 92.2 ms
// [ID-lookup "48736"] 102 hit(s) in 694.7 ms
// [ID-lookup "anime.php"] 0 hit(s) in 44.7 ms
// [ID-lookup "myanimelist"] 4 hit(s) in 280.8 ms
// result-5 (106)
//     0: id: "48736"item: "http://www.wikidata.org/entity/Q133467117"itemLabel: "My Dress-Up Darling, season 1"property: "http://www.wikidata.org/entity/P4086"propertyLbl: "MyAnimeList anime ID"score: {total: 12, prop: {…}, item: {…}}[[Prototype]]: Object
//     1: {item: 'http://www.wikidata.org/entity/Q4044680', itemLabel: 'MyAnimeList', property: 'http://www.wikidata.org/entity/P2088', propertyLbl: 'Crunchbase organization ID', id: 'myanimelist', …}
//     2: {item: 'http://www.wikidata.org/entity/Q4044680', itemLabel: 'MyAnimeList', property: 'http://www.wikidata.org/entity/P4264', propertyLbl: 'LinkedIn company or organization ID', id: 'myanimelist', …}
// demo-5: 1520.18994140625 ms



/* =================  Wikidata “smart resolver” — v13  ======================
   Paste into any browser console.
============================================================================= */

const WDQS = 'https://query.wikidata.org/sparql';
const HEAD = { 'Content-Type':'application/sparql-query',
               'Accept':'application/sparql-results+json' };

/* ── SPARQL helper ─────────────────────────────────────────────────────── */
async function run(label, q) {
  const t0 = performance.now();
  const res = await fetch(WDQS, { method:'POST', headers:HEAD, body:q });
  const ms  = (performance.now() - t0).toFixed(1);
  if (!res.ok) throw new Error(`WDQS ${res.status}: ${res.statusText}`);
  const rows = (await res.json()).results.bindings;
  console.log(`[${label}] ${rows.length} hit(s) in ${ms} ms`);
  return rows;
}

/* ── tiny helpers ──────────────────────────────────────────────────────── */
const tokRE   = /[\p{L}\p{N}]+/gu;
const tokens  = s => (s || '').toLowerCase().match(tokRE) || [];
const looksLikeUrl = s =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^[^ ]+\.[^ ]+\//.test(s);

function* candidateIds(str) {
  const qs = str.split('?')[1];
  if (qs)
    for (const m of qs.matchAll(/(?:^|[&?])[^=]+=(\w{3,})/g)) yield m[1];

  const core = str.replace(/[?#].*$/, '');
  const last = core.replace(/\/+$/, '').split('/').pop();
  if (last && /\w/.test(last)) yield last;

  const long = (str.match(/[A-Za-z0-9]{6,}/g) || [])
               .sort((a,b)=>b.length-a.length)[0];
  if (long) yield long;
}
const uniq   = it => { const s=new Set(); return [...it].filter(x=>!s.has(x)&&s.add(x)); };
const dedupe = arr=>{const s=new Set(),o=[];for(const h of arr){const k=h.item+'|'+h.property+'|'+h.id;
  if(!s.has(k)){s.add(k);o.push(h);} }return o;};

/* ── (1) ID-value lookup ──────────────────────────────────────────────── */
async function resolveByIdValue(id) {
  const q = `
    SELECT DISTINCT ?item ?itemLabel ?idProp ?idPropLabel WHERE {
      VALUES ?rawValue { "${id}" }
      ?idProp wdt:P31 / wdt:P279* wd:Q19847637 ;
              wikibase:propertyType wikibase:ExternalId ;
              wikibase:directClaim ?pWdt .
      ?item ?pWdt ?rawValue .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`;
  const rows = await run(`ID-lookup "${id}"`, q);
  return rows.map(b => ({
    item: b.item.value,       itemLabel: b.itemLabel?.value ?? '',
    property: b.idProp.value, propertyLbl: b.idPropLabel?.value ?? '',
    id
  }));
}

/* ── (2) URL-pattern resolver ─────────────────────────────────────────── */
async function resolveByUrl(url) {
  const q1 = `
    SELECT ?prop ?pattern ?pWdt WHERE {
      BIND("${url}" AS ?u)
      ?prop wikibase:propertyType wikibase:ExternalId ;
            wdt:P8966 ?pattern ;
            wikibase:directClaim ?pWdt .
      FILTER regex(?u, ?pattern, "i")
    }`;
  const props = await run('URL→prop', q1);
  if (!props.length) return [];

  for (const { prop, pattern, pWdt } of props) {
    const m = new RegExp(pattern.value, 'i').exec(url);
    if (!m || !m[1]) continue;
    const id = m[1];

    const q2 = `
      SELECT ?item ?itemLabel WHERE {
        VALUES ?v { "${id}" }
        ?item <${pWdt.value}> ?v .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      } LIMIT 50`;
    const rows = await run(`prop+ID "${id}"`, q2);
    if (rows.length)
      return rows.map(r => ({
        item: r.item.value, itemLabel: r.itemLabel?.value ?? '',
        property: prop.value, propertyLbl: '',
        id, url
      }));
  }
  return [];
}

/* ── scoring: prop ×4, item ×2 (ID ignored) ───────────────────────────── */
function buildScore(hit, inTok) {
  const uniqArr = a => [...new Set(a)];
  const inter   = (A,B) => uniqArr(A.filter(x=>B.includes(x)));

  const itemM = inter(tokens(hit.itemLabel), inTok);
  const propM = inter(tokens(hit.propertyLbl), inTok);

  return {
    total: propM.length*4 + itemM.length*2,
    prop:  {matches: propM,  points: propM.length*4},
    item:  {matches: itemM,  points: itemM.length*2}
  };
}

/* ── master resolver ───────────────────────────────────────────────────── */
async function resolveUnknown(raw) {
  console.log(`\n=== resolve "${raw}" ===`);
  const s = raw.trim();
  const inTok = tokens(s);
  let hits = [];

  const urlFirst = looksLikeUrl(s);

  // Strategy 1
  hits = urlFirst ? await resolveByUrl(s) : await resolveByIdValue(s);
  if (hits.length)
    return hits.map(h => ({...h, score: buildScore(h,inTok)}));

  // Strategy 2
  hits = urlFirst ? await resolveByIdValue(s) : await resolveByUrl(s);
  if (hits.length)
    return hits.map(h => ({...h, score: buildScore(h,inTok)}));

  // Strategy 3 – candidate IDs (aggregate all)
  let agg = [];
  for (const cand of uniq(candidateIds(s)))
    agg = agg.concat(await resolveByIdValue(cand));
  agg = dedupe(agg);
  agg.forEach(h => h.score = buildScore(h,inTok));
  agg.sort((a,b)=>b.score.total - a.score.total);
  return agg;
}

/* =================  DEMO (full arrays)  ================================ */
(async () => {
  console.time('demo-1');
  console.log('result-1', await resolveUnknown('https://www.imdb.com/title/tt0168366'));
  console.timeEnd('demo-1');

  console.time('demo-2');
  console.log('result-2', await resolveUnknown('imdb.com/title/tt0168366'));
  console.timeEnd('demo-2');

  console.time('demo-3');
  console.log('result-3', await resolveUnknown('tt0168366'));
  console.timeEnd('demo-3');

  console.time('demo-4');
  console.log('result-4', await resolveUnknown('doi:10.1038/nphys1170'));
  console.timeEnd('demo-4');

  console.time('demo-5');
  console.log('result-5', await resolveUnknown('https://myanimelist.net/anime.php?id=48736'));
  console.timeEnd('demo-5');
})();
