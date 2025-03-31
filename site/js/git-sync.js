/* js/git-sync.js */

/**
 * Git Sync Module using isomorphic-git and LightningFS.
 *
 * Unified sync flow (syncRepo) now does:
 *   1. Commits any uncommitted changes.
 *   2. Calls cloneOrFetchUpdates() to ensure the repo is present and updated.
 *      This function returns true if the working tree was updated.
 *   3. Always resets local HEAD to match origin/mistress using updateLocalToOriginMistressIfPossible().
 *      This function also returns true if the working tree was updated.
 *   4. If either update occurred, syncRepo dispatches a single "backendUpdated" event.
 *   5. Calls pushOrDivergeAndPush() to push local changes.
 *   6. Updates the branch indicator.
 *
 * All log messages include the function name for easier tracing.
 *
 * Ensure that your HTML loads LightningFS, isomorphic-git, and its HTTP helper before this file.
 */

// ----- Initialization -----
const fs = new LightningFS('repoFS'); // Ensure LightningFS is loaded before this file.
const pfs = fs.promises;
const repoDir = '/repo';
const gitOperationsLog = [];
let clonePromise = null;

// ----- Logging Helpers -----
async function getCurrentBranchAndCommit() {
  let branch = await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false });
  if (!branch) branch = "unknown";
  let commit = await git.resolveRef({ fs: pfs, dir: repoDir, ref: "HEAD" });
  commit = commit.slice(0, 7);
  return `${branch} ${commit}`;
}

async function logGitOperation(message) {
  try {
    const info = await getCurrentBranchAndCommit();
    const timestamp = new Date().toLocaleTimeString();
    const fullMessage = `[${timestamp} ${info}] ${message}`;
    gitOperationsLog.push(fullMessage);
    updateGitLogDisplay();
  } catch (e) {
    const timestamp = new Date().toLocaleTimeString();
    const fullMessage = `[${timestamp}] ${message}`;
    gitOperationsLog.push(fullMessage);
    updateGitLogDisplay();
  }
}

function updateGitLogDisplay() {
  const logElem = document.getElementById("gitLogContent");
  if (logElem) {
    logElem.textContent = gitOperationsLog.join("\n");
  }
}

function updateGitSyncStatus(message, isError = false, color = null) {
  const statusElem = document.getElementById("gitSyncStatus");
  if (statusElem) {
    statusElem.innerHTML = message;
    // Remove previous status classes
    statusElem.classList.remove("error", "warning", "success");
    // Determine new class based on provided color or error flag.
    if (color === "green" || (!color && !isError)) {
      statusElem.classList.add("success");
    } else if (color === "red" || isError) {
      statusElem.classList.add("error");
    } else {
      statusElem.classList.add("warning");
    }
  }
  console.log("GitSyncStatus:", message);
  logGitOperation(message);
}

function setSyncFailedHeader() {
  const header = document.querySelector("header.site-header");
  if (header && !document.getElementById("syncFailureIndicator")) {
    const indicator = document.createElement("span");
    indicator.id = "syncFailureIndicator";
    indicator.textContent = " SYNC FAILED! LOCAL ONLY!";
    indicator.classList.add("sync-failure-indicator");
    header.appendChild(indicator);
    updateGitSyncStatus("setSyncFailedHeader: Added failure indicator.");
  }
}

// ----- Repo URL Helper -----
function parseRepoURL(repoURL) {
  const urlObj = new URL(repoURL);
  const parts = urlObj.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error("Invalid repo URL");
  return { owner: parts[0], repo: parts[1] };
}

// ----- Sync Logic Functions -----

/**
 * cloneOrFetchUpdates:
 * If the repo exists in IndexedDB, fetch updates from the remote.
 * Otherwise, clone the repo.
 * After fetching, it calls updateLocalWorkingTreeFromRemote() to update the working tree if remote is ahead.
 * Returns true if an update occurred.
 */
