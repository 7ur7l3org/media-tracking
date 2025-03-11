/* js/backend.js */

/**
 * Loads the backend JSON data from the Git repo cloned into LightningFS.
 * The file used is "ueue-media-tracking.json" located at the root of the repo.
 * We now expect a structure with "media" and "meta" keys.
 * This version does not wait for the Git clone/fetch operation, so Wikidata fetches
 * can start immediately. If the file does not exist, it is created with the default structure,
 * and a commit/push is triggered asynchronously.
 */
let backendData = null;

async function loadBackendData() {
  const filePath = gitSync.repoDir + '/ueue-media-tracking.json';
  try {
    const fileContent = await gitSync.pfs.readFile(filePath, 'utf8');
    backendData = JSON.parse(fileContent);
  } catch (err) {
    console.warn("ueue-media-tracking.json not found – initializing new file.");
    // Initialize with the new structure.
    backendData = {
      media: {},
      meta: {
        queues: []
      }
    };
    try {
      await gitSync.pfs.mkdir(gitSync.repoDir);
    } catch (e) {
      // Ignore if it already exists.
    }
    await gitSync.pfs.writeFile(filePath, JSON.stringify(backendData, null, 2), 'utf8');
    gitSync.commitChanges("Initial commit: Created ueue-media-tracking.json")
      .then(() => gitSync.pushSync())
      .catch(e => console.error("Error during initial commit/push:", e));
  }
  return backendData;
}

/**
 * Saves the current backendData to the JSON file.
 */
async function saveBackendData() {
  const filePath = gitSync.repoDir + '/ueue-media-tracking.json';
  await gitSync.pfs.writeFile(filePath, JSON.stringify(backendData, null, 2), 'utf8');
}

/**
 * Ensures that the media entry for the given QID exists.
 */
function ensureMediaEntry(qid) {
  if (!backendData) {
    backendData = { media: {}, meta: { queues: [] } };
  }
  if (!backendData.media) {
    backendData.media = {};
  }
  const key = "http://www.wikidata.org/entity/" + qid;
  if (!backendData.media[key]) {
    backendData.media[key] = {
      meta: {},
      notes: "",
      consumptions: [],
      "queue-votes": {}
    };
  }
  return key;
}

/**
 * Sanitizes the media record for the given QID.
 * If an entity is provided, updates the meta title and description.
 * Also removes any empty queues from the "queue-votes" map.
 */
function sanitizeMediaRecord(qid, entity) {
  const key = "http://www.wikidata.org/entity/" + qid;
  if (!backendData.media || !backendData.media[key]) return;
  const record = backendData.media[key];
  if (entity) {
    record.meta.title = (entity.labels && entity.labels.en) ? entity.labels.en.value : qid;
    record.meta.description = (entity.descriptions && entity.descriptions.en) ? entity.descriptions.en.value : "";
  }
  for (const queue in record["queue-votes"]) {
    if (record["queue-votes"][queue].length === 0) {
      delete record["queue-votes"][queue];
    }
  }
}

/**
 * Adds a new consumption entry for the given QID.
 */
async function addNewConsumption(qid, note) {
  const key = ensureMediaEntry(qid);
  backendData.media[key].consumptions.push({
    when: new Date().toISOString(),
    note: note || "",
    rating: null
  });
  sanitizeMediaRecord(qid);
  await saveBackendData();
  await gitSync.commitChanges("Added new consumption for " + qid);
  await gitSync.pushSync();
}

/**
 * Removes a consumption entry (by index) for the given QID.
 */
async function removeConsumption(qid, index) {
  const key = "http://www.wikidata.org/entity/" + qid;
  if (backendData.media && backendData.media[key] && backendData.media[key].consumptions) {
    backendData.media[key].consumptions.splice(index, 1);
    sanitizeMediaRecord(qid);
    await saveBackendData();
    await gitSync.commitChanges("Removed consumption #" + index + " for " + qid);
    await gitSync.pushSync();
  }
}

