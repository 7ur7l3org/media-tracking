/* js/cache.js */
// Cache expiry: 30 minutes in milliseconds
const CACHE_EXPIRY = 30 * 60 * 1000;
const DB_NAME = "wikidataCache";
const STORE_NAME = "cache";
let dbPromise = null;

function openCacheDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "url" });
        store.createIndex("timestamp", "timestamp");
      }
    };
  });
  return dbPromise;
}

function pruneCacheEntries(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    const now = Date.now();
    const keyRange = IDBKeyRange.upperBound(now - CACHE_EXPIRY);
    const request = index.openCursor(keyRange);
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

function persistentCachedJSONFetch(url) {
  return openCacheDB().then(db => {
    return pruneCacheEntries(db).then(() => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const getRequest = store.get(url);
        getRequest.onsuccess = (e) => {
          const entry = e.target.result;
          const now = Date.now();
          if (entry && (now - entry.timestamp < CACHE_EXPIRY)) {
            // Return cached data
            resolve(entry.data);
          } else {
            // No valid cache entry; fetch from network and cache it.
            fetch(url)
              .then(response => {
                if (!response.ok) {
                  throw new Error("Network response was not ok: " + response.statusText);
                }
                return response.json();
              })
              .then(data => {
                const newEntry = { url, timestamp: now, data };
                const txWrite = db.transaction(STORE_NAME, "readwrite");
                txWrite.objectStore(STORE_NAME).put(newEntry);
                resolve(data);
              })
              .catch(err => reject(err));
          }
        };
        getRequest.onerror = (e) => reject(e.target.error);
      });
    });
  });
}