async function cloneOrFetchUpdates() {
  if (clonePromise) return clonePromise;
  clonePromise = (async () => {
    let updated = false;
    const login = await getLogin();
    if (!login || !login.token) {
      updateGitSyncStatus("cloneOrFetchUpdates: Error: Please log in with your GitHub token first.", true);
      return false;
    }
    const token = login.token;
    if (!login.repo) {
      updateGitSyncStatus("cloneOrFetchUpdates: Error: Repository URL not found in login info.", true);
      return false;
    }
    const repoUrl = login.repo;
    const authObj = { username: "x-access-token", password: token, oauth2format: "github" };

    try {
      await pfs.readdir(repoDir);
      updateGitSyncStatus("local repo exists – fetching updates...");
      await git.fetch({
        fs: pfs,
        http,
        dir: repoDir,
        onAuth: () => authObj,
        corsProxy: login.corsProxy,
      });
      updateGitSyncStatus("repo fetched successfully");
      // After fetching, update the working tree if remote is ahead.
      updated = await updateLocalWorkingTreeFromRemote();
    } catch (err) {
      updateGitSyncStatus("cloning repo...");
      try {
        await git.clone({
          fs: pfs,
          http,
          dir: repoDir,
          url: repoUrl,
          singleBranch: true,
          depth: 1,
          onAuth: () => authObj,
          corsProxy: login.corsProxy,
        });
        updateGitSyncStatus("repo cloned successfully");
        updated = true; // Fresh clone implies new data.
      } catch (cloneErr) {
        console.error("cloneOrFetchUpdates: Error cloning repo:", cloneErr);
        updateGitSyncStatus("cloneOrFetchUpdates: Error cloning repo: " + cloneErr.message, true);
      }
    }
    return updated;
  })();
  return clonePromise;
}

/**
 * updateLocalWorkingTreeFromRemote:
 * For the current branch (not "mistress"), checks if the remote (origin/<branch>) is ahead.
 * If local HEAD is an ancestor of the remote, then force-reset the branch.
 * Returns true if the working tree was updated, false otherwise.
 */
async function updateLocalWorkingTreeFromRemote() {
  let branch = await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false });
  if (!branch) return false;
  let localHead = await git.resolveRef({ fs: pfs, dir: repoDir, ref: branch });
  let remoteHead;
  try {
    remoteHead = await git.resolveRef({ fs: pfs, dir: repoDir, ref: `origin/${branch}` });
  } catch (e) {
    remoteHead = null;
  }
  if (!remoteHead) return false;
  if (localHead === remoteHead) {
    updateGitSyncStatus(`local ${branch} already matches fetched origin/${branch}`);
    return false;
  }
  const logRemote = await git.log({ fs: pfs, dir: repoDir, ref: `origin/${branch}`, depth: 100 });
  const isAncestor = logRemote.some(commit => commit.oid === localHead);
  if (isAncestor) {
    updateGitSyncStatus(`local ${branch} is an ancestor of fetched origin/${branch}; updating local branch`);
    await git.deleteRef({ fs: pfs, dir: repoDir, ref: `refs/heads/${branch}` }).catch(() => {});
    await git.writeRef({ fs: pfs, dir: repoDir, ref: `refs/heads/${branch}`, value: remoteHead, overwrite: true });
    await git.checkout({ fs: pfs, dir: repoDir, ref: branch, force: true });
    updateGitSyncStatus(`local branch reset: ${branch} updated from ${localHead.slice(0,7)} to ${remoteHead.slice(0,7)}.`);
    
    return true;
  } else {
    updateGitSyncStatus(`local HEAD (${localHead.slice(0,7)}) has extra commits`);
    return false;
  }
}

