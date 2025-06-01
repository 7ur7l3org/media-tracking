/* js/series.js */

/**
 * Formats a Date object as a short string: "YYYY-MM-DD"
 */
function formatDateShort(date) {
  return date.toISOString().split("T")[0];
}

/**
 * Formats a Date object as a long string: "YYYY-MM-DD HH:MM:SS AM/PM TZ"
 */
function formatDateLong(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  let hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const hourStr = String(hour).padStart(2, '0');
  // Extract a short timezone string (this may vary by browser)
  const tz = date.toLocaleTimeString('en-US', { timeZoneName: "short" }).split(' ').pop();
  return `${year}-${month}-${day} ${hourStr}:${minute}:${second} ${ampm} ${tz}`;
}

/**
 * Toggles a date element between its short and long formats.
 */
function toggleDate(el) {
  const current = el.innerText;
  const short = el.getAttribute("data-short");
  const long = el.getAttribute("data-long");
  el.innerText = (current === short ? long : short);
}

function safeLabel(edgeOrMember, fallbackId) {
  return edgeOrMember.child     // edge object from P527 tree
      ?? edgeOrMember.label     // flat-collection member
      ?? edgeOrMember.childLabel // older code path
      ?? fallbackId;            // always have *something*
}

// =============================================
// EFFICIENT DATA API IMPLEMENTATION
// =============================================
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
  console.log("calling exploreWikidataHierarchy for", entityId);
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

  console.log("exploreWikidataHierarchy for", entityId, "returning", result);
  return result;
}

/**
 * Build an adjacency map from a hierarchy object so look-ups are O(1)
 * {
 *   parents: { parentId → [childId, …] },
 *   children: { childId  → [parentId, …] }   // (rarely used but handy)
 * }
 */
function buildAdjacency(hierarchy) {
  const parents = Object.create(null);
  const children = Object.create(null);

  for (const tree of hierarchy.structure.trees) {
    if (tree.type !== "hierarchy") continue;
    for (const e of tree.edges) {
      (parents[e.parentId]  ??= []).push(e.childId);
      (children[e.childId]  ??= []).push(e.parentId);
    }
  }
  return { parents, children };
}

// ── simple in-memory cache ──────────────────────────────────────────────
const hierarchyCache = new Map();               // QID → Promise<Hierarchy>

function getHierarchyMemoised(qid) {
  if (hierarchyCache.has(qid)) return hierarchyCache.get(qid);

  const p = exploreWikidataHierarchy(qid).then(h => {
    // Build adjacency once and stick it on the object
    h._adjacency ??= buildAdjacency(h);
    return h;
  });
  hierarchyCache.set(qid, p);
  return p;
}


// =============================================
// DATA API IMPLEMENTATION
// =============================================
const SeriesDataAPI = {
  /**
   * Get hierarchical structure for an entity
   */
  async getHierarchyForEntity(qid) {
    return getHierarchyMemoised(qid);
  },

  /**
   * Get backend consumption/stats for an entity
   */
  async getBackendStatsForQid(qid) {
      return loadBackendData().then(backendData => {
      const key = "http://www.wikidata.org/entity/" + qid;
      const entry = backendData.media ? backendData.media[key] : null;
      let consumptionHTML = "";
      let queueHTML = "";
      let isQueued = false;
      if (entry) {
        if (entry.consumptions && entry.consumptions.length > 0) {
          const consumptions = entry.consumptions.map(c => {
            const d = new Date(c.when);
            return { short: formatDateShort(d), long: formatDateLong(d) };
          });
          if (consumptions.length === 1) {
            consumptionHTML = `consumed <span class="toggle-date" data-short="${consumptions[0].short}" data-long="${consumptions[0].long}" title="${consumptions[0].long}" onclick="toggleDate(this)">${consumptions[0].short}</span>`;
          } else {
            const datesHTML = consumptions.map(d => `<span class="toggle-date" data-short="${d.short}" data-long="${d.long}" title="${d.long}" onclick="toggleDate(this)">${d.short}</span>`).join(", ");
            consumptionHTML = `consumed x${consumptions.length} (${datesHTML})`;
          }
        }
        if (entry["queue-votes"] && Object.keys(entry["queue-votes"]).length > 0) {
          isQueued = true;
          let categoriesHTML = [];
          for (const category in entry["queue-votes"]) {
            const votes = entry["queue-votes"][category];
            if (votes.length > 0) {
              const voteDates = votes.map(v => {
                const d = new Date(v.when);
                return { short: formatDateShort(d), long: formatDateLong(d) };
              });
              if (voteDates.length === 1) {
                categoriesHTML.push(`${category} <span class="toggle-date" data-short="${voteDates[0].short}" data-long="${voteDates[0].long}" title="${voteDates[0].long}" onclick="toggleDate(this)">${voteDates[0].short}</span>`);
              } else {
                const datesHTML = voteDates.map(d => `<span class="toggle-date" data-short="${d.short}" data-long="${d.long}" title="${d.long}" onclick="toggleDate(this)">${d.short}</span>`).join(", ");
                categoriesHTML.push(`${category} x${voteDates.length} (${datesHTML})`);
              }
            }
          }
          if (categoriesHTML.length > 0) {
            queueHTML = categoriesHTML.join(" ");
          }
        }
      }
      let finalHTML = "";
      if (consumptionHTML) {
        finalHTML += `<span class="backend-stat consumed">${consumptionHTML}</span>`;
      }
      if (queueHTML) {
        finalHTML += ` <span class="backend-stat queued">${queueHTML}</span>`;
      }
      return { statsHTML: finalHTML, isQueued };
    }).catch(err => {
      console.error(err);
      return { statsHTML: "", isQueued: false };
    });
  }
};

// =============================================
// RENDERING FUNCTIONS (unchanged)
// =============================================

