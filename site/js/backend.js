/* js/backend.js */

/**
 * Loads the backend JSON data.
 * This version does not fall back to a static file.
 * If a GitHub token is present, it attempts to load the data from the user’s Git repo clone.
 * Otherwise, it logs an error and returns an empty object.
 */
let backendData = null;

function loadBackendData() {
  if (backendData !== null) {
    return Promise.resolve(backendData);
  }
  
  const token = getToken(); // from auth.js
  if (token) {
    // Pseudocode: use gitSync functions to fetch the backend file from the repo clone.
    console.log("Loading backend data from Git repo...");
    return gitSync.cloneRepo()
      .then(() => {
        // Pseudocode: read the file from the LightningFS-based repo.
        // Replace the following line with your actual file read from the repo.
        return persistentCachedJSONFetch("backend.json");
      })
      .then(data => {
        backendData = data;
        return backendData;
      })
      .catch(error => {
        console.error("Error loading backend data from repo:", error);
        backendData = {};
        return backendData;
      });
  } else {
    // No token provided; do not fall back to static file.
    console.error("No GitHub token provided. Please log in to load backend data.");
    backendData = {};
    return Promise.resolve(backendData);
  }
}

/**
 * Returns the HTML for consumptions and queue votes for the given QID.
 * Always renders both tables even if empty.
 * (Meta title and description are removed here to avoid duplication with infoDisplay.)
 */
function renderBackendDetails(qid) {
  // Construct the key for wikidata-based entities.
  const key = "http://www.wikidata.org/entity/" + qid;
  const data = backendData[key] || { meta: {}, consumptions: [], "queue-votes": {} };
  let html = "<div id='backendDetails'>";

  // Render Consumptions table.
  html += `<table class="backend-table consumptions-table">
              <thead>
                <tr>
                  <th>Consumptions</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>`;
  if (data.consumptions && data.consumptions.length > 0) {
    data.consumptions.forEach(consumption => {
      // Format the date to include the time zone.
      const when = new Date(consumption.when).toLocaleString('en-US', { timeZoneName: 'short' });
      html += `<tr>
                 <td class="consumption-date-cell">${when}</td>
                 <td>${consumption.note}</td>
               </tr>`;
    });
  } else {
    html += `<tr><td colspan="2"><em>No consumptions recorded.</em></td></tr>`;
  }
  html += "</tbody></table>";

  // Render Queue Votes table.
  html += `<table class="backend-table">
              <thead>
                <tr>
                  <th>Queue Votes</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>`;
  const queueVotes = data["queue-votes"];
  if (queueVotes && Object.keys(queueVotes).length > 0) {
    // For each queue category, render a group header and then its rows.
    Object.keys(queueVotes).forEach(category => {
      // Group header row spanning both columns.
      html += `<tr>
                 <td colspan="2" style="background-color: #eaeaea; font-weight: bold;">${category}</td>
               </tr>`;
      if (queueVotes[category].length > 0) {
        queueVotes[category].forEach(vote => {
          const when = new Date(vote.when).toLocaleString('en-US', { timeZoneName: 'short' });
          html += `<tr class="queue-vote-row">
                     <td>${when}</td>
                     <td>${vote.note}</td>
                   </tr>`;
        });
      } else {
        html += `<tr><td colspan="2"><em>No votes recorded in this category.</em></td></tr>`;
      }
    });
  } else {
    html += `<tr><td colspan="2"><em>No queue votes recorded.</em></td></tr>`;
  }
  html += "</tbody></table>";

  html += "</div>";
  return html;
}
