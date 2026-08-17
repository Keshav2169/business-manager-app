// ─── PURE OFFLINE-SYNC HELPERS ──────────────────────────────────────────────────
// No IndexedDB, no fetch — just data transforms — so these can be unit tested
// directly (see offlineMerge.test.js) without mocking the browser.

// Every sheet's row-builder stamps a fresh timestamp+user into columns 2-3
// (0-indexed) at save time (see buildXxxRow in utils.js / SCHEMA in
// apps-script-backend.js: "...","Created At","Created By",...). That existing
// data is what conflict detection reuses instead of adding new columns.
export const CREATED_AT_COL = 2;
export const CREATED_BY_COL = 3;
export const CREATED_AT_HEADER = "Created At";
export const CREATED_BY_HEADER = "Created By";

// Is this a fetch()-level failure (offline, DNS, CORS, timeout) as opposed to
// an application-level error the server responded with (bad request, access
// denied, validation failure)? Only the former should ever get queued —
// queuing a genuine server/validation error would silently mask it as
// "pending sync" instead of surfacing it, which is exactly what we must not do.
export function isNetworkFailure(err) {
  if (!err) return false;
  if (err.isNetworkError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // fetch()'s own failure mode in every major browser
  const msg = String(err.message || err).toLowerCase();
  return /failed to fetch|networkerror|load failed|network request failed|the internet connection appears to be offline/.test(msg);
}

// Applies queued-but-not-yet-synced writes on top of a freshly-read (or
// cached) sheet result, so every caller of sheetsAPI.read() — online or
// offline — sees one consistent view that already includes their own
// pending edits. `queue` is the full write queue; only entries for `sheet`
// are used. Rows gain `_pendingSync`/`_localId`/`_queuedAction` (and
// `_conflict` once flagged) so the UI can show a "pending sync" indicator
// without every module needing to know about the queue.
export function mergeQueueIntoResult(sheet, fy, result, queue) {
  const relevant = (queue || []).filter(q => q.sheet === sheet);
  if (!relevant.length || !result || result.error || !result.headers) return result;

  const headers = result.headers;
  let data = result.data ? result.data.slice() : [];

  relevant.forEach(q => {
    if (q.action === "append") {
      // Only surface a queued append under the FY tab it belongs to (or
      // when the caller asked for all FYs at once).
      if (fy && q.fy && q.fy !== fy) return;
      const obj = {};
      headers.forEach((h, i) => { obj[h] = q.row?.[i] ?? ""; });
      obj._rowNum = null;
      obj._pendingSync = true;
      obj._localId = q.localId;
      obj._queuedAction = "append";
      if (q.status === "error") { obj._syncError = q.errorMsg; }
      data.push(obj);
      return;
    }

    const idx = data.findIndex(r => r._rowNum === q.rowIndex);
    if (idx === -1) return; // row not in this view (different FY, already gone, etc.)

    if (q.action === "update") {
      const merged = { ...data[idx] };
      headers.forEach((h, i) => { if (q.row?.[i] !== undefined) merged[h] = q.row[i]; });
      merged._pendingSync = true;
      merged._localId = q.localId;
      merged._queuedAction = "update";
      if (q.status === "conflict") { merged._conflict = true; }
      if (q.status === "error") { merged._syncError = q.errorMsg; }
      data[idx] = merged;
    } else if (q.action === "softDelete") {
      const merged = { ...data[idx] };
      const statusColIdx = headers.indexOf("Status");
      if (statusColIdx > -1) merged[headers[statusColIdx]] = "Deleted";
      merged._pendingSync = true;
      merged._localId = q.localId;
      merged._queuedAction = "softDelete";
      if (q.status === "conflict") { merged._conflict = true; }
      if (q.status === "error") { merged._syncError = q.errorMsg; }
      data[idx] = merged;
    }
  });

  return { ...result, data, count: data.length };
}

// True baseline vs current-live comparison for conflict detection. `baseline`
// is what the offline edit was made against (captured from cache at queue
// time); `live` is columns 2-3 as they stand on the sheet right now. No
// baseline (cache was cold) means we can't detect a conflict either way —
// callers treat that as "proceed", documented at the call site.
export function rowsConflict(baseline, live) {
  if (!baseline) return false;
  return baseline.createdAt !== live.createdAt || baseline.createdBy !== live.createdBy;
}
