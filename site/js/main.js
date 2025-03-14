/* js/main.js */

window.addEventListener('DOMContentLoaded', () => {
  // Trigger a full sync on page load.
  if (window.gitSync && typeof window.gitSync.syncRepo === 'function') {
    window.gitSync.syncRepo().catch(error => {
      console.error("Sync failed:", error);
    });
  } else {
    console.error("gitSync.syncRepo is not available.");
  }
});

// Listen for history changes.
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

// Listen for backend updates to refresh the current entity view (if any)
document.addEventListener("backendUpdated", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.has("id")) {
    const qid = params.get("id");
    // Refresh the entity view using the latest data.
    fetchEntity(qid, false);
  }
});