async function deleteUndivergedSessionBranch(branchName) {
  // First, delete the remote branch via GitHub API.
  const login = await getLogin();
  if (!login || !login.token || !login.repo) {
    updateGitSyncStatus("Missing login info for deleting branch.", true);
    return;
  }
  
  // Extract owner and repo from the repo URL.
  const repoUrl = new URL(login.repo);
  const [owner, repo] = repoUrl.pathname.split('/').filter(Boolean);
  if (!owner || !repo) {
    updateGitSyncStatus("Invalid repo URL in login info for deleting remote branch.", true);
    return;
  }
  
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`;
  
  try {
    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `token ${login.token}`,
        "Accept": "application/vnd.github.v3+json"
      }
    });
    
    if (response.ok) {
      updateGitSyncStatus(`Deleted remote branch ${branchName} via GitHub API.`);
    } else {
      const errorData = await response.json();
      updateGitSyncStatus(`Error deleting remote branch ${branchName} via API: ${response.status} ${errorData.message}`, true);
      return;
    }
  } catch (err) {
    updateGitSyncStatus(`Error deleting remote branch ${branchName} via API: ${err.message}`, true);
    return;
  }
  
  // Now, delete the branch locally.
  try {
    await git.deleteBranch({ fs: pfs, dir: repoDir, ref: branchName });
    updateGitSyncStatus(`Deleted local branch ${branchName}.`);
  } catch (err) {
    updateGitSyncStatus(`Error deleting local branch ${branchName}: ${err.message}`, true);
  }
}


/**
 * updateLocalToOriginMistressIfPossible:
 * Compares local HEAD to origin/mistress and, if local HEAD is an ancestor,
 * force-resets the working tree to match origin/mistress.
 * If the current branch was not "mistress", deletes that branch (and attempts to push the deletion),
 * then checks out "mistress".
 * Returns true if the working tree was updated, false otherwise.
 */
async function updateLocalToOriginMistressIfPossible() {
  try {
    const fetchedOriginMistress = await git.resolveRef({ fs: pfs, dir: repoDir, ref: "origin/mistress" });
    const localHead = await git.resolveRef({ fs: pfs, dir: repoDir, ref: "HEAD" });
    if (localHead === fetchedOriginMistress) {
      return false;
    }
    updateGitSyncStatus(`comparing local HEAD (${localHead.slice(0,7)}) to fetched origin/mistress (${fetchedOriginMistress.slice(0,7)})`);
    const logRemote = await git.log({ fs: pfs, dir: repoDir, ref: "origin/mistress", depth: 100 });
    const isAncestor = logRemote.some(commit => commit.oid === localHead);
    if (isAncestor) {
      updateGitSyncStatus("local HEAD is an ancestor of fetched origin/mistress; updating local clone to origin/mistress");
      await git.deleteRef({ fs: pfs, dir: repoDir, ref: "refs/heads/mistress" }).catch(() => {});
      await git.writeRef({ fs: pfs, dir: repoDir, ref: "refs/heads/mistress", value: fetchedOriginMistress, overwrite: true });

      // If we were not already on "mistress", delete that branch and push the deletion.
      let currentBranch = await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false });
      if (currentBranch !== "mistress") {
        updateGitSyncStatus("deleting undiverged branch " + currentBranch);
        await deleteUndivergedSessionBranch(currentBranch)
      }
      
      await git.checkout({ fs: pfs, dir: repoDir, ref: "mistress", force: true });
      updateGitSyncStatus(`local clone reset: HEAD updated from ${localHead.slice(0,7)} to ${fetchedOriginMistress.slice(0,7)}.`);

      return true;
    } else {
      updateGitSyncStatus(`local HEAD (${localHead.slice(0,7)}) has extra commits`);
      return false;
    }
  } catch (e) {
    console.error("updateLocalToOriginMistressIfPossible: Error:", e);
    return false;
  }
}

/**
 * pushOrDivergeAndPush:
 * Attempts to push the current branch.
 * If local HEAD already matches the remote, it skips pushing.
 * Otherwise, it pushes; if push fails due to non-fast-forward,
 * it creates a session branch and pushes that.
 */
async function pushOrDivergeAndPush() {
  const login = await getLogin();
  if (!login || !login.token) {
    updateGitSyncStatus("pushOrDivergeAndPush: Error: Please log in with your GitHub token first.", true);
    return;
  }
  if (!login.repo) {
    updateGitSyncStatus("pushOrDivergeAndPush: Error: Repository URL not found in login info.", true);
    return;
  }
  const token = login.token;
  const authObj = { username: "x-access-token", password: token, oauth2format: "github" };
  let branch = await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false });
  if (!branch) branch = "mistress";

  try {
    const localHead = await git.resolveRef({ fs: pfs, dir: repoDir, ref: branch });
    let remoteHead;
    try {
      remoteHead = await git.resolveRef({ fs: pfs, dir: repoDir, ref: `origin/${branch}` });
    } catch (e) {
      remoteHead = null;
    }
    if (remoteHead === localHead) {
      updateGitSyncStatus("remote already updated (skipping push)", false, "green");
      return;
    }
  } catch (e) {
    console.error("pushOrDivergeAndPush: Error checking push state:", e);
  }

  try {
    updateGitSyncStatus("pushing changes to GitHub...");
    await git.push({
      fs: pfs,
      http,
      dir: repoDir,
      ref: branch,
      onAuth: () => authObj,
      corsProxy: login.corsProxy,
    });
    updateGitSyncStatus("push complete.", false, "green");
  } catch (err) {
    console.error("pushOrDivergeAndPush: Error pushing changes:", err);
    if (err.message && err.message.includes("not a simple fast-forward")) {
      updateGitSyncStatus("pushOrDivergeAndPush: Push rejected due to non-fast-forward. Creating session branch...", true);
      const sessionBranch = `${branch}-session-${Date.now()}`;
      updateGitSyncStatus("pushOrDivergeAndPush: Creating and switching to branch: " + sessionBranch, true);
      try {
        await git.branch({ fs: pfs, dir: repoDir, ref: sessionBranch, checkout: true });
        updateGitSyncStatus("pushOrDivergeAndPush: Switched to branch: " + sessionBranch, true);
        await git.push({
          fs: pfs,
          http,
          dir: repoDir,
          ref: sessionBranch,
          remoteRef: sessionBranch,
          setUpstream: true,
          onAuth: () => authObj,
          corsProxy: login.corsProxy,
        });
        updateGitSyncStatus("pushOrDivergeAndPush: Sync complete: diverged changes are now pushed to branch " + sessionBranch + ".", false, "orange");
        getOrCreatePRForBranch(sessionBranch);
      } catch (sessionErr) {
        console.error("pushOrDivergeAndPush: Error creating session branch:", sessionErr);
        updateGitSyncStatus("pushOrDivergeAndPush: Error during session branch creation: " + sessionErr.message + ". SYNC FAILED! LOCAL ONLY!", true);
        setSyncFailedHeader();
      }
    } else {
      updateGitSyncStatus("pushOrDivergeAndPush: Error pushing changes: " + err.message, true);
    }
  }
}

/**
 * commitChanges:
 * Checks for changes in all files in the repo.
 * If no file has changes (i.e. every file's status indicates no change), logs that and skips committing.
 * Otherwise, stages all changed files and creates a commit.
 */
async function commitChanges(message = "Auto-commit") {
  // Get status for all files in the repo.
  const matrix = await git.statusMatrix({ fs: pfs, dir: repoDir });
  // Determine if there is any file that has changes.
  // Each row is: [filepath, HEAD, workingTree, stage]
  const changes = matrix.filter(row => !(row[1] === row[2] && row[2] === row[3]));
  if (changes.length === 0) {
    updateGitSyncStatus("no changes to commit");
    return;
  }
  
  // Stage all changed files.
  for (const row of changes) {
    const filepath = row[0];
    await git.add({ fs: pfs, dir: repoDir, filepath });
  }
  
  updateGitSyncStatus("committing changes: " + message);
  try {
    await git.commit({
      fs: pfs,
      dir: repoDir,
      message,
      author: { name: "ueue sync", email: "ueue@example.com" }
    });
    updateGitSyncStatus("committed changes: " + message);
  } catch (err) {
    console.error("Error committing changes:", err);
    updateGitSyncStatus("Error committing changes: " + err.message, true);
  }
}

/**
 * getOrCreatePRForBranch:
 * Uses the GitHub API to check for or create a pull request for the given branch.
 */
async function getOrCreatePRForBranch(branch) {
  const login = await getLogin();
  const { owner, repo } = parseRepoURL(login.repo);
  const timestamp = Date.now();
  const prListUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&base=mistress&state=open&_=${timestamp}`;
  const prListResponse = await fetch(prListUrl, {
    headers: {
      Authorization: `Bearer ${login.token}`,
      Accept: "application/vnd.github+json"
    }
  });
  if (!prListResponse.ok) {
    const errorText = await prListResponse.text();
    throw new Error("Failed to list PRs: " + errorText + " (check PAT)");
  }
  const prList = await prListResponse.json();
  if (prList.length > 0) {
    return prList[0];
  }
  const prCreateUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  const prData = {
    title: `Merge diverged changes from ${branch} into mistress`,
    head: branch,
    base: "mistress",
    body: "Automatically created PR to merge diverged changes."
  };
  updateGitSyncStatus("Creating PR for branch " + branch + "...");
  const prCreateResponse = await fetch(prCreateUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${login.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(prData)
  });
  if (!prCreateResponse.ok) {
    const errorText = await prCreateResponse.text();
    if (errorText.includes("already exists")) {
      updateGitSyncStatus("PR already exists for branch " + branch + ". Trying again to retrieve it.");
      return getOrCreatePRForBranch(branch);
    }
    throw new Error("Failed to create PR: " + errorText + " (check PAT)");
  }
  const pr = await prCreateResponse.json();
  updateGitSyncStatus("PR created for branch " + branch + ".");
  return pr;
}

