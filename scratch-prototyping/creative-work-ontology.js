// thanks https://chatgpt.com/c/6848beb1-a9b4-800c-a335-0dcc3fd8f0bf

/* =======================================================================
   Creative-Work subclass tree + detail for “work of art” and
   “audiovisual work”
   ======================================================================= */

(async () => {
  const ROOT = 'Q17537576';                     // Creative work
  const DETAIL_NODES = ['Q838948', 'Q2431196', 'Q25839930', 'Q7725634', 'Q11578774', 'Q7725310']; // work of art, audiovisual work, written or drawn work, literary work, broadcasting program, series of creative works
  const WDQS = 'https://query.wikidata.org/sparql?format=json&origin=*';
  const WAPI = 'https://www.wikidata.org/w/api.php?origin=*';

  /* ---------- 1. fetch every (child, parent) subclass edge ---------- */
  const SPARQL = `
    SELECT ?item ?parent WHERE {
      ?item wdt:P279 ?parent .
      ?parent wdt:P279* wd:${ROOT} .
    }`;
  console.time('edges');
  const rows = (await (await fetch(WDQS + '&query=' + encodeURIComponent(SPARQL))).json())
               .results.bindings;
  console.timeEnd('edges');

  /* ---------- 2. build parent → children map ------------------------ */
  const childrenOf = {};
  rows.forEach(b => {
    const child  = b.item.value.split('/').pop();
    const parent = b.parent.value.split('/').pop();
    (childrenOf[parent] ||= []).push(child);
  });
  const firstLevel = childrenOf[ROOT] || [];

  /* ---------- 3. fetch English labels for first-level nodes --------- */
  const LABELS = {};
  async function fetchLabels(ids) {
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50).join('|');
      const url = `${WAPI}&action=wbgetentities&format=json&ids=${batch}` +
                  '&languages=en&props=labels';
      const ents = (await (await fetch(url)).json()).entities;
      Object.values(ents).forEach(e => { LABELS[e.id] = e.labels?.en?.value || e.id; });
    }
  }
  await fetchLabels(firstLevel);

  /* ---------- 4. pretty-print first level --------------------------- */
  console.log(`\nFirst-level subclasses of Creative work (${firstLevel.length}):`);
  firstLevel.forEach(id => {
    console.log(`• ${LABELS[id]} (${id}) — ${childrenOf[id]?.length || 0} subclasses`);
  });

  /* ---------- 5. DETAIL for two specific nodes ---------------------- */
  for (const node of DETAIL_NODES) {
    const kids = childrenOf[node] || [];
    await fetchLabels(kids);                      // ensure labels loaded
    console.log(`\nChildren of ${LABELS[node]} (${node}) — ${kids.length}:`);
    kids.forEach(cid => console.log(`  • ${LABELS[cid]} (${cid})`));
  }

  /* ---------- export tree for later use ----------------------------- */
  window.creativeWorkTree = { root: ROOT, firstLevel, childrenOf, labels: LABELS };
  console.log('\nTree saved to window.creativeWorkTree');
})();
