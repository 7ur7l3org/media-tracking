// thanks https://chatgpt.com/c/680f9094-e8a8-800c-91e1-28bd23e1afa5

async function resolveWikidataEntityFromUrl(url) {
  const endpoint = 'https://query.wikidata.org/sparql';
  const headers = {
    'Content-Type': 'application/sparql-query',
    'Accept': 'application/sparql-results+json'
  };

  // 1) Find the property + urlPattern that matches this URL
  const q1 = `
    PREFIX wdt: <http://www.wikidata.org/prop/direct/>
    PREFIX wikibase: <http://wikiba.se/ontology#>
    SELECT ?property ?urlPattern WHERE {
      BIND("${url}" AS ?url)
      ?property a wikibase:Property ;
                wdt:P8966 ?urlPattern .
      FILTER(REGEX(?url, ?urlPattern))
    }
    LIMIT 1
  `;
  const res1 = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: q1
  }).then(r => r.json());

  if (!res1.results.bindings.length) {
    console.warn('No URL-pattern found for', url);
    return null;
  }
  const { property, urlPattern } = res1.results.bindings[0];
  const propIRI = property.value;                // e.g. "http://www.wikidata.org/entity/P1651"
  const propId  = propIRI.split('/').pop();      // "P1651"

  // 2) Extract the ID via the regex
  const rx = new RegExp(urlPattern.value);
  const m  = rx.exec(url);
  if (!m) {
    console.error('Pattern matched server-side but failed client-side?', urlPattern.value);
    return null;
  }
  const id = m[1];

  // 3) Lookup the entity that has wdt:propId = id
  const q2 = `
    SELECT ?entity WHERE {
      ?entity wdt:${propId} "${id}"
    }
    LIMIT 1
  `;
  const res2 = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: q2
  }).then(r => r.json());

  const entity = res2.results.bindings.length
    ? res2.results.bindings[0].entity.value
    : null;

  return { property: propId, urlPattern: urlPattern.value, id, entity };
}

// Example usage:
resolveWikidataEntityFromUrl('https://www.youtube.com/watch?v=ABCDEFGHIJK')
  .then(console.log)
  .catch(console.error);
