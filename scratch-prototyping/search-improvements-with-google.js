// thanks https://chatgpt.com/c/6848beb1-a9b4-800c-a335-0dcc3fd8f0bf

/* =======================================================================
   Wikidata Smart Search – v31.1
   -----------------------------------------------------------------------
   • wbsearch (50)              src = "wb rankN"
   • Google suggest → wb (10)   src = "gs '<term>' → wb rankN"
   • MediaWiki fuzzy   (5)      src = "mw rankN"     (if wb < 25)
   • Wikipedia prefix  (1)      src = "wp"           (only if still empty)
   • One SPARQL call tags work-type (film > tv > game > manga > novel > other)
   • No console.groupCollapsed — every test prints an open table.
   ======================================================================= */

(async () => {

  const WD      = 'https://www.wikidata.org/w/api.php?origin=*';
  const SPARQL  = 'https://query.wikidata.org/sparql?format=json&origin=*';
  const WP_REST = 'https://en.wikipedia.org/w/rest.php/v1/search/title?q=';
  const CORS    = 'https://ueue-cors-proxy.7ur.workers.dev/';

  const json = url => fetch(url).then(r => r.json());

  /* ---------- helpers ------------------------------------------------ */
  function merge(base, extra) {
    const seen = new Map(base.map((o, i) => [o.id, i]));
    for (const h of extra) {
      if (seen.has(h.id)) {
        const i = seen.get(h.id);
        if (!base[i].src.includes('gs') && h.src.startsWith('gs')) {
          base[i].src += ' + ' + h.src;
        }
      } else {
        seen.set(h.id, base.length);
        base.push(h);
      }
    }
    return base;
  }

  async function wbSearch(q, limit, tag) {
    const url = `${WD}&action=wbsearchentities&format=json&language=en&search=${encodeURIComponent(q)}&limit=${limit}`;
    const rows = (await json(url)).search ?? [];
    return rows.map((o, i) => ({
      id: o.id,
      label: o.label,
      description: o.description,
      src: `${tag} wb rank${i + 1}`
    }));
  }

  async function googleSuggest(q) {
    const xml = await fetch(
      `${CORS}suggestqueries.google.com/complete/search?output=toolbar&hl=en&q=${encodeURIComponent(q)}`
    ).then(r => r.text()).catch(() => null);
    if (!xml) return null;
    const m = xml.match(/<suggestion data="([^"]+)"/);
    return m ? m[1] : null;
  }

  async function mwFuzzy(q, limit) {
    const s = `${WD}&action=query&format=json&list=search&srnamespace=0&srsearch=${encodeURIComponent(q + '~')}&srlimit=${limit}`;
    const hits = (await json(s)).query?.search ?? [];
    if (!hits.length) return [];
    const ids = hits.map(h => h.title).join('|');
    const e = `${WD}&action=wbgetentities&format=json&ids=${ids}&languages=en&props=labels|descriptions`;
    const ents = Object.values((await json(e)).entities).filter(e => !e.missing);
    return ents.map((e, i) => ({
      id: e.id,
      label: e.labels?.en?.value || '',
      description: e.descriptions?.en?.value || '',
      src: `mw rank${i + 1}`
    }));
  }

  async function wikiPrefix(q) {
    const page = (await json(WP_REST + encodeURIComponent(q) + '&limit=1')).pages?.[0];
    if (!page) return [];
    const url = `${WD}&action=wbgetentities&format=json&sites=enwiki&titles=${encodeURIComponent(page.title)}&languages=en&props=labels|descriptions`;
    const ent = Object.values((await json(url)).entities)[0];
    if (!ent || ent.missing) return [];
    return [{
      id: ent.id,
      label: ent.labels?.en?.value || '',
      description: ent.descriptions?.en?.value || '',
      src: 'wp'
    }];
  }

  /* ---------- work-type tagging ------------------------------------- */
  const TOP = {
    film:  'Q11424',
    tv:    'Q5398426',
    game:  'Q7889',
    manga: 'Q8274',
    novel: 'Q8261'
  };
  const PRIORITY = { film:1, tv:2, game:3, manga:4, novel:5, other:6 };

  async function tagWorkType(list) {
    const ids = list.map(o => `wd:${o.id}`).join(' ');
    const query = `
      SELECT ?id ?top WHERE {
        VALUES ?id { ${ids} }
        ?id wdt:P31/wdt:P279* ?class .
        ?class wdt:P279* ?top .
        VALUES ?top { wd:${TOP.film} wd:${TOP.tv} wd:${TOP.game} wd:${TOP.manga} wd:${TOP.novel} }
      }`;
    const rows = (await json(SPARQL + '&query=' + encodeURIComponent(query))).results.bindings;
    const map = {};
    rows.forEach(r => { map[r.id.value] = r.top.value.split('/').pop(); });
    list.forEach(o => o.type = map[o.id] || 'other');
  }

  /* ---------- main search ------------------------------------------- */
  async function smartSearch(term, want = 20, more = 100) {
    term = term.trim();
    const WB_LIMIT = more;
    const MW_LIMIT = Math.ceil(more / 5);

    let hits = await wbSearch(term, WB_LIMIT, 'wb');

    const gs = await googleSuggest(term);
    if (gs && gs.replace(/\W/g, '').toLowerCase() !== term.replace(/\W/g, '').toLowerCase()) {
      hits = merge(hits, await wbSearch(gs, 10, `gs '${gs}' →`));
    }

    if (hits.filter(h => h.src.startsWith('wb')).length < 25) {
      hits = merge(hits, await mwFuzzy(term, MW_LIMIT));
    }

    if (!hits.length) hits = hits.concat(await wikiPrefix(term));

    await tagWorkType(hits);
    hits.sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);

    return hits.slice(0, want);
  }

  /* ---------- full test set ---------------------------------------- */
  const tests = [
    'gatsby','re zero','spider man','fate stay night','steins gate',
    'seinfelt','drive my car','good will','alien movie','lotr',
    'star war','friends','house','house show','pokemon','pokemon anime','black mirror',
    'maid','maid tv','faouzia','my hero academia vigilantes',
    'one piece','stagnetti','pirates 2 stagnetti','queen',"queen's gambit"
  ];

  for (const q of tests) {
    console.time(q);
    console.table(await smartSearch(q));
    console.timeEnd(q);
  }

})();
