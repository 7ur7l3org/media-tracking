/* js/search.js */

function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

function enableEnterSubmit(inputId, buttonId) {
  document.getElementById(inputId).addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      document.getElementById(buttonId).click();
    }
  });
}
enableEnterSubmit("searchInput", "searchButton");

// Mapping for creative type priority: lower numbers are higher priority.
// Note these priorities only apply to per-page result rendering, overall paginated search results are still in main result order
const creativeTypePriority = {
  // movies and tv
  "Q11424":      1, // film – sequence of images that give the impression of movement, stored on film stock
  "Q24856":      2, // film series – collection of related films in succession
  "Q117467246":  3, // animated television series – TV series done in the animation medium
  "Q202866":     4, // animated film – film for the cinema, television or computer screen that is made by using drawings, stop motion or computer animation
  "Q5398426":    5, // television series – connected set of television program episodes under the same title
  "Q1259759":    6, // miniseries – TV shows or series that have a predetermined number of episodes
  "Q24862":      7, // short film – any film not long enough to be considered a feature film
  "Q506240":     8, // television film – film format that is broadcast and distributed specifically for television networks.
  "Q1261214":    9, // television special – type of television program
  "Q21191270":  10, // television series episode – single installment of a television series

  // other media
  "Q58483083":  21, // dramatico-musical work – opera, musical play or show, revue or pantomime for which music has been specially written; for ballet use "choreographic work" (Q58483088)
  "Q7725634":   22, // literary work – written work read for enjoyment or edification
  "Q1279564":   23, // short story collection – book containing several short stories by a single author
  "Q1004":      24, // comics – creative work in which images and text convey information such as narratives
  "Q7889":      25, // video game – electronic game with user interface and visual feedback
  "Q47461344":  26, // written work – any work expressed in writing, such as inscriptions, manuscripts, documents or maps

  // music
  "Q482994":    41, // album – grouping of album releases by an artist usually released at the same time with the same title and tracks but in different formats for consumption (digital, CD, LP)
  "Q105543609": 42, // musical work/composition – Wikidata metaclass; legal concept of uniquely identifiable piece or work of music, either vocal or instrumental; NOT applicable to recordings, broadcasts, or individual publications of music in printed or digital form or on physical media
  "Q55850593":  43, // music track with vocals – track on a music release that features vocals
};

const searchLimit = 20;
let currentSearchTerm = "";

