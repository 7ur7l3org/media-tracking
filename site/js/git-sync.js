/* js/git-sync.js */

/**
 * Git Sync Module using isomorphic-git and LightningFS.
 *
 * Unified sync flow (syncRepo) does:
 *   1. cloneRepo(): Clone the repo if not present; otherwise, fetch updates.
 *   2. updateLocalToOriginMistressIfPossible(): Compare local HEAD (of any branch)
 *      to fetched "origin/mistress". If local HEAD is strictly behind (i.e. an ancestor),
 *      then force-reset the local clone by checking out "mistress" and updating its ref.
 *   3. pushSync(): If local HEAD already matches fetched "origin/mistress", skip pushing.
 *      Otherwise, push the current branch (or, on non-fast-forward errors, create a session branch).
 *   4. cleanupMergedSessionBranch(): If the current branch is "mistress", log that there are no diverged branches.
 *   5. syncRepo() logs "repo sync complete".
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
    statusElem.style.color = color ? color : (isError ? "red" : "black");
  } else {
    console.log("GitSyncStatus:", message);
  }
  logGitOperation(message);
}

function setSyncFailedHeader() {
  const header = document.querySelector("header.site-header");
  if (header && !document.getElementById("syncFailureIndicator")) {
    const indicator = document.createElement("span");
    indicator.id = "syncFailureIndicator";
    indicator.textContent = " SYNC FAILED! LOCAL ONLY!";
    indicator.style.color = "red";
    indicator.style.fontWeight = "bold";
    header.appendChild(indicator);
    logGitOperation("setSyncFailedHeader: Added failure indicator.");
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
 * cloneRepo:
 * Checks if the repo is already cloned in IndexedDB.
 * If so, performs a fetch; otherwise, clones the repo.
 * This function does not modify local branch state.
 */
async function cloneRepo() {
  if (clonePromise) return clonePromise;
  clonePromise = (async () => {
    const login = await getLogin();
    if (!login || !login.token) {
      updateGitSyncStatus("cloneRepo: Error: Please log in with your GitHub token first.", true);
      return;
    }
    const token = login.token;
    if (!login.repo) {
      updateGitSyncStatus("cloneRepo: Error: Repository URL not found in login info.", true);
      return;
    }
    const repoUrl = login.repo;
    const authObj = { username: "x-access-token", password: token, oauth2format: "github" };

    try {
      await pfs.readdir(repoDir);
      updateGitSyncStatus("local repo exists – fetching updates...", false, "green");
      await git.fetch({
        fs: pfs,
        http,
        dir: repoDir,
        onAuth: () => authObj,
        corsProxy: login.corsProxy,
      });
      updateGitSyncStatus("repo fetched successfully", false, "green");
    } catch (err) {
      updateGitSyncStatus("cloning repo...", false);
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
        updateGitSyncStatus("repo cloned successfully", false, "green");
      } catch (cloneErr) {
        console.error("cloneRepo: Error cloning repo:", cloneErr);
        updateGitSyncStatus("cloneRepo: Error cloning repo: " + cloneErr.message, true);
      }
    }
    await updateBranchIndicator();
  })();
  return clonePromise;
}

/**
 * updateLocalToOriginMistressIfPossible:
 * Compares the current local HEAD (of any branch) to the fetched "origin/mistress".
 * Logs explicit commit IDs.
 * If local HEAD is strictly behind (i.e. is an ancestor of fetched "origin/mistress"),
 * then force-reset the local clone by checking out "mistress" and updating its ref.
 */
async function updateLocalToOriginMistressIfPossible() {
  try {
    const fetchedOriginMistress = await git.resolveRef({ fs: pfs, dir: repoDir, ref: "origin/mistress" });
    const localHead = await git.resolveRef({ fs: pfs, dir: repoDir, ref: "HEAD" });
    logGitOperation(`comparing local HEAD (${localHead.slice(0,7)}) to fetched origin/mistress (${fetchedOriginMistress.slice(0,7)})`);
    if (localHead === fetchedOriginMistress) {
      updateGitSyncStatus("local HEAD already matches fetched origin/mistress.", false, "green");
      return;
    }
    const logRemote = await git.log({ fs: pfs, dir: repoDir, ref: "origin/mistress", depth: 100 });
    const isAncestor = logRemote.some(commit => commit.oid === localHead);
    if (isAncestor) {
      updateGitSyncStatus("local HEAD is an ancestor of fetched origin/mistress; updating local clone to origin/mistress", false, "green");
      await git.checkout({ fs: pfs, dir: repoDir, ref: "mistress", force: true });
      await git.deleteRef({ fs: pfs, dir: repoDir, ref: "refs/heads/mistress" }).catch(() => {});
      await git.writeRef({ fs: pfs, dir: repoDir, ref: "refs/heads/mistress", value: fetchedOriginMistress, overwrite: true });
      updateGitSyncStatus(`local clone reset: HEAD updated from ${localHead.slice(0,7)} to ${fetchedOriginMistress.slice(0,7)}.`, false, "green");
    } else {
      updateGitSyncStatus(`local HEAD (${localHead.slice(0,7)}) has extra commits; not resetting.`, true);
    }
  } catch (e) {
    console.error("updateLocalToOriginMistressIfPossible: Error:", e);
  }
}

