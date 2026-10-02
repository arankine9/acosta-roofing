// A tiny IndexedDB key-value store, for photos waiting to be uploaded (too
// big for localStorage). Every call can fail (private windows); callers
// treat it as best effort.

let dbp;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open("acosta-editor", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction("kv", mode);
        const req = fn(t.objectStore("kv"));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
      }),
  );
}

export const idb = {
  get: (key) => tx("readonly", (s) => s.get(key)),
  set: (key, value) => tx("readwrite", (s) => s.put(value, key)),
  del: (key) => tx("readwrite", (s) => s.delete(key)),
};
