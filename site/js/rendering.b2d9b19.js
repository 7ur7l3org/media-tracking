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
 * Renders the full entity view.
 * This function preserves all fallback logic (for checking parts and fallback parts)
 * and now uses the new backend structure. It also attaches add‑entry handlers after rendering.
 */
function renderEntity(entity, qid, updateHistory = true) {
  loadBackendData().then((backend) => {
    const key = "http://www.wikidata.org/entity/" + qid;
    // Update meta if not set.
    if (!backend.media[key] || !backend.media[key].meta.title) {
      ensureMediaEntry(qid);
      backend.media[key].meta.title = (entity.labels && entity.labels.en) ? entity.labels.en.value : qid;
      backend.media[key].meta.description = (entity.descriptions && entity.descriptions.en) ? entity.descriptions.en.value : "";
      saveBackendData();
    }
    window.currentEntity = entity; // store globally for refreshes
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
    const sequencing = extractSequencingInfo(entity);
    let seriesQids = [];
    if (entity.claims && entity.claims.P179 && entity.claims.P179.length > 0) {
      seriesQids = entity.claims.P179
                      .map(claim => claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value.id)
                      .filter(Boolean);
    } else if (entity.claims && entity.claims.P31) {
      const instanceIds = entity.claims.P31.map(claim => claim.mainsnak.datavalue.value.id).filter(Boolean);
      if (instanceIds.includes("Q7725310") || instanceIds.includes("Q24856")) {
        seriesQids.push(qid);
      }
    }
    function continueRendering() {
      document.getElementById("searchDetails").removeAttribute("open");
      Promise.all(seriesQids.map(seriesQid => {
        return fetchWikidataEntities([seriesQid]).then(seriesData => {
          let leftText = `Part of the series <span class="small-id">(P179<span class="extra-link small-extra">[<a href="https://sqid.toolforge.org/#/view?id=P179" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/P179" target="_blank">wikidata</a>]</span>)</span>`;
          let rightText = `<a href="index.html?id=${seriesQid}">${seriesData[seriesQid].label}</a> <span class="small-id">(${seriesQid}<span class="extra-link small-extra">[<a href="https://sqid.toolforge.org/#/view?id=${seriesQid}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${seriesQid}" target="_blank">wikidata</a>]</span>)</span>`;
          return aggregateDescendantConsumptionStats(seriesQid).then(agg => {
            let aggText = "";
            if (agg.total > 0) {
              let pct = ((agg.consumed / agg.total) * 100).toFixed(1);
              aggText = `<span class="consumption-agg">consumed ${agg.consumed}/${agg.total} (${pct}%)</span>`;
            }
            let summaryText = `<span class="summary-left">${leftText} : ${rightText}</span>${aggText}`;
            return renderPartsTree(seriesQid, qid).then(partsTreeHtml => {
              let partsContentPromise;
              if (partsTreeHtml && partsTreeHtml.trim()) {
                partsContentPromise = Promise.resolve(partsTreeHtml);
              } else {
                partsContentPromise = fetchSeriesParts(seriesQid).then(fallbackParts => {
                  if (fallbackParts.length > 0) {
                    let fallbackHtml = "<ul class='parts-tree'>";
                    fallbackParts.forEach(part => {
                      let partLine = "";
                      if (part.ordinal !== null) {
                        partLine += part.ordinal + ". ";
                      }
                      partLine += `<a href="index.html?id=${part.id}">${part.label}</a> <span class="small-id">(${part.id}<span class="extra-link small-extra">[<a href="https://sqid.toolforge.org/#/view?id=${part.id}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${part.id}" target="_blank">wikidata</a>]</span>)</span>`;
                      fallbackHtml += `<li>${partLine}</li>`;
                    });
                    fallbackHtml += "</ul>";
                    return fallbackHtml;
                  }
                  return "";
                });
              }
              return partsContentPromise.then(partsContent => {
                const directIds = Array.from(new Set([...sequencing.follows, ...sequencing.followedBy, ...sequencing.hasParts]));
                return fetchWikidataEntities(directIds).then(seqEntities => {
                  let directSeqHtml = "";
                  if (sequencing.follows.length > 0) {
                    directSeqHtml += `<p>Follows: ${sequencing.follows.map(id => {
                      const ent = seqEntities[id] || { label: id };
                      return `<a href="index.html?id=${id}">${ent.label}</a> <span class="small-id">(${id}<span class="extra-link small-extra">[<a href="https://sqid.toolforge.org/#/view?id=${id}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${id}" target="_blank">wikidata</a>]</span>)</span>`;
                    }).join(", ")}</p>`;
                  }
                  if (sequencing.followedBy.length > 0) {
                    directSeqHtml += `<p>Followed by: ${sequencing.followedBy.map(id => {
                      const ent = seqEntities[id] || { label: id };
                      return `<a href="index.html?id=${id}">${ent.label}</a> <span class="small-id">(${id}<span class="extra-link small-extra">[<a href="https://sqid.toolforge.org/#/view?id=${id}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${id}" target="_blank">wikidata</a>]</span>)</span>`;
                    }).join(", ")}</p>`;
                  }
                  let detailsContent = partsContent + directSeqHtml;
                  return `<tr><td>
                            <details class="series-details" open>
                              <summary>${summaryText}</summary>
                              ${detailsContent}
                            </details>
                          </td></tr>`;
                });
              });
            });
          });
        });
      })).then(seriesRowsArray => {
        if (seriesQids.length === 1 && seriesQids[0] === qid &&
            sequencing.follows.length === 0 &&
            sequencing.followedBy.length === 0) {
          // Fallback: Check for parts by fetching series parts for the current entity.
          fetchSeriesParts(qid).then(parts => {
            if (parts.length === 0) {
              renderIdentifiers(entity, qid).then(propertiesHtml => {
                document.getElementById('infoDisplay').innerHTML = headerHtml + renderBackendDetails(qid) + propertiesHtml;
                window.backendModule.attachAddEntryHandlers(qid);
              });
            } else {
              let seriesTableHtml = `<table class="series-table" id="seriesContainer">
                <thead>
                  <tr>
                    <th>
                      <button onclick="toggleDetails('seriesContainer', this)">[+]</button>
                      Series/Sequencing Information
                    </th>
                  </tr>
                </thead>
                <tbody>`;
              seriesRowsArray.forEach(rowHtml => {
                seriesTableHtml += rowHtml;
              });
              seriesTableHtml += `</tbody></table>`;
              renderIdentifiers(entity, qid).then(propertiesHtml => {
                const finalHtml = headerHtml + 
                                  `<div id="backendDetailsContainer">` + renderBackendDetails(qid) + `</div>` + 
                                  propertiesHtml + seriesTableHtml;
                document.getElementById('infoDisplay').innerHTML = finalHtml;
                window.backendModule.attachAddEntryHandlers(qid);
              });
            }
          });
        } else {
          let seriesTableHtml = `<table class="series-table" id="seriesContainer">
            <thead>
              <tr>
                <th>
                  <button onclick="toggleDetails('seriesContainer', this)">[+]</button>
                  Series/Sequencing Information
                </th>
              </tr>
            </thead>
            <tbody>`;
          seriesRowsArray.forEach(rowHtml => {
            seriesTableHtml += rowHtml;
          });
          seriesTableHtml += `</tbody></table>`;
          renderIdentifiers(entity, qid).then(propertiesHtml => {
            document.getElementById('infoDisplay').innerHTML = headerHtml + renderBackendDetails(qid) + propertiesHtml + seriesTableHtml;
            window.backendModule.attachAddEntryHandlers(qid);
          });
        }
      });
    }
    if (seriesQids.length === 0) {
      getParentSeries(qid).then(parent => {
        seriesQids = parent ? [parent] : [qid];
        continueRendering();
      });
    } else {
      continueRendering();
    }
  });
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
