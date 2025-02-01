/* js/rendering.js */

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
      let tableHtml = `<table class="properties-table">
        <thead>
          <tr>
            <th>Property (ID)</th>
            <th>Value(s)</th>
          </tr>
        </thead>
        <tbody>`;
      function renderGroup(groupId, groupTitle, refQid) {
        if (!grouped[groupId] || grouped[groupId].length === 0) return "";
        let headerLine = refQid
          ? `${groupTitle} (<a href="index.html?id=${refQid}">${refQid}</a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${refQid}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${refQid}" target="_blank">wikidata</a>]</span>)`
          : groupTitle;
        let html = `<tr class="group-header"><td colspan="2"><details class="group-details"><summary>${headerLine}</summary>`;
        html += `<table>`;
        grouped[groupId].forEach(row => {
          const propDef = propDefinitions[row.prop];
          const humanName = propDef ? propDef.label : row.prop;
          const propIdDisplay = row.prop;
          const propIdLinks = `${propIdDisplay} <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${row.prop}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/Property:${row.prop}" target="_blank">wikidata</a>]</span>`;
          let cellContent = "";
          row.values.forEach(val => {
            if (val.type === "wikidata") {
              const itemLabel = itemLabels[val.qid] || val.qid;
              cellContent += `<a href="index.html?id=${val.qid}">${itemLabel} <span class="small-id">(${val.qid})</span></a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${val.qid}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${val.qid}" target="_blank">wikidata</a>]</span>, `;
            } else {
              if (val.hyperlink) {
                cellContent += `<a href="${val.hyperlink}" target="_blank">${val.display}</a>, `;
              } else {
                cellContent += `${val.display}, `;
              }
            }
          });
          cellContent = cellContent.replace(/, $/, "");
          html += `<tr><td>${humanName} (${propIdLinks})</td><td>${cellContent}</td></tr>`;
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
  
function renderEntity(entity, qid, updateHistory = true) {
    const label = (entity.labels && entity.labels.en) ? entity.labels.en.value : qid;
    let headerHtml = `<h3><a href="index.html?id=${qid}">${label} <span class="small-id">(${qid})</span></a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${qid}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${qid}" target="_blank">wikidata</a>]</span></h3>`;
    if (entity.descriptions && entity.descriptions.en) {
      headerHtml += `<p>${entity.descriptions.en.value}</p>`;
    }
    if (updateHistory) {
      window.history.pushState({}, '', "?id=" + qid);
    }
    document.title = label + " (" + qid + ") - Wikidata Media Tracker";
  
    // SERIES/SEQUENCING INFORMATION
    const sequencing = extractSequencingInfo(entity);
    let seriesQid = null;
    if (entity.claims && entity.claims.P179 && entity.claims.P179.length > 0) {
      seriesQid = entity.claims.P179[0].mainsnak.datavalue.value.id;
    } else if (entity.claims && entity.claims.P31) {
      const instanceIds = entity.claims.P31.map(claim => claim.mainsnak.datavalue.value.id).filter(Boolean);
      if (instanceIds.includes("Q7725310") || instanceIds.includes("Q24856")) {
        seriesQid = qid;
      }
    }
    if (!seriesQid) {
      getParentSeries(qid).then(parent => {
        seriesQid = parent || qid;
        continueRendering();
      });
    } else {
      continueRendering();
    }
    
    function continueRendering() {
      fetchWikidataEntities([seriesQid]).then(seriesData => {
        const seriesInfo = seriesData[seriesQid];
        let p179Link = `P179 <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=P179" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/Property:P179" target="_blank">wikidata</a>]</span>`;
        let seriesLink = `<a href="index.html?id=${seriesQid}">${seriesInfo.label} <span class="small-id">(${seriesQid})</span></a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${seriesQid}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${seriesQid}" target="_blank">wikidata</a>]</span>`;
        let seriesSectionHtml = `<details id="seriesDetails" open><summary>Series/Sequencing Information</summary>`;
        seriesSectionHtml += `<p>Part of the series (${p179Link}): ${seriesLink}</p>`;
  
        // Try to render the parts tree via P527
        renderPartsTree(seriesQid, qid).then(partsTreeHtml => {
          if (partsTreeHtml && partsTreeHtml.trim()) {
            seriesSectionHtml += `<p>Parts (sorted by series ordinal):</p>` + partsTreeHtml;
            addDirectSequencingAndRender(seriesSectionHtml);
          } else {
            // Fallback: fetch all entities that are "part of" this series (P179)
            fetchSeriesPartsFallback(seriesQid).then(fallbackParts => {
              if (fallbackParts.length > 0) {
                let fallbackHtml = "<ul class='parts-tree'>";
                fallbackParts.forEach(part => {
                  let partLine = "";
                  if (part.ordinal !== null) {
                    partLine += part.ordinal + ". ";
                  }
                  partLine += `<a href="index.html?id=${part.id}">${part.label} <span class="small-id">(${part.id})</span></a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${part.id}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${part.id}" target="_blank">wikidata</a>]</span>`;
                  fallbackHtml += `<li>${partLine}</li>`;
                });
                fallbackHtml += "</ul>";
                seriesSectionHtml += `<p>Parts (sorted by series ordinal):</p>` + fallbackHtml;
              } else {
                seriesSectionHtml += `<p>No parts found for this series.</p>`;
              }
              addDirectSequencingAndRender(seriesSectionHtml);
            });
          }
        });
      
        function addDirectSequencingAndRender(seriesSectionHtml) {
          const directIds = Array.from(new Set([...sequencing.follows, ...sequencing.followedBy, ...sequencing.hasParts]));
          fetchWikidataEntities(directIds).then(seqEntities => {
            let directSeqHtml = "";
            if (sequencing.follows.length > 0) {
              directSeqHtml += `<p>Follows: ${sequencing.follows.map(id => {
                const ent = seqEntities[id] || { label: id, description: "" };
                return `<a href="index.html?id=${id}">${ent.label} <span class="small-id">(${id})</span></a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${id}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${id}" target="_blank">wikidata</a>]</span>`;
              }).join(", ")}</p>`;
            }
            if (sequencing.followedBy.length > 0) {
              directSeqHtml += `<p>Followed by: ${sequencing.followedBy.map(id => {
                const ent = seqEntities[id] || { label: id, description: "" };
                return `<a href="index.html?id=${id}">${ent.label} <span class="small-id">(${id})</span></a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${id}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${id}" target="_blank">wikidata</a>]</span>`;
              }).join(", ")}</p>`;
            }
            if (directSeqHtml) {
              seriesSectionHtml += `<h5>Direct sequencing statements</h5>${directSeqHtml}`;
            }
            seriesSectionHtml += `</details>`;
            renderIdentifiers(entity, qid).then(propertiesHtml => {
              document.getElementById('infoDisplay').innerHTML = headerHtml + propertiesHtml + seriesSectionHtml;
            });
          });
        }
      });
    }
}
  
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
