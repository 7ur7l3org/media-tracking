/* js/auth.js */

/**
 * Authentication & Repository Selection Module
 *
 * This module handles:
 *  - Saving and retrieving a GitHub token and repository pair.
 *  - Letting the user choose where to persist their login: IndexedDB, localStorage, or sessionStorage.
 *
 * Exposes:
 *  - updateAuthUI() to refresh the displayed login info.
 *  - getToken() to retrieve the current token.
 */

// ---------- Storage Functions for Login Info ----------
async function openLoginDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("GitHubEditorDB", 4);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("repo_permissions")) {
        db.createObjectStore("repo_permissions");
      }
      if (!db.objectStoreNames.contains("login_info")) {
        db.createObjectStore("login_info");
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = () => reject("IndexedDB error in openLoginDatabase");
  });
}

async function saveLoginIndexedDB(loginData) {
  try {
    const db = await openLoginDatabase();
    const tx = db.transaction("login_info", "readwrite");
    const store = tx.objectStore("login_info");
    store.put(loginData, "login");
  } catch (err) {
    console.error("Error saving login info to IndexedDB:", err);
  }
}

async function getLoginIndexedDB() {
  try {
    const db = await openLoginDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("login_info", "readonly");
      const store = tx.objectStore("login_info");
      const req = store.get("login");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error("Error getting login info from IndexedDB:", err);
    return null;
  }
}

function saveLoginLocal(loginData) {
  localStorage.setItem("login_info", JSON.stringify(loginData));
}

function getLoginLocal() {
  const str = localStorage.getItem("login_info");
  return str ? JSON.parse(str) : null;
}

function saveLoginSession(loginData) {
  sessionStorage.setItem("login_info", JSON.stringify(loginData));
}

function getLoginSession() {
  const str = sessionStorage.getItem("login_info");
  return str ? JSON.parse(str) : null;
}

function clearAllLogin() {
  localStorage.removeItem("login_info");
  sessionStorage.removeItem("login_info");
  openLoginDatabase().then(db => {
    const tx = db.transaction("login_info", "readwrite");
    tx.objectStore("login_info").delete("login");
  });
}

async function saveLogin(loginData) {
  if (loginData.storage === "localStorage") {
    saveLoginLocal(loginData);
  } else if (loginData.storage === "sessionStorage") {
    saveLoginSession(loginData);
  } else {
    await saveLoginIndexedDB(loginData);
  }
  // Update the global login variable.
  window.currentLogin = loginData;
}

async function getLogin() {
  let login = await getLoginIndexedDB();
  if (login && login.token !== undefined) return login;
  login = getLoginLocal();
  if (login && login.token !== undefined) return login;
  login = getLoginSession();
  if (login && login.token !== undefined) return login;
  return null;
}

function getToken() {
  return getLoginSync()?.token || "";
}

function getLoginSync() {
  // Return the globally stored login info if available.
  return window.currentLogin || null;
}

// ---------- Helper: Parse Token for Optional CORS Proxy ----------
function parseToken(rawToken) {
  if (rawToken.includes("#")) {
    const parts = rawToken.split("#");
    return {
      token: parts[0],
      corsProxy: parts[1] || "https://cors.isomorphic-git.org/"
    };
  }
  return { token: rawToken, corsProxy: "https://cors.isomorphic-git.org/" };
}

