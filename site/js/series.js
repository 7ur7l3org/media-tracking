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

/**
 * Returns an object with two properties:
 * - statsHTML: a snippet of HTML with consumption and queue vote stats
 * - isQueued: a boolean that is true if the entry has any queue votes.
 */
function getBackendStatsForQid(qid) {
  console.log("Entering getBackendStatsForQid with qid:", qid);
  return loadBackendData().then(backendData => {
    const key = "http://www.wikidata.org/entity/" + qid;
    const entry = backendData[key];
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
 * Recursively aggregates consumption statistics for all descendant leaf nodes
 * of a given series QID. It deduplicates leaf nodes using a shared "counted" set.
 * Returns a promise that resolves to an object { total, consumed }.
 *
 * A leaf node is counted only once even if reached via multiple paths.
 */
async function aggregateDescendantConsumptionStats(qid, visited = new Set(), counted = new Set(), backendData = null) {
  console.log("Entering aggregateDescendantConsumptionStats with qid:", qid, "visited:", Array.from(visited), "counted:", Array.from(counted));
  if (!backendData) {
    backendData = await loadBackendData();
  }
  let total = 0;
  let consumed = 0;
  console.log("aggregateDescendantConsumptionStats fetching series parts " + qid);
  const parts = await fetchSeriesParts(qid);
  // (No separate deduplication here – we check duplicates when counting a leaf.)
  // Collect child QIDs that haven't been visited.
  const childQids = parts.map(p => p.id).filter(id => !visited.has(id));
  childQids.forEach(id => visited.add(id));
  // Batch fetch children parts for all these QIDs.
  console.log("aggregateDescendantConsumptionStats batch fetching children parts " + childQids);
  const childrenMapping = await batchFetchSeriesParts(childQids);
  for (const part of parts) {
    const childParts = childrenMapping[part.id] || [];
    if (childParts.length === 0) {
      // Leaf node: count this part only if not already counted.
      if (!counted.has(part.id)) {
        total += 1;
        const key = "http://www.wikidata.org/entity/" + part.id;
        if (backendData[key] && backendData[key].consumptions && backendData[key].consumptions.length > 0) {
          consumed += 1;
        }
        counted.add(part.id);
      }
      else
        console.log("skipping count cause it was already in it " + part.id);
    } else {
      // Container node: aggregate recursively, sharing the same counted set.
      const childAgg = await aggregateDescendantConsumptionStats(part.id, visited, counted, backendData);
      total += childAgg.total;
      consumed += childAgg.consumed;
    }
  }
  return { total, consumed };
}

/**
 * Returns a promise that resolves to the HTML representing the parts tree for a given series QID.
 * Highlights the current entity and recursively renders nested parts.
 * For collapsible headers with children, appends consumption aggregate info.
 *
 * A shared "counted" set is passed so that duplicate leaf nodes across the entire tree are only counted once.
 */
function renderPartsTree(qid, currentQid, counted = new Set()) {
  console.log("Entering renderPartsTree with qid:", qid, "and currentQid:", currentQid);
  return fetchSeriesParts(qid).then(parts => {
    if (parts.length === 0) return "";
    let html = "<ul class='parts-tree'>";
    const partPromises = parts.map(part => {
      // Define arrow for the current entry.
      const arrow = " ⟵";
      let markerStart = "";
      let markerEnd = "";
      if (part.id === currentQid) {
        markerStart = "<strong class='current-entry'>";
        markerEnd = arrow + "</strong>";
      }
      // Render the ordinal separately.
      let ordinalPart = "";
      if (part.ordinal !== null) {
        ordinalPart = part.ordinal + ". ";
      }
      // Render the main part (label, IDs, extra links)
      let mainPart = `<a href="index.html?id=${part.id}">${part.label}</a> <span class="small-id">(${part.id})</span><span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${part.id}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${part.id}" target="_blank">wikidata</a>]</span>`;
      return getBackendStatsForQid(part.id).then(statsObj => {
        let statsHTML = statsObj.statsHTML;
        let combinedMain = statsObj.isQueued ? `<span class="queued-line">${mainPart + statsHTML}</span>` : (mainPart + statsHTML);
        const combinedLine = ordinalPart + combinedMain;
        return renderPartsTree(part.id, currentQid, counted).then(childHtml => {
          const openAttr = (part.id === currentQid || (childHtml && childHtml.indexOf(currentQid) !== -1)) ? " open" : "";
          if (childHtml) {
            // Pass along the shared counted set to the aggregator.
            return aggregateDescendantConsumptionStats(part.id, new Set(), new Set()).then(agg => {
              let aggText = "";
              if (agg.total > 0) {
                let pct = ((agg.consumed / agg.total) * 100).toFixed(1);
                aggText = `<span class="consumption-agg">consumed ${agg.consumed}/${agg.total} (${pct}%)</span>`;
              }
              return `<details class="parts-tree"${openAttr}><summary><span class="summary-left">${markerStart}${combinedLine}${markerEnd}</span>${aggText}</summary>${childHtml}</details>`;
            });
          } else {
            return `<li>${markerStart}${combinedLine}${markerEnd}</li>`;
          }
        });
      });
    });
    return Promise.all(partPromises).then(results => {
      html += results.join("");
      html += "</ul>";
      return html;
    });
  });
}

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