/**
 * Adds a new queue vote for the given QID into the specified queue.
 */
async function addNewQueueVote(qid, queueName, note) {
  const key = ensureMediaEntry(qid);
  if (!backendData.media[key]["queue-votes"][queueName]) {
    backendData.media[key]["queue-votes"][queueName] = [];
  }
  backendData.media[key]["queue-votes"][queueName].push({
    when: new Date().toISOString(),
    note: note || ""
  });
  sanitizeMediaRecord(qid);
  await saveBackendData();
  await gitSync.commitChanges("Added new queue vote (" + queueName + ") for " + qid);
  await gitSync.pushSync();
}

/**
 * Removes a queue vote entry for the given QID.
 * If the resulting queue becomes empty, it is removed.
 */
async function removeQueueVote(qid, queueName, index) {
  const key = "http://www.wikidata.org/entity/" + qid;
  if (
    backendData.media &&
    backendData.media[key] &&
    backendData.media[key]["queue-votes"] &&
    backendData.media[key]["queue-votes"][queueName]
  ) {
    backendData.media[key]["queue-votes"][queueName].splice(index, 1);
    sanitizeMediaRecord(qid);
    await saveBackendData();
    await gitSync.commitChanges("Removed queue vote #" + index + " from (" + queueName + ") for " + qid);
    await gitSync.pushSync();
  }
}

/**
 * Adds a new named queue to the global meta.queues.
 */
async function addNewQueue(queueName) {
  if (!queueName.trim()) return;
  if (!backendData.meta) {
    backendData.meta = { queues: [] };
  }
  if (!backendData.meta.queues.includes(queueName)) {
    backendData.meta.queues.push(queueName);
    await saveBackendData();
    await gitSync.commitChanges("Added new queue: " + queueName);
    await gitSync.pushSync();
  }
}

/**
 * Renders the backend details for the given QID.
 * The "Add new consumption" form and the "Add new queue vote" form are each rendered in a single-row div.
 */
function renderBackendDetails(qid) {
  const key = "http://www.wikidata.org/entity/" + qid;
  const data = (backendData.media && backendData.media[key])
    ? backendData.media[key]
    : { meta: {}, consumptions: [], "queue-votes": {} };
  let html = "<div id='backendDetails'>";

  // Consumptions Table
  html += `<table class="backend-table consumptions-table">
              <thead>
                <tr>
                  <th>Consumptions</th>
                  <th>Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>`;
  if (data.consumptions && data.consumptions.length > 0) {
    data.consumptions.forEach((consumption, idx) => {
      const when = new Date(consumption.when).toLocaleString('en-US', { timeZoneName: 'short' });
      html += `<tr class="consumptionRow">
                 <td class="consumption-date-cell">${when}</td>
                 <td>${consumption.note}</td>
                 <td><button class="deleteConsumptionBtn" data-index="${idx}">Delete</button></td>
               </tr>`;
    });
  } else {
    html += `<tr class="consumptionRow"><td colspan="3"><em>No consumptions recorded.</em></td></tr>`;
  }
  html += `<tr class="addConsumptionRow">
             <td colspan="3">
               <div style="padding:5px; border:1px solid #ddd;">
                 <strong>Add new consumption:</strong><br>
                 <input type="text" id="newConsumptionInput" placeholder="Enter note">
                 <button id="addConsumptionBtn">Add Consumption</button>
               </div>
             </td>
           </tr>`;
  html += "</tbody></table>";

  // Queue Votes Table
  html += `<table class="backend-table">
              <thead>
                <tr>
                  <th>Queue Votes</th>
                  <th>Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>`;
  const qVotes = data["queue-votes"];
  if (qVotes && Object.keys(qVotes).length > 0) {
    Object.keys(qVotes).forEach(queueName => {
      html += `<tr class="queueHeaderRow">
                 <td colspan="3" style="background-color: #eaeaea; font-weight: bold;">${queueName}</td>
               </tr>`;
      if (qVotes[queueName].length > 0) {
        qVotes[queueName].forEach((vote, idx) => {
          const when = new Date(vote.when).toLocaleString('en-US', { timeZoneName: 'short' });
          html += `<tr class="queueVoteRow">
                     <td>${when}</td>
                     <td>${vote.note}</td>
                     <td><button class="deleteQueueVoteBtn" data-queue="${queueName}" data-index="${idx}">Delete</button></td>
                   </tr>`;
        });
      } else {
        html += `<tr class="queueVoteRow"><td colspan="3"><em>No votes recorded in this queue.</em></td></tr>`;
      }
    });
  } else {
    html += `<tr class="queueVoteRow"><td colspan="3"><em>No queue votes recorded.</em></td></tr>`;
  }
  let queueOptions = "";
  if (backendData.meta && Array.isArray(backendData.meta.queues)) {
    backendData.meta.queues.forEach(qName => {
      queueOptions += `<option value="${qName}">${qName}</option>`;
    });
  }
  queueOptions += `<option value="new">-- new queue --</option>`;
  html += `<tr class="addQueueVoteRow">
             <td colspan="3">
               <div style="margin-top:5px; border:1px solid #ddd; padding:5px;">
                 <strong>Add new queue vote:</strong><br>
                 <label for="newQueueSelector">Queue:</label>
                 <select id="newQueueSelector">
                   ${queueOptions}
                 </select>
                 <span id="newQueueNameContainer" style="display:none;">
                   <input type="text" id="newQueueName" placeholder="Enter new queue name">
                   <button id="addNewQueueBtn">Add Queue</button>
                 </span><br>
                 <label for="newQueueNote">Note:</label>
                 <input type="text" id="newQueueNote" placeholder="">
                 <button id="addQueueVoteBtn">Add Vote</button>
               </div>
             </td>
           </tr>`;
  html += "</tbody></table>";

  html += "</div>";
  return html;
}

