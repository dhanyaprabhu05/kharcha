/* Storage, entirely on the phone, in the browser's IndexedDB.

   Nothing here talks to a network. Everything is loaded into memory once at
   start-up -- a year of payments is a few thousand small rows -- and every
   change is written straight through to IndexedDB. */

const DB_NAME = 'kharcha';
const DB_VERSION = 1;

let db = null;
const cache = { transactions: new Map(), rules: {}, unparsed: new Map(), meta: {} };

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export async function open() {
  if (db) return;
  db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const upgrade = req.result;
      if (!upgrade.objectStoreNames.contains('transactions')) {
        const store = upgrade.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        // Unique: importing the same SMS twice must never create two rows.
        store.createIndex('fingerprint', 'fingerprint', { unique: true });
      }
      if (!upgrade.objectStoreNames.contains('rules')) {
        upgrade.createObjectStore('rules', { keyPath: 'key' });
      }
      if (!upgrade.objectStoreNames.contains('unparsed')) {
        upgrade.createObjectStore('unparsed', { keyPath: 'fingerprint' });
      }
      if (!upgrade.objectStoreNames.contains('meta')) {
        upgrade.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other Kharcha tabs and reload.'));
  });

  const tx = db.transaction(['transactions', 'rules', 'unparsed', 'meta'], 'readonly');
  const [txns, rules, unparsed, meta] = await Promise.all([
    request(tx.objectStore('transactions').getAll()),
    request(tx.objectStore('rules').getAll()),
    request(tx.objectStore('unparsed').getAll()),
    request(tx.objectStore('meta').getAll()),
  ]);
  txns.forEach((t) => cache.transactions.set(t.id, t));
  rules.forEach((r) => { cache.rules[r.key] = r.category; });
  unparsed.forEach((u) => cache.unparsed.set(u.fingerprint, u));
  meta.forEach((m) => { cache.meta[m.key] = m.value; });
}

/* ------------------------------------------------------------ reads */

export const allTransactions = () => [...cache.transactions.values()];
export const getTransaction = (id) => cache.transactions.get(id) || null;
export const rules = () => ({ ...cache.rules });
export const unparsed = () => [...cache.unparsed.values()];
export const meta = (key, fallback = null) => (key in cache.meta ? cache.meta[key] : fallback);

export function hasFingerprint(fingerprint) {
  for (const t of cache.transactions.values()) {
    if (t.fingerprint === fingerprint) return true;
  }
  return false;
}

/* ----------------------------------------------------------- writes */

/** Insert new transactions. Rows whose fingerprint already exists are skipped. */
export async function addTransactions(rows) {
  const fresh = rows.filter((r) => !hasFingerprint(r.fingerprint));
  if (!fresh.length) return [];
  const tx = db.transaction('transactions', 'readwrite');
  const store = tx.objectStore('transactions');
  const pending = fresh.map((row) => request(store.add(row)).then((id) => ({ ...row, id })));
  const saved = await Promise.all(pending);
  await done(tx);
  saved.forEach((row) => cache.transactions.set(row.id, row));
  return saved;
}

export async function updateTransactions(rows) {
  if (!rows.length) return;
  const tx = db.transaction('transactions', 'readwrite');
  const store = tx.objectStore('transactions');
  rows.forEach((row) => store.put(row));
  await done(tx);
  rows.forEach((row) => cache.transactions.set(row.id, row));
}

export async function deleteTransactions(ids) {
  if (!ids.length) return;
  const tx = db.transaction('transactions', 'readwrite');
  const store = tx.objectStore('transactions');
  ids.forEach((id) => store.delete(id));
  await done(tx);
  ids.forEach((id) => cache.transactions.delete(id));
}

export async function setRule(key, category) {
  const tx = db.transaction('rules', 'readwrite');
  tx.objectStore('rules').put({ key, category, updated: new Date().toISOString() });
  await done(tx);
  cache.rules[key] = category;
}

export async function addUnparsed(entry) {
  if (cache.unparsed.has(entry.fingerprint)) return;
  const tx = db.transaction('unparsed', 'readwrite');
  tx.objectStore('unparsed').put(entry);
  await done(tx);
  cache.unparsed.set(entry.fingerprint, entry);
}

export async function setMeta(key, value) {
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await done(tx);
  cache.meta[key] = value;
}

export async function clearAll() {
  const names = ['transactions', 'rules', 'unparsed', 'meta'];
  const tx = db.transaction(names, 'readwrite');
  names.forEach((name) => tx.objectStore(name).clear());
  await done(tx);
  cache.transactions.clear();
  cache.unparsed.clear();
  cache.rules = {};
  cache.meta = {};
}

/* ------------------------------------------------------- durability */

/** Ask the browser not to evict our data when the phone is low on space.

    Without this, Chrome is allowed to clear site storage under pressure. An
    installed app is normally granted persistence; this makes the request
    explicit and reports the answer so the app can be honest about it. */
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function persistenceStatus() {
  if (!navigator.storage || !navigator.storage.persisted) return null;
  try { return await navigator.storage.persisted(); } catch { return null; }
}
