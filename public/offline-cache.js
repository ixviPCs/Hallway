(() => {
  const DB_NAME = "open-chat-offline";
  const STORE_NAME = "accounts";
  let databasePromise;

  function database() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB is unavailable."));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "accountId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open offline storage."));
      request.onblocked = () => reject(new Error("Offline storage is busy in another tab."));
    });
    return databasePromise;
  }

  async function read(accountId) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(accountId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not read offline storage."));
    });
  }

  async function patch(accountId, changes) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(accountId);
      request.onsuccess = () => store.put({ ...(request.result || {}), ...changes, accountId, updatedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save offline storage."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline storage write was canceled."));
    });
  }

  async function remove(accountId) {
    if (!accountId) return;
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(accountId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not clear offline storage."));
    });
  }

  window.openChatOfflineStore = { read, patch, remove };
  if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/service-worker.js").catch(() => {});
})();