function performSearch(term, cont) {
  // Expand the search section
  document.getElementById("searchDetails").setAttribute("open", "");
  currentSearchTerm = term;
  const offset = cont ? cont : 0;
  const limit = searchLimit;

  // SPARQL query now only returns item IDs.
  const query = `
    SELECT ?itemId WHERE {
      SERVICE wikibase:mwapi {
        bd:serviceParam wikibase:api "Search" .
        bd:serviceParam wikibase:endpoint "www.wikidata.org" .
        bd:serviceParam mwapi:srsearch "${term}" .
        bd:serviceParam mwapi:srlimit "${limit}" .
        bd:serviceParam mwapi:sroffset "${offset}" .
        ?itemId wikibase:apiOutput mwapi:title .
      }
    }
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query) + "&format=json";
  document.getElementById('searchResults').innerHTML = "<p>Loading search results...</p>";
  
  // First, fetch the list of QIDs from the SPARQL endpoint.
  persistentCachedJSONFetch(url)
    .then(data => {
      const bindings = data.results.bindings;
      if (!bindings || bindings.length === 0) {
        document.getElementById('searchResults').innerHTML = "<p>No results found.</p>";
        return;
      }
      // Extract QIDs from the bindings.
      const qids = bindings.map(binding => binding.itemId.value);
      
      // Now fetch labels/descriptions and claims (for P31) using the Wikidata API.
      return Promise.all([
        fetchWikidataEntities(qids),
        fetchEntitiesClaims(qids)
      ]).then(([entities, claimsData]) => {
        // Build search results with computed priority and P31 claims.
        const searchResults = qids.map(qid => {
          const ent = entities[qid] || {};
          let priority = Infinity;
          const p31 = [];
          if (claimsData[qid] && claimsData[qid].claims && claimsData[qid].claims.P31) {
            claimsData[qid].claims.P31.forEach(claim => {
              if (
                claim.mainsnak &&
                claim.mainsnak.datavalue &&
                claim.mainsnak.datavalue.value &&
                claim.mainsnak.datavalue.value.id
              ) {
                const typeId = claim.mainsnak.datavalue.value.id;
                p31.push(typeId);
                if (creativeTypePriority[typeId] && creativeTypePriority[typeId] < priority) {
                  priority = creativeTypePriority[typeId];
                }
              }
            });
          }
          const isCreative = p31.some(typeId => creativeTypePriority.hasOwnProperty(typeId));
          return {
            id: qid,
            label: ent.label || qid,
            description: ent.description || "",
            priority: priority,
            p31: p31,
            isCreative: isCreative
          };
        });
        // Sort results by priority (lower value comes first)
        searchResults.sort((a, b) => a.priority - b.priority);
        return searchResults;
      });
    })
    .then(searchResults => {
      if (!searchResults) return { searchResults: [], p31Labels: {} };
      // Gather all P31 IDs from search results.
      const allP31IDs = new Set();
      searchResults.forEach(item => {
        item.p31.forEach(pid => allP31IDs.add(pid));
      });
      return (allP31IDs.size > 0 ? fetchWikidataItemLabels(Array.from(allP31IDs)) : Promise.resolve({}))
        .then(p31Labels => {
          return { searchResults, p31Labels };
        });
    })
    .then(({ searchResults, p31Labels }) => {
      if (!searchResults || searchResults.length === 0) return;
      let html = "<ul>";
      searchResults.forEach(item => {
        // Render P31 claims (instance of) concisely.
        let p31Html = "";
        if (item.p31 && item.p31.length > 0) {
          const renderedTypes = item.p31.map(pid => {
            const label = p31Labels[pid] || pid;
            return `<a href="https://www.wikidata.org/wiki/${pid}" target="_blank">${label}</a>`;
          });
          p31Html = " [" + renderedTypes.join(", ") + "]";
        }
        // Bold the item label if it is one of the known creative types.
        const labelHtml = item.isCreative ? `<strong>${item.label}</strong>` : item.label;
        html += `<li class="search-result-item">
                    <span>
                      <a href="index.html?id=${item.id}">${labelHtml} <span class="small-id">(${item.id})</span></a>
                      <span class="extra-link">
                        [<a href="https://sqid.toolforge.org/#/view?id=${item.id}" target="_blank">sqid</a>]
                        [<a href="https://www.wikidata.org/wiki/${item.id}" target="_blank">wikidata</a>]
                      </span>
                      – ${item.description || ""}${p31Html}
                    </span>
                 </li>`;
      });
      html += "</ul>";
      document.getElementById('searchResults').innerHTML = html;
      
      const prevDisabled = offset <= 0 ? "disabled" : "";
      const nextDisabled = searchResults.length < limit ? "disabled" : "";
      const paginationHtml = `<button onclick="performSearch('${term}', ${offset - limit})" ${prevDisabled}>Previous</button>
                              <button onclick="performSearch('${term}', ${offset + limit})" ${nextDisabled}>Next</button>`;
      document.getElementById('paginationControls').innerHTML = paginationHtml;
      
      const start = offset + 1;
      const end = offset + searchResults.length;
      document.getElementById('pageInfo').innerHTML = `<span>Results ${start}–${end}</span>`;
    })
    .catch(error => {
      document.getElementById('searchResults').innerHTML = "<p>Error searching data.</p>";
      console.error("Search error:", error);
    });
}

document.getElementById('searchButton').addEventListener('click', function() {
  performSearch(document.getElementById('searchInput').value.trim(), 0);
});