/**
 * updateDivergedBranchNotice:
 * Updates the header UI with the current branch indicator.
 */
async function updateDivergedBranchNotice() {
  let branch = await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false });
  const header = document.querySelector("header.site-header");
  let branchIndicator = document.getElementById("branchIndicator");
  if (!branchIndicator) {
    branchIndicator = document.createElement("span");
    branchIndicator.id = "branchIndicator";
    header.appendChild(branchIndicator);
  }
  if (branch === "mistress") {
    branchIndicator.textContent = "";
    branchIndicator.className = "";
    return;
  }
  try {
    const pr = await getOrCreatePRForBranch(branch);
    const login = await getLogin();
    const { owner, repo } = parseRepoURL(login.repo);
    const prUrl = `https://github.com/${owner}/${repo}/pull/${pr.number}/conflicts`;
    branchIndicator.innerHTML = ` [WARNING: You are on diverged branch: ${branch} (primary: mistress)] - <a href="${prUrl}" target="_blank" class="branch-warning-link">Resolve Conflicts</a>`;
  } catch (err) {
    branchIndicator.textContent = ` [WARNING: You are on diverged branch: ${branch} (primary: mistress)] - Failed to create PR (check PAT): ${err}`;
    branchIndicator.classList.add("branch-error");
  }
}

