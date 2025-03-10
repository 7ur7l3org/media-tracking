/* js/git-sync.js */

/**
 * Git Sync Module using isomorphic-git and LightningFS.
 *
 * This module will:
 *  - Clone the user’s repo (using the token from auth.js) into a LightningFS filesystem in the browser.
 *  - If the repo is already cloned, perform a fetch to update the local copy.
 *  - Expose functions to clone/fetch, commit changes, and push local commits.
 *
 * Note: This implementation assumes that isomorphic-git, its HTTP helper (http),
 * and LightningFS are available.
 */

// Initialize LightningFS for the repository.
const fs = new LightningFS('repoFS');
const pfs = fs.promises;
const repoDir = '/repo';

/**
 * Helper to update the Git Sync status in the DOM.
 */
function updateGitSyncStatus(message, isError = false) {
  const statusElem = document.getElementById("gitSyncStatus");
  if (statusElem) {
    statusElem.textContent = message;
    statusElem.style.color = isError ? "red" : "black";
  } else {
    console.log("GitSyncStatus:", message);
  }
}

/**
 * Clones the repo if it hasn’t been cloned yet; otherwise, fetches updates.
 */
async function cloneRepo() {
  const login = await getLogin(); // retrieve login asynchronously
  if (!login || !login.token) {
    updateGitSyncStatus("Error: Please log in with your GitHub token first.", true);
    return;
  }
  const token = login.token;
  if (!login.repo) {
    updateGitSyncStatus("Error: Repository URL not found in login info.", true);
    return;
  }
  const repoUrl = login.repo;
  // For GitHub PATs, set username to 'x-access-token' and password to the token.
  // Also specify oauth2format: 'github' so that isomorphic-git sends the token properly.
  const authObj = { username: 'x-access-token', password: token, oauth2format: 'github' };

  try {
    // Check if the repo directory exists.
    await pfs.readdir(repoDir);
    // If it exists, fetch updates.
    updateGitSyncStatus("Local repo exists – fetching updates...");
    await git.fetch({
      fs: pfs,
      http, // isomorphic-git HTTP helper (should be defined globally)
      dir: repoDir,
      onAuth: () => authObj,
      corsProxy: login.corsProxy,
    });
    updateGitSyncStatus("Repo fetched successfully.");
  } catch (err) {
    // If the repo directory does not exist, clone it.
    updateGitSyncStatus("Cloning repo...");
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
      updateGitSyncStatus("Repo cloned successfully.");
    } catch (cloneErr) {
      console.error(cloneErr);
      updateGitSyncStatus("Error cloning repo: " + cloneErr.message, true);
    }
  }
}

/**
 * Stages and commits changes in the local repo.
 * (Extend this function with actual git.add and git.commit calls as needed.)
 */
async function commitChanges(message = "Auto-commit") {
  updateGitSyncStatus("Committing changes...");
  // Example pseudocode:
  // await git.add({ fs: pfs, dir: repoDir, filepath: 'ueue-media-tracking.json' });
  // await git.commit({
  //   fs: pfs,
  //   dir: repoDir,
  //   message,
  //   author: { name: "Your Name", email: "your.email@example.com" }
  // });
  updateGitSyncStatus("Commit complete.");
}

/**
 * Pushes local commits to GitHub.
 */
async function pushSync() {
  const login = await getLogin();
  if (!login || !login.token) {
    updateGitSyncStatus("Error: Please log in with your GitHub token first.", true);
    return;
  }
  if (!login.repo) {
    updateGitSyncStatus("Error: Repository URL not found in login info.", true);
    return;
  }
  const token = login.token;
  const authObj = { username: 'x-access-token', password: token, oauth2format: 'github' };
  updateGitSyncStatus("Pushing changes to GitHub...");
  try {
    await git.push({
      fs: pfs,
      http,
      dir: repoDir,
      onAuth: () => authObj,
      corsProxy: login.corsProxy,
    });
    updateGitSyncStatus("Sync complete.");
  } catch (err) {
    console.error(err);
    updateGitSyncStatus("Error pushing changes: " + err.message, true);
  }
}

// Expose the functions and filesystem for use by other modules.
window.gitSync = {
  cloneRepo,
  commitChanges,
  pushSync,
  fs,       // Expose LightningFS instance
  pfs,      // Expose promise-based FS API
  repoDir,  // The repository directory path in FS
};
