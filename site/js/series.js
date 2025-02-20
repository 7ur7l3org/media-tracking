/* js/series.js */

function fetchSeriesParts(seriesQid) {
    // First, try to get the series parts using the "has part(s)" (P527) property.
    const queryP527 = `
      SELECT ?part ?partLabel ?partDescription ?ordinal WHERE {
        wd:${seriesQid} p:P527 ?stmt.
        ?stmt ps:P527 ?part.
        OPTIONAL { ?stmt pq:P1545 ?ordinal. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      ORDER BY ?ordinal
    `;
    const urlP527 = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(queryP527) + "&format=json";
  
    return persistentCachedJSONFetch(urlP527)
      .then(data => {
        const parts = data.results.bindings.map(binding => {
          const partId = binding.part.value.split("/").pop();
          return {
            id: partId,
            label: binding.partLabel ? binding.partLabel.value : partId,
            description: binding.partDescription ? binding.partDescription.value : "",
            ordinal: binding.ordinal ? parseInt(binding.ordinal.value, 10) : null
          };
        });
        if (parts.length > 0) {
          parts.sort((a, b) => {
            if (a.ordinal !== null && b.ordinal !== null) return a.ordinal - b.ordinal;
            return a.label.localeCompare(b.label);
          });
          return parts;
        } else {
          // Fallback: Get all items that are "part of the series" (P179) along with their ordinal (P1545)
          const queryP179 = `
            SELECT ?item ?itemLabel ?itemDescription ?ordinal WHERE {
              ?item p:P179 ?stmt.
              ?stmt ps:P179 wd:${seriesQid}.
              OPTIONAL { ?stmt pq:P1545 ?ordinal. }
              SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
            }
            ORDER BY ?ordinal
          `;
          const urlP179 = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(queryP179) + "&format=json";
          return persistentCachedJSONFetch(urlP179)
            .then(data2 => {
              const parts2 = data2.results.bindings.map(binding => {
                const partId = binding.item.value.split("/").pop();
                return {
                  id: partId,
                  label: binding.itemLabel ? binding.itemLabel.value : partId,
                  description: binding.itemDescription ? binding.itemDescription.value : "",
                  ordinal: binding.ordinal ? parseInt(binding.ordinal.value, 10) : null
                };
              });
              parts2.sort((a, b) => {
                if (a.ordinal !== null && b.ordinal !== null) return a.ordinal - b.ordinal;
                return a.label.localeCompare(b.label);
              });
              return parts2;
            })
            .catch(err => {
              console.error("Error fetching series parts fallback:", err);
              return [];
            });
        }
      })
      .catch(err => {
        console.error("Error fetching series parts:", err);
        return [];
      });
  }
    
  function renderPartsTree(qid, currentQid) {
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
    
        let partLine = "";
        if (part.ordinal !== null) {
          partLine += part.ordinal + ". ";
        }
        partLine += `<a href="index.html?id=${part.id}">${part.label}</a> <span class="small-id">(${part.id})</span><span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${part.id}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${part.id}" target="_blank">wikidata</a>]</span>`;
    
        return renderPartsTree(part.id, currentQid).then(childHtml => {
          // Expand the details element if this part is the current entity or if any child branch contains the current entity.
          const openAttr = (part.id === currentQid || childHtml.indexOf(currentQid) !== -1) ? " open" : "";
          if (childHtml) {
            return `<details class="parts-tree"${openAttr}><summary>${markerStart}${partLine}${markerEnd}</summary>${childHtml}</details>`;
          } else {
            return `<li>${markerStart}${partLine}${markerEnd}</li>`;
          }
        });
      });
      return Promise.all(partPromises).then(results => {
        html += results.join("");
        html += "</ul>";
        return html;
      });
    });
  }
    
  function getParentSeries(qid) {
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
        console.error("Error fetching parent series:", err);
        return null;
      });
  }
    
  function extractSequencingInfo(entity) {
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
  