/**
 * syncRepo:
 * Unified sync function that:
 *   1. Commits any uncommitted changes.
 *   2. Calls cloneOrFetchUpdates() to ensure the repo is present and updated.
 *   3. Always resets local HEAD to match origin/mistress using updateLocalToOriginMistressIfPossible().
 *      If either update (from cloneOrFetchUpdates or updateLocalToOriginMistressIfPossible) updated the backend,
 *      dispatch a single "backendUpdated" event.
 *   4. Calls pushOrDivergeAndPush() to push local changes.
 *   5. Updates the branch indicator.
 */
async function syncRepo() {
  updateGitSyncStatus("syncing repo");
  // Pre-sync: commit any uncommitted changes.
  await commitChanges("Auto-commit pre-sync");
  
  const updatedFromFetch = await cloneOrFetchUpdates();
  const updatedFromMistress = await updateLocalToOriginMistressIfPossible();
  if (updatedFromFetch || updatedFromMistress) {
    await loadBackendData();
    document.dispatchEvent(new Event("backendUpdated"));
  }
  await pushOrDivergeAndPush();
  await updateDivergedBranchNotice();
}

// ----- Unified Sync Export -----
window.gitSync = {
  syncRepo,             // Unified sync function.
  commitChanges,
  pushOrDivergeAndPush, // Renamed function.
  cloneOrFetchUpdates,  // Renamed function.
  fs,                   // LightningFS instance.
  pfs,                  // Promise-based FS API.
  repoDir,              // Repository directory path.
};
