/* js/rendering.js */

/**
 * Renders the identifiers (properties) table for a Wikidata entity.
 */
function renderIdentifiers(entity, qid) {
  const propIDs = Object.keys(entity.claims);
  return fetchPropertyDefinitions(propIDs).then(async propDefinitions => {
    const propertyRows = [];
    const wikidataItemIds = new Set();
    for (const prop in entity.claims) {
      const row = { prop, values: [] };
      for (const claim of entity.claims[prop]) {
        if (claim.mainsnak && claim.mainsnak.datavalue) {
          let rawValue = claim.mainsnak.datavalue.value;
          const valueData = {};
          if (typeof rawValue === "object" && rawValue["entity-type"] === "item" && rawValue.id) {
            valueData.type = "wikidata";
            valueData.qid = rawValue.id;
            wikidataItemIds.add(rawValue.id);
            valueData.display = rawValue.id;
            valueData.hyperlink = rawValue.id;
          } else {
            valueData.type = "text";
            valueData.display = (typeof rawValue === "string") ? rawValue : await formatWikidataValue(rawValue);
            valueData.hyperlink = null;
          }
          const propDef = propDefinitions[prop];
          if (propDef && propDef.formatter) {
            valueData.hyperlink = propDef.formatter.replace("$1", valueData.display);
          }
          if (valueData.type === "text" && !valueData.hyperlink && typeof rawValue === "string" &&
              rawValue.match(/^https?:\/\//)) {
            valueData.hyperlink = rawValue;
          }
          row.values.push(valueData);
        }
      }
      if (row.values.length) {
        propertyRows.push(row);
      }
    }
    const closureMapping = await getPropertyClosure(propertyRows.map(r => r.prop));
    const grouped = { creative: [], authority: [], misc: [] };
    propertyRows.forEach(row => {
      const closure = closureMapping[row.prop] || [];
      let group = "misc";
      if (closure.includes("Q18614948")) {
        group = "authority";
      } else if (closure.includes("Q18618644")) {
        group = "creative";
      }
      grouped[group].push(row);
    });
    const itemLabels = await fetchWikidataItemLabels(Array.from(wikidataItemIds));
    let tableHtml = `<table class="properties-table" id="propertiesContainer">
      <thead>
        <tr>
          <th>
            <button onclick="toggleDetails('propertiesContainer', this)">[+]</button>
            Property (ID)
          </th>
          <th>Value(s)</th>
        </tr>
      </thead>
      <tbody>`;
    function renderGroup(groupId, groupTitle, refQid) {
      if (!grouped[groupId] || grouped[groupId].length === 0) return "";
      let headerLine = refQid
        ? `${groupTitle} <span class="small-id">(${refQid}<span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${refQid}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${refQid}" target="_blank">wikidata</a>]</span>)</span>`
        : groupTitle;
      let html = `<tr class="group-header"><td colspan="2">
          <details class="group-details">
            <summary>${headerLine}</summary>`;
      html += `<table>`;
      grouped[groupId].forEach(row => {
        const propDef = propDefinitions[row.prop];
        const humanName = propDef ? propDef.label : row.prop;
        const propIdDisplay = row.prop;
        const propIdLinks = `<span class="small-id">(${propIdDisplay}<span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${row.prop}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/Property:${row.prop}" target="_blank">wikidata</a>]</span>)</span>`;
        let cellContent = "";
        row.values.forEach(val => {
          if (val.type === "wikidata") {
            const itemLabel = itemLabels[val.qid] || val.qid;
            cellContent += `<a href="index.html?id=${val.qid}">${itemLabel}</a> <span class="small-id">(${val.qid}<span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${val.qid}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${val.qid}" target="_blank">wikidata</a>]</span>)</span>, `;
          } else {
            if (val.hyperlink) {
              cellContent += `<a href="${val.hyperlink}" target="_blank">${val.display}</a>, `;
            } else {
              cellContent += `${val.display}, `;
            }
          }
        });
        cellContent = cellContent.replace(/, $/, "");
        html += `<tr><td>${humanName} ${propIdLinks}</td><td>${cellContent}</td></tr>`;
      });
      html += `</table></details></td></tr>`;
      return html;
    }
    tableHtml += renderGroup("creative", "Wikidata property related to creative works", "Q18618644");
    tableHtml += renderGroup("authority", "Authority control properties", "Q18614948");
    tableHtml += renderGroup("misc", "Miscellaneous Properties");
    tableHtml += `</tbody></table>`;
    return tableHtml;
  });
}

/**
 * Renders the full entity view using the new data API.
 */
async function renderEntity(entity, qid, updateHistory = true) {
  const backend = await loadBackendData();
  const key = "http://www.wikidata.org/entity/" + qid;
  
  // Update meta if not set
  if (!backend.media[key] || !backend.media[key].meta.title) {
    ensureMediaEntry(qid);
    backend.media[key].meta.title = (entity.labels && entity.labels.en) ? entity.labels.en.value : qid;
    backend.media[key].meta.description = (entity.descriptions && entity.descriptions.en) ? entity.descriptions.en.value : "";
    saveBackendData();
  }

  window.currentEntity = entity;
  const backendSection = renderBackendDetails(qid);
  const label = (entity.labels && entity.labels.en) ? entity.labels.en.value : qid;
  
  let headerHtml = `<h3><a href="index.html?id=${qid}">${label}</a> <span class="small-id">(${qid})</span>
    <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${qid}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${qid}" target="_blank">wikidata</a>]</span></h3>`;
  
  if (entity.descriptions && entity.descriptions.en) {
    headerHtml += `<p>${entity.descriptions.en.value}</p>`;
  }

  if (updateHistory) {
    window.history.pushState({}, '', "?id=" + qid);
  }
  document.title = label + " (" + qid + ") - ueue🫵 - Wikidata Media Tracker";

  // Get sequencing info from hierarchy API instead of extractSequencingInfo
  console.log("getHierarchyForEntity qid", qid, "for renderEntity");
  const hierarchy = await SeriesDataAPI.getHierarchyForEntity(qid);
  const sequencing = {
    follows: hierarchy.sequence.previous ? [hierarchy.sequence.previous.id] : [],
    followedBy: hierarchy.sequence.next ? [hierarchy.sequence.next.id] : [],
    hasParts: hierarchy.structure.trees.flatMap(tree =>
      tree.type === "hierarchy" ? 
        tree.edges.filter(e => e.parentId === qid).map(e => e.childId) : 
        []
    )
  };

  // Determine series QIDs from hierarchy instead of claims
  let seriesQids = [];
  const hasHierarchy = hierarchy.structure.trees.some(tree => 
    tree.type === "hierarchy" && tree.edges.some(e => e.parentId === qid)
  );
  
  if (hasHierarchy) { // TODO where is the rendering of the non-hierarchy trees (flat-collection)
    // Current entity is a container (has parts)
    seriesQids.push(qid);
  } else {
    // Check if part of any hierarchies
    const parentTrees = hierarchy.structure.trees.filter(tree => 
      tree.type === "hierarchy" && tree.edges.some(e => e.childId === qid)
    );
    seriesQids = [...new Set(parentTrees.map(tree => tree.root))];
  }

  if (seriesQids.length === 0) {
    const fc = hierarchy.structure.trees.find(
                t => t.type === "flat-collection" &&
                    t.members.some(m => m.id === qid));
    if (fc) seriesQids.push(fc.container);
  }

  // Check instance types as fallback
  if (seriesQids.length === 0 && entity.claims && entity.claims.P31) {
    const instanceIds = entity.claims.P31
      .map(claim => claim.mainsnak.datavalue?.value.id)
      .filter(Boolean);
    
    if (instanceIds.includes("Q7725310") || instanceIds.includes("Q24856")) { // TODO what the fuck is this
      seriesQids.push(qid);
    }
  }

  async function continueRendering() {
    document.getElementById("searchDetails").removeAttribute("open");
    console.log("series qids are: ", seriesQids)
    const seriesRows = await Promise.all(seriesQids.map(async seriesQid => {
      const seriesData = await fetchWikidataEntities([seriesQid]).then(data => data[seriesQid]);
      
      const leftText = `Part of the series <span class="small-id">(P179<span class="extra-link small-extra">[<a href="https://sqid.toolforge.org/#/view?id=P179" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/P179" target="_blank">wikidata</a>]</span>)</span>`;
      const rightText = `<a href="index.html?id=${seriesQid}">${seriesData.label}</a> <span class="small-id">(${seriesQid}<span class="extra-link small-extra">[<a href="https://sqid.toolforge.org/#/view?id=${seriesQid}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${seriesQid}" target="_blank">wikidata</a>]</span>)</span>`;
      
      // const agg = await aggregateDescendantConsumptionStats(seriesQid);
      const agg = await aggregateDescendantConsumptionStats(
                    seriesQid,
                    new Set(), new Set(),
                    null,              // backend (let the helper fetch once)
                    hierarchy,         // ← pass the film’s hierarchy
                    hierarchy._adjacency);
      let aggText = "";
      if (agg.total > 0) {
        const pct = ((agg.consumed / agg.total) * 100).toFixed(1);
        aggText = `<span class="consumption-agg">consumed ${agg.consumed}/${agg.total} (${pct}%)</span>`;
      }
      
      const summaryText = `<span class="summary-left">${leftText} : ${rightText}</span>${aggText}`;
      const partsTreeHtml = await renderPartsTree(seriesQid, qid, hierarchy);
      
      let partsContent = partsTreeHtml;
      if (!partsTreeHtml.trim()) {
        // Fallback - get direct children if no tree rendered
        console.log("getHierarchyForEntity seriesQid", seriesQid, "for renderEntity (continueRendering)");
        const hierarchy = await SeriesDataAPI.getHierarchyForEntity(seriesQid);
        const children = hierarchy.structure.trees.flatMap(tree => {
          if (tree.type === "hierarchy" && tree.root === seriesQid) {
            return tree.edges.filter(e => e.parentId === seriesQid);
          }
          if (tree.type === "flat-collection" && (tree.container === qid || tree.members.some(m => m.id === qid))) {
            return tree.members;
          }
          return [];
        });
        
        if (children.length > 0) {
          partsContent = "<ul class='parts-tree'>";
          children.forEach(child => {
            const childId = child.childId || child.id;
            const childLabel = safeLabel(child, child.id);
            const ordinal = child.ordinal ? `${child.ordinal}. ` : '';
            partsContent += `<li>${ordinal}<a href="index.html?id=${childId}">${childLabel}</a> <span class="small-id">(${childId})</span></li>`;
          });
          partsContent += "</ul>";
        }
      }

      // Get direct sequencing info
      const directIds = [...sequencing.follows, ...sequencing.followedBy, ...sequencing.hasParts];
      const seqEntities = await fetchWikidataEntities(directIds);
      
      let directSeqHtml = "";
      if (sequencing.follows.length > 0) {
        directSeqHtml += `<p>Follows: ${sequencing.follows.map(id => {
          const ent = seqEntities[id] || { label: id };
          return `<a href="index.html?id=${id}">${ent.label}</a> <span class="small-id">(${id})</span>`;
        }).join(", ")}</p>`;
      }
      if (sequencing.followedBy.length > 0) {
        directSeqHtml += `<p>Followed by: ${sequencing.followedBy.map(id => {
          const ent = seqEntities[id] || { label: id };
          return `<a href="index.html?id=${id}">${ent.label}</a> <span class="small-id">(${id})</span>`;
        }).join(", ")}</p>`;
      }

      const detailsContent = partsContent + directSeqHtml;
      return `<tr><td>
                <details class="series-details" open>
                  <summary>${summaryText}</summary>
                  ${detailsContent}
                </details>
              </td></tr>`;
    }));

    let seriesTableHtml = '';
    if (seriesRows.length > 0) {
      seriesTableHtml = `<table class="series-table" id="seriesContainer">
        <thead>
          <tr>
            <th>
              <button onclick="toggleDetails('seriesContainer', this)">[+]</button>
              Series/Sequencing Information
            </th>
          </tr>
        </thead>
        <tbody>${seriesRows.join('')}</tbody></table>`;
    }

    const propertiesHtml = await renderIdentifiers(entity, qid);
    const finalHtml = headerHtml + 
                     `<div id="backendDetailsContainer">${backendSection}</div>` + 
                     propertiesHtml + 
                     seriesTableHtml;
    
    document.getElementById('infoDisplay').innerHTML = finalHtml;
    window.backendModule.attachAddEntryHandlers(qid);
  }

  if (seriesQids.length === 0) {
    // Fallback - check for parent series
    console.log("getHierarchyForEntity qid", qid, "for renderEntity", entity, "(empty seriesQids)");
    const hierarchy = await SeriesDataAPI.getHierarchyForEntity(qid);
    const parentTrees = hierarchy.structure.trees.filter(tree => 
      tree.type === "hierarchy" && tree.edges.some(e => e.childId === qid)
    );
    seriesQids = parentTrees.length > 0 ? [parentTrees[0].root] : [qid];
  }

  await continueRendering();
}

/**
 * Fetches an entity from Wikidata and renders it.
 */
function fetchEntity(qid, updateHistory = true) {
  const url = "https://www.wikidata.org/wiki/Special:EntityData/" + qid + ".json";
  document.getElementById('infoDisplay').innerHTML = "<p>Loading...</p>";
  persistentCachedJSONFetch(url)
    .then(data => {
      const keys = Object.keys(data.entities);
      if (keys.length === 0) {
        document.getElementById('infoDisplay').innerHTML = "<p>No entity found.</p>";
        return;
      }
      const actualQid = keys[0];
      const entity = data.entities[actualQid];
      if (!entity) {
        document.getElementById('infoDisplay').innerHTML = "<p>No entity found.</p>";
        return;
      }
      document.getElementById("searchDetails").removeAttribute("open");
      renderEntity(entity, actualQid, updateHistory);
    })
    .catch(error => {
      console.error("Error in fetchEntity:", error);
      document.getElementById('infoDisplay').innerHTML = "<p>Error fetching entity data.</p>";
    });
}

/**
 * Toggles (expands/collapses) all <details> elements within the container.
 */
function toggleDetails(containerId, btn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const detailsElements = container.querySelectorAll("details");
  let shouldOpen = false;
  detailsElements.forEach(detail => {
    if (!detail.open) {
      shouldOpen = true;
    }
  });
  detailsElements.forEach(detail => {
    detail.open = shouldOpen;
  });
  btn.textContent = shouldOpen ? "[-]" : "[+]";
}