/**
 * pushSync:
 * Attempts to push the current branch.
 * First, it checks if local HEAD already matches the fetched "origin/mistress".
 * If so, it logs "skipping push (remote is already updated)" and does not call push.
 * Otherwise, it pushes; if push fails due to non-fast-forward,
 * it creates a session branch and pushes that.
 */
async function pushSync() {
  const login = await getLogin();
  if (!login || !login.token) {
    updateGitSyncStatus("pushSync: Error: Please log in with your GitHub token first.", true);
    return;
  }
  if (!login.repo) {
    updateGitSyncStatus("pushSync: Error: Repository URL not found in login info.", true);
    return;
  }
  const token = login.token;
  const authObj = { username: "x-access-token", password: token, oauth2format: "github" };
  let branch = await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false });
  if (!branch) branch = "mistress";

  // Before pushing, check if there's anything to push.
  try {
    const localHead = await git.resolveRef({ fs: pfs, dir: repoDir, ref: branch });
    let remoteHead;
    try {
      remoteHead = await git.resolveRef({ fs: pfs, dir: repoDir, ref: `origin/${branch}` });
    } catch (e) {
      remoteHead = null;
    }
    if (remoteHead === localHead) {
      updateGitSyncStatus("skipping push (remote is already updated)", false, "green");
      return;
    }
  } catch (e) {
    console.error("pushSync: Error checking push state:", e);
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
    console.error("pushSync: Error pushing changes:", err);
    if (err.message && err.message.includes("not a simple fast-forward")) {
      updateGitSyncStatus("pushSync: Push rejected due to non-fast-forward. Creating session branch...", true);
      const sessionBranch = `${branch}-session-${Date.now()}`;
      updateGitSyncStatus("pushSync: Creating and switching to branch: " + sessionBranch, true);
      try {
        await git.branch({ fs: pfs, dir: repoDir, ref: sessionBranch, checkout: true });
        updateGitSyncStatus("pushSync: Switched to branch: " + sessionBranch, true);
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
        updateGitSyncStatus("pushSync: Sync complete: diverged changes are now pushed to branch " + sessionBranch + ".", false, "orange");
      } catch (sessionErr) {
        console.error("pushSync: Error creating session branch:", sessionErr);
        updateGitSyncStatus("pushSync: Error during session branch creation: " + sessionErr.message + ". SYNC FAILED! LOCAL ONLY!", true);
        setSyncFailedHeader();
      }
    } else {
      updateGitSyncStatus("pushSync: Error pushing changes: " + err.message, true);
    }
  }
}

/**
 * cleanupMergedSessionBranch:
 * If the current branch (not "mistress") is fully merged into fetched "origin/mistress"
 * and has no extra local commits, then force-reset the entire local clone to match fetched "origin/mistress"
 * by checking out "mistress" and updating its ref, then delete the session branch.
 */
