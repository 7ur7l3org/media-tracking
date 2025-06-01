/* js/series.js */

// In-memory cache for series parts, keyed by series QID.
const seriesPartsCache = {};

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

// =============================================
// ABSTRACT DATA API (designed for efficient future implementation)
// =============================================
const SeriesDataAPI = {
  /**
   * Get hierarchical structure for an entity
   * @returns {Promise<{entity: string, sequence: {previous: string|null, next: string|null}, structure: {trees: Array<{type: string, [key: string]: any}>}}>}
   */
  async getHierarchyForEntity(qid) {
    // This will be implemented by your efficient code later
    // For now, we'll wrap the existing implementation
    return LegacyDataAdapter.getHierarchyForEntity(qid);
  },

  /**
   * Get backend consumption/stats for an entity
   * @returns {Promise<{statsHTML: string, isQueued: boolean}>}
   */
  async getBackendStatsForQid(qid) {
    // This will be implemented by your efficient code later
    return LegacyDataAdapter.getBackendStatsForQid(qid);
  }
};

// =============================================
// LEGACY ADAPTER (implements abstract API using current implementation)
// =============================================
const LegacyDataAdapter = {
  async getHierarchyForEntity(qid) {
    // Build hierarchy structure from existing functions
    const children = await fetchSeriesParts(qid);
    const sequence = extractSequencingInfo({id: qid});
    const parent = await getParentSeries(qid);
    
    return {
      entity: qid,
      sequence: {
        previous: sequence.follows[0] || null,
        next: sequence.followedBy[0] || null
      },
      structure: {
        trees: [{
          type: "hierarchy",
          root: qid,
          edges: children.map(child => ({
            parentId: qid,
            childId: child.id,
            childLabel: child.label,
            ordinal: child.ordinal
          }))
        }]
      }
    };
  },

  async getBackendStatsForQid(qid) {
    // Original implementation
    return loadBackendData().then(backendData => {
      const key = "http://www.wikidata.org/entity/" + qid;
  console.log("Entering getBackendStatsForQid with qid:", qid);
  return loadBackendData().then(backendData => {
    const key = "http://www.wikidata.org/entity/" + qid;
    // Updated: look inside backendData.media
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
    });
  }
};

// =============================================
// REFACTORED RENDERING (uses abstract API)
// =============================================

/**
 * Batch fetch series parts for multiple QIDs.
 * Returns a promise resolving to a mapping from QID to an array of parts.
 *
 * This function uses a combined SPARQL query (with a VALUES clause) to request parts
 * for all provided QIDs in one go. It prints a simple log message with the QIDs being requested.
 */
function batchFetchSeriesParts(qidArray) {
  // console.log("Entering batchFetchSeriesParts with QID array:", qidArray);
  // Filter out QIDs that are already cached.
  const toRequest = qidArray.filter(qid => !(qid in seriesPartsCache));
  let cachedResults = {};
  qidArray.forEach(qid => {
    if (seriesPartsCache[qid]) {
      cachedResults[qid] = seriesPartsCache[qid];
    }
  });
  if (toRequest.length === 0) {
    console.log("batchFetchSeriesParts: Using cached results for QIDs:", qidArray);
    return Promise.resolve(cachedResults);
  }
  console.log("batchFetchSeriesParts [SPARQL REQUEST]: Fetching parts for uncached QIDs:", toRequest);
  const valuesStr = toRequest.map(qid => "wd:" + qid).join(" ");
  const query = `
    SELECT DISTINCT ?qid ?part ?source ?partLabel ?partDescription ?ordinal WHERE {
      VALUES ?qid { ${valuesStr} }
      {
        ?qid p:P527 ?stmt.
        ?stmt ps:P527 ?part.
        OPTIONAL { ?stmt pq:P1545 ?ordinal. }
        BIND("P527" AS ?source)
      }
      UNION
      {
        ?item p:P179 ?stmt.
        ?stmt ps:P179 ?qid.
        OPTIONAL { ?stmt pq:P1545 ?ordinal. }
        BIND(?item AS ?part)
        BIND("P179" AS ?source)
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY ?qid ?ordinal
  `;
  return persistentCachedJSONFetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(query) + "&format=json")
    .then(data => {
      const mapping = {};
      data.results.bindings.forEach(binding => {
        let qidFull = binding.qid.value;
        let currentQid = qidFull.split("/").pop();
        let partFull = binding.part.value;
        let partId = partFull.split("/").pop();
        let partLabel = binding.partLabel ? binding.partLabel.value : partId;
        let partDescription = binding.partDescription ? binding.partDescription.value : "";
        let ordinal = binding.ordinal ? parseInt(binding.ordinal.value, 10) : null;
        let source = binding.source ? binding.source.value : null;
        if (!mapping[currentQid]) {
          mapping[currentQid] = [];
        }
        mapping[currentQid].push({ id: partId, label: partLabel, description: partDescription, ordinal, source });
      });
      // For each QID, if any binding is from P527, use only those; otherwise, use all.
      Object.keys(mapping).forEach(qid => {
        const parts = mapping[qid];
        const hasP527 = parts.some(part => part.source === "P527");
        if (hasP527) {
          mapping[qid] = parts.filter(part => part.source === "P527");
        }
        mapping[qid].sort((a, b) => {
          if (a.ordinal !== null && b.ordinal !== null) return a.ordinal - b.ordinal;
          return a.label.localeCompare(b.label);
        });
      });
      // Update cache for requested QIDs.
      toRequest.forEach(qid => {
        seriesPartsCache[qid] = mapping[qid] || [];
      });
      const result = Object.assign({}, cachedResults, mapping);
      return result;
    })
    .catch(err => {
      console.error("Error in batchFetchSeriesParts for QIDs:", toRequest, err);
      toRequest.forEach(qid => {
        seriesPartsCache[qid] = [];
      });
      return Object.assign({}, cachedResults);
    });
}

/**
 * Fetch series parts for a single QID.
 * This wraps the batchFetchSeriesParts function.
 */
function fetchSeriesParts(qid) {
  return batchFetchSeriesParts([qid]).then(mapping => mapping[qid] || []);
}

/**
 * Recursively aggregates consumption statistics
 */
async function aggregateDescendantConsumptionStats(qid, visited = new Set(), counted = new Set(), backend = null) {
  if (!backend) backend = await loadBackendData();
  
  const hierarchy = await SeriesDataAPI.getHierarchyForEntity(qid);
  let total = 0;
  let consumed = 0;
  
  // Process all children from all trees
  for (const tree of hierarchy.structure.trees) {
    const children = [];
    
    if (tree.type === "hierarchy") {
      // Get direct children for this tree
      children.push(...tree.edges
        .filter(edge => edge.parentId === qid)
        .map(edge => ({id: edge.childId}))
      );
    }
    else if (tree.type === "flat-collection" && tree.container === qid) {
      // Get members of flat collection
      children.push(...tree.members.map(m => ({id: m.id})));
    }
    
    for (const child of children) {
      const childId = child.id;
      if (visited.has(childId)) continue;
      visited.add(childId);
      
      // Check if child has its own children
      const childHierarchy = await SeriesDataAPI.getHierarchyForEntity(childId);
      const hasChildren = childHierarchy.structure.trees.some(t => 
        (t.type === "hierarchy" && t.edges.length > 0) ||
        (t.type === "flat-collection" && t.members.length > 0)
      );
      
      if (!hasChildren) {
        if (!counted.has(childId)) {
          total += 1;
          const key = "http://www.wikidata.org/entity/" + childId;
          if (backend.media?.[key]?.consumptions?.length > 0) {
            consumed += 1;
          }
          counted.add(childId);
        }
      } else {
        const childAgg = await aggregateDescendantConsumptionStats(childId, visited, counted, backend);
        total += childAgg.total;
        consumed += childAgg.consumed;
      }
    }
  }
  
  return {total, consumed};
}

/**
 * Renders a parts tree for a given series QID
 */
async function renderPartsTree(qid, currentQid) {
  const hierarchy = await SeriesDataAPI.getHierarchyForEntity(qid);
  let html = "";
  
  for (const tree of hierarchy.structure.trees) {
    if (tree.type === "hierarchy") {
      // Get direct children for this tree
      const children = tree.edges
        .filter(edge => edge.parentId === qid)
        .sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
      
      if (children.length === 0) continue;
      
      html += "<ul class='parts-tree'>";
      for (const child of children) {
        const isCurrent = child.childId === currentQid;
        const arrow = " ⟵";
        const marker = isCurrent ? `<strong class='current-entry'>` : "";
        const endMarker = isCurrent ? `${arrow}</strong>` : "";
        
        const ordinalPart = child.ordinal ? `${child.ordinal}. ` : "";
        
        let mainPart = `<a href="index.html?id=${child.childId}">${child.childLabel}</a> <span class="small-id">(${child.childId})</span>`;
        
        const statsObj = await SeriesDataAPI.getBackendStatsForQid(child.childId);
        const statsHTML = statsObj.statsHTML;
        const combinedMain = statsObj.isQueued ? 
          `<span class="queued-line">${mainPart + statsHTML}</span>` : 
          (mainPart + statsHTML);
        
        const combinedLine = ordinalPart + combinedMain;
        const childHtml = await renderPartsTree(child.childId, currentQid);
        
        if (childHtml) {
          const openAttr = (isCurrent || childHtml.includes(currentQid)) ? " open" : "";
          const agg = await aggregateDescendantConsumptionStats(child.childId, new Set(), new Set());
          let aggText = "";
          
          if (agg.total > 0) {
            const pct = ((agg.consumed / agg.total) * 100).toFixed(1);
            aggText = `<span class="consumption-agg">consumed ${agg.consumed}/${agg.total} (${pct}%)</span>`;
          }
          
          html += `<details class="parts-tree"${openAttr}><summary><span class="summary-left">${marker}${combinedLine}${endMarker}</span>${aggText}</summary>${childHtml}</details>`;
        } else {
          html += `<li>${marker}${combinedLine}${endMarker}</li>`;
        }
      }
      html += "</ul>";
    }
    else if (tree.type === "flat-collection") {
      // Render flat collection
      html += `<div class="flat-collection"><h3>${tree.containerLabel}</h3><ul>`;
      for (const member of tree.members) {
        const isCurrent = member.id === currentQid;
        const marker = isCurrent ? `<strong class='current-entry'>` : "";
        const endMarker = isCurrent ? `</strong>` : "";
        
        const ordinalPart = member.ordinal ? `${member.ordinal}. ` : "";
        let mainPart = `<a href="index.html?id=${member.id}">${member.label}</a>`;
        
        html += `<li>${marker}${ordinalPart}${mainPart}${endMarker}</li>`;
      }
      html += "</ul></div>";
    }
  }
  
  return html;
}

// =============================================
// ORIGINAL IMPLEMENTATIONS (keep as-is for now)
// =============================================

// ... (keep all your original functions: 
//      batchFetchSeriesParts, fetchSeriesParts, 
//      getParentSeries, extractSequencingInfo, 
//      formatDateShort, formatDateLong, toggleDate) ...

/**
 * Returns a promise that resolves to the QID of the parent series of the given entity, if any.
 */
function getParentSeries(qid) {
  console.log("Entering getParentSeries with qid:", qid);
  const query = `
      SELECT ?series WHERE {
        ?series wdt:P527 wd:${qid}.
      } LIMIT 1
    `;
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query) + "&format=json";
  return persistentCachedJSONFetch(url)
    .then(data => {
      if (data.results.bindings.length > 0) {
        return data.results.bindings[0].series.value.split("/").pop();
      }
      return null;
    })
    .catch(err => {
      console.error("Error fetching parent series for qid:", qid, err);
      return null;
    });
}

/**
 * Extracts sequencing information from a Wikidata entity.
 */
function extractSequencingInfo(entity) {
  console.log("Entering extractSequencingInfo with entity id:", entity.id || "unknown");
  const sequencing = { follows: [], followedBy: [], hasParts: [], partOf: [] };
  if (entity.claims) {
    if (entity.claims.P155) {
      entity.claims.P155.forEach(claim => {
        if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value.id) {
          sequencing.follows.push(claim.mainsnak.datavalue.value.id);
        }
      });
    }
    if (entity.claims.P156) {
      entity.claims.P156.forEach(claim => {
        if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value.id) {
          sequencing.followedBy.push(claim.mainsnak.datavalue.value.id);
        }
      });
    }
    if (entity.claims.P527) {
      entity.claims.P527.forEach(claim => {
        if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value.id) {
          sequencing.hasParts.push(claim.mainsnak.datavalue.value.id);
        }
      });
    }
    if (entity.claims.P179) {
      entity.claims.P179.forEach(claim => {
        if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value.id) {
          sequencing.partOf.push(claim.mainsnak.datavalue.value.id);
        }
      });
    }
  }
  return sequencing;
}
