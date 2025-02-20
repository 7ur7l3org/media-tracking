const DB_NAME = "GitHubAuthDB";
const STORE_NAME = "tokens";

// Open IndexedDB database
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject("IndexedDB Error");
    });
}

// Save token to IndexedDB
async function saveToken(token) {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put({ id: "github_access_token", token });
}

// Get token from IndexedDB
async function getToken() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get("github_access_token");

        request.onsuccess = () => resolve(request.result ? request.result.token : null);
        request.onerror = () => reject("Failed to retrieve token");
    });
}