// ---------- Debounce Helper ----------
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ---------- UI Update Functions ----------
async function updateAuthUI() {
  const container = document.getElementById("authFooter");
  if (!container) return;
  const login = await getLogin();
  if (login && login.token && login.token.trim() !== "") {
    // Update the global login variable.
    window.currentLogin = login;
    container.innerHTML = `
      You are logged in to sync queue/consumption data with the following repo/token:</br>
      <p>
        <b>Repository URL:</b> <a href="${login.repo}" target="_blank">${login.repo}</a><br/>
        <b>Token</b> (<a href="https://github.com/settings/personal-access-tokens" target="_blank">Manage PATs</a>)<b>:</b> ${login.token}<br/>
        <b>CORS Proxy</b> (see <a href="https://github.com/isomorphic-git/isomorphic-git#cors-support" target="_blank">isomorphic-git</a> cors support)<b>:</b> <a href="${login.corsProxy}" target="_blank">${login.corsProxy}</a><br/>
        <b>Stored in:</b> ${login.storage}<br/>
      </p>
      <button id="logoutButton">Logout</button>
    `;
    document.getElementById("logoutButton").addEventListener("click", () => {
      clearAllLogin();
      updateAuthUI();
    });
  } else {
    container.innerHTML = `
      <form id="login-form">
        <p>
          You are not logged in. To enable data sync (via <a href="https://github.com/isomorphic-git/isomorphic-git" target="_blank">isomorphic-git</a>), enter your GitHub Personal Access Token. See <a href="https://github.com/settings/personal-access-tokens" target="_blank">GitHub PAT settings</a> to manage or regenerate tokens, or create a new token with read and write access to repository Contents.
        </p>
        <label for="github-token">GitHub Token (password):</label>
        <input type="password" id="github-token" placeholder="github_pat_...[#https://your-cors-proxy]" class="input-wide" autocomplete="password" />
        <button type="button" id="toggle-token-input" class="hidden">Show</button>
        <small>Format: github_pat_...[#https://your-cors-proxy] (default CORS proxy is <a href="https://cors.isomorphic-git.org/">https://cors.isomorphic-git.org/</a>)</small><br/>
        <label for="repo-input">Repository URL (username):</label>
        <input type="text" id="repo-input" placeholder="https://github.com/owner/repo" class="input-wide" autocomplete="username" />
        <small>[<button type="button" id="load-repos"><small>Load by Token Write Access</small></button>:<span id="repo-status"></span><select id="repo-selector" class="hidden"></select>]</small><br/>
        <label for="storage-method">Client-Side Credential Storage Method:</label>
        <select id="storage-method">
          <option value="indexeddb">IndexedDB (persistent, local only)</option>
          <option value="localStorage">Local Storage (persistent, less secure)</option>
          <option value="sessionStorage">Session Storage (ephemeral)</option>
        </select><br/><br />
        <button type="submit" id="save-login">Login</button> (Save Token/Repo in Client Storage)
      </form>
    `;
    document.getElementById("toggle-token-input").addEventListener("click", () => {
      const tokenInput = document.getElementById("github-token");
      const btn = document.getElementById("toggle-token-input");
      if (tokenInput.type === "password") {
        tokenInput.type = "text";
        btn.textContent = "Hide";
      } else {
        tokenInput.type = "password";
        btn.textContent = "Show";
      }
    });
    setTimeout(() => {
      const tokenInput = document.getElementById("github-token");
      const toggleBtn = document.getElementById("toggle-token-input");
      if (tokenInput) {
        tokenInput.type = "text";
        toggleBtn.textContent = "Hide";
      }
    }, 100);
    const tokenInputField = document.getElementById("github-token");
    tokenInputField.addEventListener("input", debounce(() => {
      if (tokenInputField.value.trim() !== "") {
        refreshReposDOM();
      }
    }, 200));
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const rawToken = document.getElementById("github-token").value.trim();
      const repoInput = document.getElementById("repo-input").value.trim();
      const storageMethod = document.getElementById("storage-method").value;
      if (!repoInput) {
        document.getElementById("repo-status").textContent = " Error: Please enter a repository URL.";
        return;
      }
      const parsed = parseToken(rawToken);
      const loginData = { 
        token: parsed.token, 
        repo: repoInput, 
        storage: storageMethod,
        corsProxy: parsed.corsProxy
      };
      await saveLogin(loginData);
      updateAuthUI();
    });
    document.getElementById("load-repos").addEventListener("click", () => {
      refreshReposDOM();
    });
  }
}

async function refreshReposDOM() {
  const statusElem = document.getElementById("repo-status");
  statusElem.textContent = " Loading repositories...";
  const rawToken = document.getElementById("github-token").value.trim();
  const token = parseToken(rawToken).token;
  const repoInput = document.getElementById("repo-input");
  if (!token) {
    statusElem.textContent = " Error: Please enter a GitHub token to load repositories with write access.";
    return;
  }
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const user = await userRes.json();
    const username = user.login;
    if (!username) {
      statusElem.textContent = " Error: Failed to determine user login from token.";
      return;
    }
    const reposRes = await fetch("https://api.github.com/user/repos", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const repos = await reposRes.json();
    if (!Array.isArray(repos)) {
      statusElem.textContent = " Error: Failed to fetch repositories.";
      return;
    }
    const validRepos = [];
    for (const repo of repos) {
      try {
        const permRes = await fetch(`https://api.github.com/repos/${repo.full_name}/collaborators/${username}/permission`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!permRes.ok) continue;
        const permData = await permRes.json();
        if (permData.user && permData.user.permissions && permData.user.permissions.push) {
          validRepos.push(repo.html_url);
        }
      } catch (e) { }
    }
    if (validRepos.length > 0) {
      populateRepoDropdown(validRepos);
      statusElem.textContent = " Loaded ";
    } else {
      statusElem.textContent = " No writable repositories found for the provided token.";
    }
  } catch (e) {
    console.error(e);
    statusElem.textContent = " Error loading repositories.";
  }
}

function populateRepoDropdown(repoNames) {
  const repoSelector = document.getElementById("repo-selector");
  repoSelector.innerHTML = "";
  repoNames.forEach(repoName => {
    const option = document.createElement("option");
    option.value = repoName;
    option.textContent = repoName;
    repoSelector.appendChild(option);
  });
  repoSelector.classList.remove("hidden");
  repoSelector.classList.add("inline-block");
  if (repoNames.length > 0) {
    repoSelector.selectedIndex = 0;
    document.getElementById("repo-input").value = repoNames[0];
  }
  repoSelector.addEventListener("change", () => {
    document.getElementById("repo-input").value = repoSelector.value;
  });
}

document.addEventListener("DOMContentLoaded", updateAuthUI);
window.authModule = {
  getToken,
  updateAuthUI,
};
