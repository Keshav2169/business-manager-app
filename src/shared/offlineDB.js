// ─── OFFLINE STORAGE (IndexedDB) ───────────────────────────────────────────────
// Backs three things for the whole app, all centralized here so sheetsAPI
// (utils.js) never has to know how persistence works, just that it can
// await getCache/setCache/enqueueWrite/getQueue/etc.
//
//  1. "sheetCache"   — last-known-good server data per sheet, used to serve
//                      reads when offline and as the baseline snapshot for
//                      conflict detection on sync.
//  2. "writeQueue"   — pending append/update/softDelete operations created
//                      while offline, applied optimistically to reads via
//                      mergeQueueIntoResult() in utils.js, flushed on
//                      reconnect by flushQueue() in utils.js.
//  3. "draftSerials" — sheet/prefix/fy -> counter, used to hand out
//                      DRAFT-<PREFIX>-<n> placeholder IDs for offline-created
//                      records instead of ever guessing a real serial.
//
// IndexedDB (not localStorage) specifically because this data grows over
// years of jobs/invoices/etc. and localStorage's ~5MB ceiling is not safe
// to assume forever.

const DB_NAME    = "ke-suite-offline";
const DB_VERSION = 1;
const STORE_CACHE = "sheetCache";
const STORE_QUEUE = "writeQueue";
const STORE_DRAFT = "draftSerials";

let _dbPromise = null;

function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

export function openDB() {
  if (!hasIndexedDB()) return Promise.reject(new Error("IndexedDB unavailable in this environment"));
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE, { keyPath: "cacheKey" });
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: "localId" });
      if (!db.objectStoreNames.contains(STORE_DRAFT)) db.createObjectStore(STORE_DRAFT, { keyPath: "counterKey" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error || new Error("Failed to open IndexedDB"));
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

// Exposed for tests (and any future "reset local data" admin action) — lets
// a caller release the open connection so the database can be deleted or
// reopened cleanly instead of indexedDB.deleteDatabase() hanging on an
// unclosed handle.
export async function closeDB() {
  if (!_dbPromise) return;
  try { const db = await _dbPromise; db.close(); } catch { /* already gone */ }
  _dbPromise = null;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

// ─── QUEUE CHANGE NOTIFICATIONS ────────────────────────────────────────────────
// Lets App.jsx show a live "N pending sync" count without polling — every
// enqueue/update/remove below calls notify() so subscribers re-read the queue.
const _listeners = new Set();
export function subscribeQueue(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
function notify() {
  _listeners.forEach(fn => { try { fn(); } catch { /* listener's problem, not ours */ } });
}

// ─── SHEET CACHE ────────────────────────────────────────────────────────────────
export const cacheKeyFor = (sheet, fy) => `${sheet}::${fy ?? "_all"}`;

export async function getCache(cacheKey) {
  try {
    const store = await tx(STORE_CACHE, "readonly");
    return await reqToPromise(store.get(cacheKey));
  } catch { return undefined; }
}

export async function setCache(cacheKey, value) {
  try {
    const store = await tx(STORE_CACHE, "readwrite");
    await reqToPromise(store.put({ cacheKey, ...value }));
  } catch { /* best-effort cache — a failed write here shouldn't break the read */ }
}

// Scans every cached sheet snapshot (any FY) for a sheet and returns the
// first row matching `_rowNum`. Used to find a row's last-known-good
// createdAt/createdBy baseline when queuing an update/delete, and to locate
// a row for the merge overlay regardless of which FY tab is open.
export async function findCachedRow(sheet, rowNum) {
  try {
    const store = await tx(STORE_CACHE, "readonly");
    const all = await reqToPromise(store.getAll());
    for (const entry of all) {
      if (entry.sheet !== sheet || !entry.data) continue;
      const row = entry.data.find(r => r._rowNum === rowNum);
      if (row) return { row, headers: entry.headers };
    }
  } catch { /* no cache available */ }
  return null;
}

// ─── WRITE QUEUE ──────────────────────────────────────────────────────────────
// Plain Date.now() isn't fine-grained enough to order two writes made in the
// same millisecond (easily possible for two quick edits), and getQueue()'s
// sort must be a strict, stable, call-order ordering — flushing queued
// updates to the SAME row out of order would silently apply them backwards.
// A tiny monotonic fractional tie-breaker fixes that while queuedAt still
// reads as a normal timestamp everywhere else (e.g. any future "queued at"
// display).
let _seq = 0;
const nextQueuedAt = () => Date.now() + (++_seq % 1000) / 1000;

export async function enqueueWrite(entry) {
  const localId = entry.localId || `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const full = { status: "pending", queuedAt: nextQueuedAt(), ...entry, localId };
  const store = await tx(STORE_QUEUE, "readwrite");
  await reqToPromise(store.put(full));
  notify();
  return localId;
}

export async function getQueue() {
  try {
    const store = await tx(STORE_QUEUE, "readonly");
    const all = await reqToPromise(store.getAll());
    return all.sort((a, b) => a.queuedAt - b.queuedAt);
  } catch { return []; }
}

export async function getQueueItem(localId) {
  try {
    const store = await tx(STORE_QUEUE, "readonly");
    return await reqToPromise(store.get(localId));
  } catch { return undefined; }
}

export async function updateQueueItem(localId, patch) {
  const store = await tx(STORE_QUEUE, "readwrite");
  const existing = await reqToPromise(store.get(localId));
  if (!existing) return;
  await reqToPromise(store.put({ ...existing, ...patch }));
  notify();
}

export async function removeQueueItem(localId) {
  const store = await tx(STORE_QUEUE, "readwrite");
  await reqToPromise(store.delete(localId));
  notify();
}

// ─── DRAFT SERIAL PLACEHOLDERS ─────────────────────────────────────────────────
// Hands out DRAFT-<PREFIX>-<n> ids while offline so nextSerial() never has to
// guess a real "001"-style serial (which risks a duplicate once two people
// have been offline at once). Real serial is assigned by the backend at
// sync time — see flushQueue() in utils.js.
export async function nextDraftSerial(sheet, prefix, fy) {
  const counterKey = `${sheet}:${prefix}:${fy}`;
  const store = await tx(STORE_DRAFT, "readwrite");
  const existing = await reqToPromise(store.get(counterKey));
  const n = (existing?.n || 0) + 1;
  await reqToPromise(store.put({ counterKey, sheet, prefix, fy, n }));
  return `DRAFT-${prefix}-${n}`;
}

export async function clearAllOfflineData() {
  const db = await openDB();
  await Promise.all([STORE_CACHE, STORE_QUEUE, STORE_DRAFT].map(name =>
    reqToPromise(db.transaction(name, "readwrite").objectStore(name).clear())
  ));
  notify();
}
