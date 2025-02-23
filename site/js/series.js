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
 * Clicking the date span swaps its inner text between the two formats.
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
 *   for the given QID. Each date is rendered as a clickable span that toggles
 *   between short (YYYY-MM-DD) and long (YYYY-MM-DD HH:MM:SS AM/PM TZ) formats.
 *   Each span always has a title showing the long format.
 *   For a single entry, the date is rendered directly; for multiple entries,
 *   it renders "xN" with comma-separated dates.
 * - isQueued: a boolean that is true if the entry has any queue votes.
 *
 * Both consumption and queue vote info are always shown.
 */
function getBackendStatsForQid(qid) {
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
      
      // Render the ordinal separately so it won't be highlighted.
      let ordinalPart = "";
      if (part.ordinal !== null) {
        ordinalPart = part.ordinal + ". ";
      }
      
      // Render the main part (label, IDs, extra links)
      let mainPart = `<a href="index.html?id=${part.id}">${part.label}</a> <span class="small-id">(${part.id})</span><span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${part.id}" target="_blank">sqid</a>][<a href="https://www.wikidata.org/wiki/${part.id}" target="_blank">wikidata</a>]</span>`;
      
      // Get backend stats for this part.
      return getBackendStatsForQid(part.id).then(statsObj => {
        let statsHTML = statsObj.statsHTML;
        // If queued, wrap only the main part and stats (not the ordinal) in blue background.
        let combinedMain = statsObj.isQueued ? `<span class="queued-line">${mainPart + statsHTML}</span>` : (mainPart + statsHTML);
        const combinedLine = ordinalPart + combinedMain;
        return renderPartsTree(part.id, currentQid).then(childHtml => {
          // Expand the details element if this part is the current entity or if any child branch contains the current entity.
          const openAttr = (part.id === currentQid || childHtml.indexOf(currentQid) !== -1) ? " open" : "";
          if (childHtml) {
            return `<details class="parts-tree"${openAttr}><summary>${markerStart}${combinedLine}${markerEnd}</summary>${childHtml}</details>`;
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
