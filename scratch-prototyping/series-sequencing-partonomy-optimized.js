// thanks https://chatgpt.com/c/682d1e01-eef8-800c-8a00-a12cf11d2eca
// waaaay faster than existing series/sequencing recursive crap

async function fetchSPARQL(query) {
  const endpoint = 'https://query.wikidata.org/sparql';
  const url = endpoint + '?query=' + encodeURIComponent(query);
  const headers = { 'Accept': 'application/sparql-results+json' };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`SPARQL request failed: ${res.status}`);
  const data = await res.json();
  return data.results.bindings;
}

async function fetchASK(query) {
  const endpoint = 'https://query.wikidata.org/sparql';
  const url = endpoint + '?query=' + encodeURIComponent(query);
  const headers = { 'Accept': 'application/sparql-results+json' };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`SPARQL ASK failed: ${res.status}`);
  const data = await res.json();
  return data.boolean;
}

async function getSequence(id) {
  const query = `
    SELECT ?rel ?item ?itemLabel WHERE {
      VALUES ?id { wd:${id} }
      {
        ?id wdt:P155 ?item .
        BIND("previous" AS ?rel)
      } UNION {
        ?id wdt:P156 ?item .
        BIND("next" AS ?rel)
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const results = await fetchSPARQL(query);
  const out = {};
  for (const row of results) {
    out[row.rel.value] = {
      id: row.item.value.split('/').pop(),
      label: row.itemLabel?.value,
    };
  }
  return out;
}

async function getAncestry(id) {
  const query = `
    SELECT ?ancestor ?ancestorLabel WHERE {
      wd:${id} (wdt:P361|wdt:P179)* ?ancestor .
      FILTER(?ancestor != wd:${id})
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const results = await fetchSPARQL(query);
  return results.map(r => ({
    id: r.ancestor.value.split('/').pop(),
    label: r.ancestorLabel?.value,
  }));
}

async function getP527Roots(id) {
  const query = `
    SELECT ?parent WHERE {
      ?parent p:P527 ?stmt .
      ?stmt ps:P527 wd:${id} .
    }
  `;
  const results = await fetchSPARQL(query);

  if (results.length === 0) return [id]; // Treat self as root if no parent

  const roots = new Set();
  const visited = new Set();
  const queue = results.map(r => r.parent.value.split('/').pop());

  while (queue.length > 0) {
    const current = queue.pop();
    if (visited.has(current)) continue;
    visited.add(current);

    const parents = await fetchSPARQL(`
      SELECT ?parent WHERE {
        ?parent p:P527 ?stmt .
        ?stmt ps:P527 wd:${current} .
      }
    `);

    if (parents.length === 0) {
      roots.add(current);
    } else {
      queue.push(...parents.map(p => p.parent.value.split('/').pop()));
    }
  }

  return Array.from(roots);
}

async function getP527Tree(rootId) {
  const query = `
    SELECT ?parent ?parentLabel ?child ?childLabel ?ordinal WHERE {
      wd:${rootId} wdt:P527* ?parent .
      ?parent p:P527 ?stmt .
      ?stmt ps:P527 ?child .
      OPTIONAL { ?stmt pq:P1545 ?ordinal. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY ?parent (xsd:integer(?ordinal)) ?childLabel
  `;
  const results = await fetchSPARQL(query);
  return results.map(r => ({
    parent: r.parentLabel?.value,
    child: r.childLabel?.value,
    ordinal: r.ordinal?.value || null,
    parentId: r.parent.value.split('/').pop(),
    childId: r.child.value.split('/').pop(),
  }));
}

async function getFlatGroup(id) {
  const containerQuery = `
    SELECT ?container ?containerLabel WHERE {
      {
        wd:${id} wdt:P361 ?container .
      } UNION {
        wd:${id} wdt:P179 ?container .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const containers = await fetchSPARQL(containerQuery);
  if (containers.length === 0) return null;

  const container = containers[0].container.value.split('/').pop();

  const hasParts = await fetchASK(`ASK { wd:${container} wdt:P527 ?x }`);
  if (hasParts) return null;

  const membersQuery = `
    SELECT ?item ?itemLabel ?ordinal WHERE {
      {
        ?item wdt:P361 wd:${container} .
      } UNION {
        ?item wdt:P179 wd:${container} .
      }
      OPTIONAL {
        {
          ?item p:P361 ?stmt .
          ?stmt ps:P361 wd:${container} ;
                 pq:P1545 ?ordinal.
        } UNION {
          ?item p:P179 ?stmt .
          ?stmt ps:P179 wd:${container} ;
                 pq:P1545 ?ordinal.
        }
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY (xsd:integer(?ordinal)) ?itemLabel
  `;
  const results = await fetchSPARQL(membersQuery);
  return {
    container,
    containerLabel: containers[0].containerLabel?.value,
    members: results.map(r => ({
      id: r.item.value.split('/').pop(),
      label: r.itemLabel?.value,
      ordinal: r.ordinal?.value || null,
    })),
  };
}

async function exploreWikidataHierarchy(entityId) {
  const [sequence, ancestry, roots, flatGroup] = await Promise.all([
    getSequence(entityId),
    getAncestry(entityId),
    getP527Roots(entityId),
    getFlatGroup(entityId),
  ]);

  const structure = { trees: [] };

  for (const root of roots) {
    const tree = await getP527Tree(root);
    if (tree.length > 0) {
      structure.trees.push({
        type: "hierarchy",
        root,
        edges: tree,
      });
    }
  }

  if (flatGroup) {
    structure.trees.push({
      type: "flat-collection",
      container: flatGroup.container,
      containerLabel: flatGroup.containerLabel,
      members: flatGroup.members,
    });
  }

  const result = {
    entity: entityId,
    sequence,
    ancestry,
    structure,
  };

  console.log("📦 Full structure for", entityId, "→", result);
  return result;
}

// 🧪 Try it with any Wikidata Q-ID:
exploreWikidataHierarchy("Q23558");  // House
exploreWikidataHierarchy("Q208269");  // Eternal Sunshine
exploreWikidataHierarchy("Q4174738"); // House episode
exploreWikidataHierarchy("Q210311"); // American Dad