/**
 * Recursively aggregates consumption statistics
 */
async function aggregateDescendantConsumptionStats(rootQid,
                                                   visited = new Set(),
                                                   counted = new Set(),
                                                   backend = null,
                                                   hierarchyObj = null,
                                                   adjacency = null) {
  if (!hierarchyObj) {
    // One trip for *this* root, never again inside the recursion
    console.log("aggregateDescendantConsumptionStats grabbing hierarchy of rootQid", rootQid)
    hierarchyObj = await SeriesDataAPI.getHierarchyForEntity(rootQid);
    adjacency    = hierarchyObj._adjacency
                ?? (hierarchyObj._adjacency = buildAdjacency(hierarchyObj));
  }

  if (!backend) backend = await loadBackendData();

  let total = 0;
  let consumed = 0;

  const stack = [rootQid];
  while (stack.length) {
    const parent = stack.pop();
    const kids   = adjacency.parents[parent] ?? [];

    if (adjacency.parents[parent] === undefined) {
      // parent has *no* P527 children; check if it's a flat collection container
      const fc = hierarchyObj.structure.trees.find(
                  t => t.type === "flat-collection" && t.container === parent);
      if (fc) {
        for (const m of fc.members) {
          if (!counted.has(m.id)) {
            total++;
            const key = `http://www.wikidata.org/entity/${m.id}`;
            if (backend.media?.[key]?.consumptions?.length > 0) consumed++;
            counted.add(m.id);
          }
        }
        continue;          // done with this branch
      }
    }

    for (const kid of kids) {
      if (visited.has(kid)) continue;
      visited.add(kid);

      const grandKids = adjacency.parents[kid] ?? [];
      if (grandKids.length === 0) {
        // leaf
        if (!counted.has(kid)) {
          total++;
          const key = `http://www.wikidata.org/entity/${kid}`;
          if (backend.media?.[key]?.consumptions?.length > 0) consumed++;
          counted.add(kid);
        }
      } else {
        // push once—NO network call
        stack.push(kid);
      }
    }
  }
  return { total, consumed };
}

/**
 * Renders a parts tree for a given series QID.
 * Fetches the hierarchy only once per root and re-uses it for all
 * descendant nodes (zero extra network traffic).
 *
 * @param {string} qid        – the node we’re rendering
 * @param {string} currentQid – the “current page” entity (for bolding)
 * @param {object|null} hierarchy – (internal) pre-fetched hierarchy
 */
async function renderPartsTree(qid, currentQid, hierarchy = null) {

  // Only the very first call for this root touches the API
  if (!hierarchy) {
    console.log("renderPartsTree qid", qid, "currentQid", currentQid, "grabbing hierarchy of qid", qid, "and recursing over complete tree")
    hierarchy = await SeriesDataAPI.getHierarchyForEntity(qid);
  }

  const adjacency = hierarchy._adjacency;    // already built by memoiser

  let html = "";

  for (const tree of hierarchy.structure.trees) {

    // ────────────────────────────────────────────────
    //   Hierarchical (P527*) branch
    // ────────────────────────────────────────────────
    if (tree.type === "hierarchy") {
      const children = tree.edges
                          .filter(e => e.parentId === qid)
                          .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));

      if (children.length === 0) continue;

      html += "<ul class='parts-tree'>";
      console.log("getting backend consumption stats for", children.length, "children of", qid);
      for (const child of children) {
        const isCurrent = child.childId === currentQid;
        const ordinal   = child.ordinal ? `${child.ordinal}. ` : "";

        const mainLink  = `<a href="index.html?id=${child.childId}">${child.child}</a>
                           <span class="small-id">(${child.childId})</span>`;

        const statsObj  = await SeriesDataAPI.getBackendStatsForQid(child.childId);
        const lineBody  = statsObj.isQueued
                          ? `<span class="queued-line">${mainLink}${statsObj.statsHTML}</span>`
                          : mainLink + statsObj.statsHTML;

        const lineText  = `${ordinal}${isCurrent ? "<strong class='current-entry'>" : ""}${lineBody}${isCurrent ? " ⟵</strong>" : ""}`;

        const childHtml = await renderPartsTree(child.childId, currentQid, hierarchy);

        let aggText = "";
        if (childHtml) {                     // node has descendants
          const openAttr = isCurrent || childHtml.includes("current-entry") ? " open" : "";
          const agg = await aggregateDescendantConsumptionStats(
                        child.childId,
                        new Set(), new Set(),
                        null, hierarchy, adjacency);
          if (agg.total > 0) {
            const pct = ((agg.consumed / agg.total) * 100).toFixed(1);
            aggText = `<span class="consumption-agg">consumed ${agg.consumed}/${agg.total} (${pct}%)</span>`;
          }
          html += `<details class="parts-tree"${openAttr}>
                    <summary>${lineText}${aggText}</summary>${childHtml}
                  </details>`;
        } else {
          html += `<li>${lineText}</li>`;
        }
      }
      html += "</ul>";
    }

    // ────────────────────────────────────────────────
    //   Flat collection branch
    // ────────────────────────────────────────────────
    else if (tree.type === "flat-collection" && (tree.container === qid || tree.members.some(m => m.id === qid))) {
      html += `<div class="flat-collection"><ul>`;
      for (const m of tree.members) {
        const isCurrent = m.id === currentQid;
        const ordinal   = m.ordinal ? `${m.ordinal}. ` : "";
        const link      = `<a href="index.html?id=${m.id}">${safeLabel(m, m.id)}</a>`;
        html += `<li>${isCurrent ? "<strong class='current-entry'>" : ""}${ordinal}${link}${isCurrent ? "</strong>" : ""}</li>`;
      }
      html += "</ul></div>";
    }
  }

  return html;
}
