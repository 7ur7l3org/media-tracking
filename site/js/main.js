/* js/main.js */

window.addEventListener('popstate', function(event) {
  const params = new URLSearchParams(window.location.search);
  if (params.has("id")) {
    const qid = params.get("id");
    fetchEntity(qid, false);
  } else if (params.has("q")) {
    const term = params.get("q");
    performSearch(term, 0);
  } else {
    document.getElementById('infoDisplay').innerHTML = "";
  }
});

window.addEventListener('load', function() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("id")) {
    document.getElementById("searchDetails").setAttribute("open", "");
  } else {
    document.getElementById("searchDetails").removeAttribute("open");
  }
  if (params.has("q")) {
    const term = params.get("q");
    document.getElementById('searchInput').value = term;
    performSearch(term, 0);
  }
  if (params.has("id")) {
    const qid = params.get("id");
    fetchEntity(qid, false);
  }
});
