// Tiny IndexedDB key-value store (with an in-memory layer) for everything we read from Spotify.
// Falls back to memory only if IndexedDB is unavailable (private mode, blocked storage…).

const DB = 'disc-shelf';
const STORE = 'kv';
const mem = new Map();
let dbp;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return db().then(
    (d) =>
      d &&
      new Promise((resolve) => {
        try {
          const t = d.transaction(STORE, mode);
          const r = fn(t.objectStore(STORE));
          t.oncomplete = () => resolve(r?.result);
          t.onerror = t.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

/** { value, at } or undefined. */
export async function cacheGet(key) {
  if (mem.has(key)) return mem.get(key);
  const v = await tx('readonly', (s) => s.get(key));
  if (v) mem.set(key, v);
  return v;
}

export async function cacheSet(key, value) {
  const entry = { value, at: Date.now() };
  mem.set(key, entry);
  await tx('readwrite', (s) => s.put(entry, key));
  return value;
}

export async function cacheKeys(prefix = '') {
  const keys = (await tx('readonly', (s) => s.getAllKeys())) || [...mem.keys()];
  return keys.filter((k) => String(k).startsWith(prefix));
}