/**
 * Attaches event handlers to the "Add" and "Delete" buttons in the backend details section.
 * For each operation, a pending status row or update is inserted before refreshing the full view.
 */
function attachAddEntryHandlers(qid) {
  // Add consumption handler.
  const consumptionBtn = document.getElementById("addConsumptionBtn");
  if (consumptionBtn) {
    consumptionBtn.addEventListener("click", async function() {
      const note = document.getElementById("newConsumptionInput").value.trim();
      const tbody = document.querySelector(".consumptions-table tbody");
      const addRow = document.querySelector(".addConsumptionRow");
      const pendingRow = document.createElement("tr");
      pendingRow.innerHTML = `<td colspan="3"><em>New consumption: committing...</em></td>`;
      tbody.insertBefore(pendingRow, addRow);
      try {
        await addNewConsumption(qid, note);
        pendingRow.innerHTML = `<td colspan="3"><em>New consumption: pushing...</em></td>`;
        updateGitSyncStatus("New consumption added and synced.");
        window.refreshEntity(qid);
      } catch (e) {
        console.error(e);
        pendingRow.innerHTML = `<td colspan="3"><em>Error adding consumption.</em></td>`;
        updateGitSyncStatus("Error adding consumption: " + e.message, true);
      }
    });
  }

  // Delete consumption handler.
  document.querySelectorAll(".deleteConsumptionBtn").forEach(btn => {
    btn.addEventListener("click", async function() {
      const index = parseInt(this.getAttribute("data-index"), 10);
      const row = this.closest("tr");
      row.innerHTML = `<td colspan="3"><em>Removing consumption: committing...</em></td>`;
      try {
        await removeConsumption(qid, index);
        row.innerHTML = `<td colspan="3"><em>Removing consumption: pushing...</em></td>`;
        updateGitSyncStatus("Consumption removed and synced.");
        window.refreshEntity(qid);
      } catch (e) {
        console.error(e);
        row.innerHTML = `<td colspan="3"><em>Error removing consumption.</em></td>`;
        updateGitSyncStatus("Error removing consumption: " + e.message, true);
      }
    });
  });

  // Queue Vote Form handlers.
  const queueSelector = document.getElementById("newQueueSelector");
  if (queueSelector) {
    queueSelector.addEventListener("change", function() {
      if (this.value === "new") {
        document.getElementById("newQueueNameContainer").style.display = "inline";
      } else {
        document.getElementById("newQueueNameContainer").style.display = "none";
      }
    });
  }
  const newQueueBtn = document.getElementById("addNewQueueBtn");
  if (newQueueBtn) {
    newQueueBtn.addEventListener("click", async function() {
      const newQueueName = document.getElementById("newQueueName").value.trim();
      if (!newQueueName) {
        updateGitSyncStatus("Please enter a new queue name.", true);
        return;
      }
      updateGitSyncStatus("Adding new queue...");
      try {
        await addNewQueue(newQueueName);
        updateGitSyncStatus("New queue added.");
        document.getElementById("newQueueSelector").value = newQueueName;
        document.getElementById("newQueueName").value = "";
        document.getElementById("newQueueNameContainer").style.display = "none";
        window.refreshEntity(qid);
      } catch (e) {
        console.error(e);
        updateGitSyncStatus("Error adding new queue: " + e.message, true);
      }
    });
  }
  const queueVoteBtn = document.getElementById("addQueueVoteBtn");
  if (queueVoteBtn) {
console.log("how am i getting called twice")
    queueVoteBtn.addEventListener("click", async function() {
      const selectedQueue = document.getElementById("newQueueSelector").value;
      if (selectedQueue === "new") {
        updateGitSyncStatus("Please add the new queue first.", true);
        return;
      }
      const note = document.getElementById("newQueueNote").value.trim();
      const tbody = document.querySelector(".backend-table:nth-of-type(2) tbody");
      const addRow = document.querySelector(".addQueueVoteRow");
      const pendingRow = document.createElement("tr");
      pendingRow.innerHTML = `<td colspan="3"><em>New queue vote: committing...</em></td>`;
      tbody.insertBefore(pendingRow, addRow);
      try {
        await addNewQueueVote(qid, selectedQueue, note);
        pendingRow.innerHTML = `<td colspan="3"><em>New queue vote: pushing...</em></td>`;
        updateGitSyncStatus("New queue vote added and synced.");
        window.refreshEntity(qid);
      } catch (e) {
        console.error(e);
        pendingRow.innerHTML = `<td colspan="3"><em>Error adding queue vote.</em></td>`;
        updateGitSyncStatus("Error adding queue vote: " + e.message, true);
      }
    });
  }
  // Delete queue vote handler.
  document.querySelectorAll(".deleteQueueVoteBtn").forEach(btn => {
    btn.addEventListener("click", async function() {
      const queueName = this.getAttribute("data-queue");
      const index = parseInt(this.getAttribute("data-index"), 10);
      const row = this.closest("tr");
      row.innerHTML = `<td colspan="3"><em>Removing queue vote: committing...</em></td>`;
      try {
        await removeQueueVote(qid, queueName, index);
        row.innerHTML = `<td colspan="3"><em>Removing queue vote: pushing...</em></td>`;
        updateGitSyncStatus("Queue vote removed and synced.");
        window.refreshEntity(qid);
      } catch (e) {
        console.error(e);
        row.innerHTML = `<td colspan="3"><em>Error removing queue vote.</em></td>`;
        updateGitSyncStatus("Error removing queue vote: " + e.message, true);
      }
    });
  });
}

/**
 * Refreshes the full entity view using the globally stored Wikidata entity,
 * then attaches the add‑entry event handlers.
 */
function refreshEntity(qid) {
  if (window.currentEntity) {
    renderEntity(window.currentEntity, qid, false);
  } else {
    fetchEntity(qid, false);
  }
}

window.refreshEntity = refreshEntity;

/**
 * Alias for refreshEntity.
 */
function refreshBackendSection(qid) {
  refreshEntity(qid);
}

window.backendModule = {
  renderBackendDetails,
  attachAddEntryHandlers,
  refreshBackendSection
};