async function cleanupMergedSessionBranch() {
  let branch = await git.currentBranch({ fs: pfs, dir: repoDir, fullname: false });
  if (branch === "mistress") {
    logGitOperation("no diverged branches to clean up (current branch is mistress)");
    return;
  }
  let hasUnpushed = false;
  try {
    const cherry = await git.cherry({ fs: pfs, dir: repoDir, ref: branch, remoteRef: `origin/${branch}` });
    hasUnpushed = cherry && cherry.length > 0;
  } catch (e) {
    console.error("cleanupMergedSessionBranch: Error checking for unpushed commits:", e);
  }
  if (hasUnpushed) {
    updateGitSyncStatus(`cleanupMergedSessionBranch: Local changes pending on ${branch} – cannot clean up merged session branch.`, true);
    return;
  }
  const merged = await isSessionMergedIntoPrimary(branch);
  if (merged) {
    updateGitSyncStatus(`cleanupMergedSessionBranch: Session branch ${branch} is fully merged upstream. Cleaning up...`, false, "green");
    try {
      await git.checkout({ fs: pfs, dir: repoDir, ref: "mistress", force: true });
      const fetchedOriginMistress = await git.resolveRef({ fs: pfs, dir: repoDir, ref: "origin/mistress" });
      await git.deleteRef({ fs: pfs, dir: repoDir, ref: "refs/heads/mistress" }).catch(() => {});
      await git.writeRef({ fs: pfs, dir: repoDir, ref: "refs/heads/mistress", value: fetchedOriginMistress, overwrite: true });
      await git.deleteBranch({ fs: pfs, dir: repoDir, ref: branch });
      await git.push({
        fs: pfs,
        dir: repoDir,
        ref: branch,
        remoteRef: branch,
        force: true,
        onAuth: () => {
          const login = getLoginSync();
          return { username: "x-access-token", password: login.token, oauth2format: "github" };
        },
        corsProxy: getLoginSync().corsProxy,
      }).catch(err => {
        console.warn("cleanupMergedSessionBranch: Remote session branch deletion may require manual cleanup:", err);
      });
      updateGitSyncStatus("cleanupMergedSessionBranch: Cleanup complete – local clone now matches fetched origin/mistress.", false, "green");
    } catch (cleanupErr) {
      console.error("cleanupMergedSessionBranch: Error during cleanup:", cleanupErr);
      updateGitSyncStatus("cleanupMergedSessionBranch: Error during cleanup: " + cleanupErr.message, true);
    }
  } else {
    updateGitSyncStatus(`cleanupMergedSessionBranch: Session branch ${branch} is still diverged.`, false, "orange");
  }
}

/**
 * updateBranchIndicator:
 * Updates the header UI with the current branch indicator.
 * If not on "mistress", attempts to get or create a PR for conflict resolution.
 */
async function updateBranchIndicator() {
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
    return;
  }
  const merged = await isSessionMergedIntoPrimary(branch);
  if (merged) {
    await cleanupMergedSessionBranch();
    branchIndicator.textContent = "";
    return;
  }
  try {
    const pr = await getOrCreatePRForBranch(branch);
    const login = await getLogin();
    const { owner, repo } = parseRepoURL(login.repo);
    const prUrl = `https://github.com/${owner}/${repo}/pull/${pr.number}/conflicts`;
    branchIndicator.innerHTML = ` [WARNING: You are on diverged branch: ${branch} (primary: mistress)] - <a href="${prUrl}" target="_blank" style="color: orange; font-weight: bold;">Resolve Conflicts</a>`;
  } catch (err) {
    branchIndicator.textContent = ` [WARNING: You are on diverged branch: ${branch} (primary: mistress)] - Failed to create PR (check PAT)`;
    branchIndicator.style.color = "red";
  }
}

/**
 * syncRepo:
 * Unified sync function that:
 *   1. Calls cloneRepo() to ensure the repo is present (clone if not, fetch if already cloned).
 *   2. Immediately calls updateLocalToOriginMistressIfPossible() to update the local clone if local HEAD is strictly behind.
 *   3. Calls pushSync() to push the current branch (or create a session branch if push is rejected).
 *   4. Updates the branch indicator and cleans up merged session branches.
 */
async function syncRepo() {
  logGitOperation("syncing repo");
  await cloneRepo();
  await updateLocalToOriginMistressIfPossible();
  await loadBackendData();
  await pushSync();
  await updateBranchIndicator();
  await cleanupMergedSessionBranch();
  logGitOperation("repo sync complete");
}

/**
 * commitChanges:
 * Stages and commits changes in the local repo, then updates the branch indicator.
 */
async function commitChanges(message = "Auto-commit") {
  updateGitSyncStatus("committing changes: " + message);
  const filePath = "ueue-media-tracking.json";
  try {
    await git.add({ fs: pfs, dir: repoDir, filepath: filePath });
    await git.commit({
      fs: pfs,
      dir: repoDir,
      message,
      author: { name: "ueue sync", email: "ueue@example.com" }
    });
    updateGitSyncStatus("committed changes: " + message, false, "green");
    await updateBranchIndicator();
  } catch (err) {
    console.error("Error committing changes:", err);
    updateGitSyncStatus("Error committing changes: " + err.message, true);
  }
}

// ----- Unified Sync Export -----
window.gitSync = {
  syncRepo,       // Unified sync function.
  commitChanges,
  pushSync,
  cloneRepo,
  fs,             // LightningFS instance.
  pfs,            // Promise-based FS API.
  repoDir,        // Repository directory path.
};
