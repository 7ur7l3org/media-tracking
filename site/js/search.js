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
  
  const searchLimit = 20;
  let currentSearchTerm = "";
  let searchContinue = 0;
  
  function performSearch(term, cont) {
    // Expand the search section
    document.getElementById("searchDetails").setAttribute("open", "");
    currentSearchTerm = term;
    const continueParam = cont ? cont : 0;
    const url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=" +
                encodeURIComponent(term) + "&language=en&format=json&origin=*&limit=" + searchLimit + "&continue=" + continueParam;
    document.getElementById('searchResults').innerHTML = "<p>Loading search results...</p>";
    persistentCachedJSONFetch(url)
      .then(data => {
        if (!data.search || data.search.length === 0) {
          document.getElementById('searchResults').innerHTML = "<p>No results found.</p>";
          return;
        }
        const ids = data.search.map(item => item.id);
        fetchEntitiesClaims(ids).then(entitiesClaims => {
          const creativeTypePriority = {
            "Q11424": 1,
            "Q202866": 1,
            "Q506240": 1,
            "Q5398426": 2,
            "Q7725634": 3,
            "Q482994": 4,
            "Q105543609": 4,
            "Q58483083": 4,
            "Q55850593": 4,
            "Q24856": 4
          };
  
          data.search.forEach(item => {
            let priority = Infinity;
            if (entitiesClaims[item.id] &&
                entitiesClaims[item.id].claims &&
                entitiesClaims[item.id].claims.P31) {
              const claims = entitiesClaims[item.id].claims.P31;
              claims.forEach(claim => {
                if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value && claim.mainsnak.datavalue.value.id) {
                  const typeId = claim.mainsnak.datavalue.value.id;
                  if (creativeTypePriority[typeId] && creativeTypePriority[typeId] < priority) {
                    priority = creativeTypePriority[typeId];
                  }
                }
              });
            }
            item.priority = priority;
          });
  
          data.search.sort((a, b) => a.priority - b.priority);
  
          let html = "<ul>";
          data.search.forEach(item => {
            const wrapWithStrong = item.priority <= 2;
            let line;
            if (wrapWithStrong) {
              line = `<li class="search-result-item"><strong><span>
                         <a href="index.html?id=${item.id}">${item.label} <span class="small-id">(${item.id})</span></a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${item.id}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${item.id}" target="_blank">wikidata</a>]</span>
                         – ${item.description || ""}
                       </span></strong></li>`;
            } else {
              line = `<li class="search-result-item">
                         <span>
                           <a href="index.html?id=${item.id}">${item.label} <span class="small-id">(${item.id})</span></a> <span class="extra-link">[<a href="https://sqid.toolforge.org/#/view?id=${item.id}" target="_blank">sqid</a>] [<a href="https://www.wikidata.org/wiki/${item.id}" target="_blank">wikidata</a>]</span>
                           – ${item.description || ""}
                         </span>
                       </li>`;
            }
            html += line;
          });
          html += "</ul>";
          document.getElementById('searchResults').innerHTML = html;
  
          let prevDisabled = (continueParam <= 0) ? "disabled" : "";
          let nextDisabled = (data.search.length < searchLimit) ? "disabled" : "";
          let paginationHtml = `<button onclick="performSearch('${term}', ${Number(continueParam) - searchLimit})" ${prevDisabled}>Previous</button>`;
          paginationHtml += `<button onclick="performSearch('${term}', ${Number(continueParam) + searchLimit})" ${nextDisabled}>Next</button>`;
          document.getElementById('paginationControls').innerHTML = paginationHtml;
          
          let start = Number(continueParam) + 1;
          let end = Number(continueParam) + data.search.length;
          document.getElementById('pageInfo').innerHTML = `<span>Results ${start}–${end}</span>`;
        });
      })
      .catch(error => {
        document.getElementById('searchResults').innerHTML = "<p>Error searching data.</p>";
        console.error("Search error:", error);
      });
  }
  
  document.getElementById('searchButton').addEventListener('click', function() {
    performSearch(document.getElementById('searchInput').value.trim(), 0);
  });
  