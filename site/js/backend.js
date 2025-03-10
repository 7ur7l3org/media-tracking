/* js/backend.js */

/**
 * Loads the backend JSON data from the Git repo cloned into LightningFS.
 * The file used is "ueue-media-tracking.json" located at the root of the repo.
 * If the file does not exist, it is created with an empty JSON object.
 */
let backendData = null;

async function loadBackendData() {
  // Ensure that the repo is cloned or updated.
  await gitSync.cloneRepo();
  const filePath = gitSync.repoDir + '/ueue-media-tracking.json';
  try {
    const fileContent = await gitSync.pfs.readFile(filePath, 'utf8');
    backendData = JSON.parse(fileContent);
  } catch (err) {
    console.warn("ueue-media-tracking.json not found – initializing new file.");
    backendData = {};
    // Ensure the repo directory exists
    try {
      await gitSync.pfs.mkdir(gitSync.repoDir);
    } catch (e) {
      // Ignore if already exists
    }
    await gitSync.pfs.writeFile(filePath, JSON.stringify(backendData, null, 2), 'utf8');
  }
  return backendData;
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
