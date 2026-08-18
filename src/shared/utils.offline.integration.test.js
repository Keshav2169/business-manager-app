import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Force sheetsAPI out of demo mode for this file only, and give it a fetch
// mock we fully control so we can simulate "online", "offline"
// (network-level failure), and "server says no" (application-level error)
// independently — that distinction is the whole point of the offline
// feature (see isNetworkFailure in offlineMerge.js).
process.env.VITE_API_URL = "https://script.google.com/macros/s/test-deployment/exec";
process.env.VITE_API_KEY = "test-key";

const HEADERS = ["Job ID", "FY", "Created At", "Created By", "Client", "Status"];
const ITEM_HEADERS = ["Invoice No.", "FY", "SR No.", "Item Description", "HSN/SAC Code", "Quantity", "Unit", "Rate (Rs)", "Amount (Rs)", "Created At", "Deleted"];
// Minimal slice of the real "IndiaMART Leads" headers — just enough columns
// to exercise the generic append/update/delete/nextSerial/read dispatcher
// for a NEW sheet name, which is exactly what Phase 2 of
// indiamart-leads-prompt.md asks to be confirmed (no new backend actions
// needed — the existing generic CRUD just has to resolve correctly).
const LEAD_HEADERS = ["Lead ID", "FY", "Created At", "Created By", "Company Name", "Status"];
let serverRows;
let serverItemRows;
let serverLeadRows;
let callOrder; // records POST action names in the order the mock server received them
let mode; // "online" | "offline" | "servererror"

function freshServer() {
  serverRows = [
    { "Job ID": "KE/JOB/26-27/001", "FY": "2026-27", "Created At": "10/8/2026, 9:00:00 am", "Created By": "Keshav Sharma", "Client": "Dhampur Sugar Mills", "Status": "Enquiry", _rowNum: 2 },
  ];
  serverItemRows = [];
  serverLeadRows = [];
  callOrder = [];
}

function mockFetch(url, opts) {
  if (mode === "offline") {
    return Promise.reject(new TypeError("Failed to fetch"));
  }
  if (mode === "servererror") {
    return Promise.resolve({ ok: true, json: async () => ({ error: "Access denied — your role does not have access" }) });
  }
  // "online": act like the Apps Script backend for the handful of actions we exercise.
  if (opts?.method === "POST") {
    const body = JSON.parse(opts.body);
    callOrder.push(body.action);
    if (body.action === "append") {
      // A row whose Client is literally "FAIL_ME" simulates a genuine
      // (non-network) server-side rejection for that ONE entry — e.g. a
      // validation failure — used to test flushQueue's per-entry error
      // isolation without touching the other entries in the same batch.
      if (body.row?.[4] === "FAIL_ME") {
        return Promise.resolve({ ok: true, json: async () => ({ error: "Validation failed for this record" }) });
      }
      if (body.sheet === "IndiaMART Leads") {
        const obj = {}; LEAD_HEADERS.forEach((h, i) => { obj[h] = body.row[i] ?? ""; });
        obj._rowNum = serverLeadRows.length + 2;
        serverLeadRows.push(obj);
        return Promise.resolve({ ok: true, json: async () => ({ status: "ok" }) });
      }
      const _rowNum = serverRows.length + 2;
      const obj = {}; HEADERS.forEach((h, i) => { obj[h] = body.row[i] ?? ""; });
      obj._rowNum = _rowNum;
      serverRows.push(obj);
      return Promise.resolve({ ok: true, json: async () => ({ status: "ok" }) });
    }
    if (body.action === "update") {
      if (body.sheet === "IndiaMART Leads") {
        const idx = serverLeadRows.findIndex(r => r._rowNum === body.rowIndex);
        if (idx > -1) LEAD_HEADERS.forEach((h, i) => { if (body.updates[i] !== undefined) serverLeadRows[idx][h] = body.updates[i]; });
        return Promise.resolve({ ok: true, json: async () => ({ status: "ok" }) });
      }
      const idx = serverRows.findIndex(r => r._rowNum === body.rowIndex);
      if (idx > -1) HEADERS.forEach((h, i) => { if (body.updates[i] !== undefined) serverRows[idx][h] = body.updates[i]; });
      return Promise.resolve({ ok: true, json: async () => ({ status: "ok" }) });
    }
    if (body.action === "delete") {
      if (body.sheet === "IndiaMART Leads") {
        const idx = serverLeadRows.findIndex(r => r._rowNum === body.rowIndex);
        if (idx > -1) serverLeadRows[idx]["Status"] = "Deleted";
        return Promise.resolve({ ok: true, json: async () => ({ status: "ok" }) });
      }
      const idx = serverRows.findIndex(r => r._rowNum === body.rowIndex);
      if (idx > -1) serverRows[idx]["Status"] = "Deleted";
      return Promise.resolve({ ok: true, json: async () => ({ status: "ok" }) });
    }
    if (body.action === "saveInvoiceItems") {
      // A row whose description is literally "FAIL_ITEM" simulates a
      // genuine server-side rejection of the items write, to test that the
      // header write never gets attempted in that case.
      if ((body.items || []).some(r => r[3] === "FAIL_ITEM")) {
        return Promise.resolve({ ok: true, json: async () => ({ error: "Validation failed for an item row" }) });
      }
      // Replace-on-edit: soft-delete existing rows for this invoiceNo, then append fresh ones.
      serverItemRows.forEach(r => { if (r["Invoice No."] === body.invoiceNo) r["Deleted"] = true; });
      (body.items || []).forEach(row => {
        const obj = {}; ITEM_HEADERS.forEach((h, i) => { obj[h] = row[i] ?? ""; });
        obj._rowNum = serverItemRows.length + 2;
        serverItemRows.push(obj);
      });
      return Promise.resolve({ ok: true, json: async () => ({ status: "ok", count: (body.items || []).length }) });
    }
  }
  // GET (reads + nextSerial + bulkRead)
  const u = new URL(url);
  if (u.searchParams.get("action") === "nextSerial") {
    // Built from the ACTUAL prefix/sheet/fy params sent, not hardcoded —
    // this is what lets a test confirm nextSerial("IndiaMART Leads","IM",fy)
    // really does produce an IM-prefixed id over the wire, not just a JOB
    // one that happens to look plausible.
    const prefix = u.searchParams.get("prefix") || "JOB";
    const fyParam = u.searchParams.get("fy") || "2026-27";
    return Promise.resolve({ ok: true, json: async () => ({ serial: `KE/${prefix}/${fyParam}/001` }) });
  }
  if (u.searchParams.get("action") === "bulkRead") {
    // Mirrors apps-script-backend.js's bulkRead: one response keyed by sheet
    // name, "Jobs" gets the real fixture data, anything else gets an empty
    // (but valid) sheet — good enough to exercise the batching path without
    // needing per-sheet fixtures for every module.
    const names = (u.searchParams.get("sheets") || "").split(",").filter(Boolean);
    const out = {};
    names.forEach(name => {
      out[name] = name === "Jobs"
        ? { status: "ok", sheet: name, fy: "2026-27", headers: HEADERS, data: serverRows, count: serverRows.length }
        : { status: "ok", sheet: name, fy: "2026-27", headers: HEADERS, data: [], count: 0 };
    });
    return Promise.resolve({ ok: true, json: async () => out });
  }
  if (u.searchParams.get("sheet") === "Sales Invoice Items") {
    const live = serverItemRows.filter(r => !r["Deleted"]);
    return Promise.resolve({ ok: true, json: async () => ({ status: "ok", sheet: "Sales Invoice Items", fy: null, headers: ITEM_HEADERS, data: live, count: live.length }) });
  }
  if (u.searchParams.get("sheet") === "IndiaMART Leads") {
    return Promise.resolve({ ok: true, json: async () => ({ status: "ok", sheet: "IndiaMART Leads", fy: u.searchParams.get("fy"), headers: LEAD_HEADERS, data: serverLeadRows, count: serverLeadRows.length }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({ status: "ok", sheet: "Jobs", fy: "2026-27", headers: HEADERS, data: serverRows, count: serverRows.length }) });
}

describe("sheetsAPI offline integration", () => {
  let sheetsAPI, offlineDB;

  beforeEach(async () => {
    if (offlineDB) { await offlineDB.closeDB(); }
    vi.resetModules();
    freshServer();
    mode = "online";
    global.fetch = vi.fn(mockFetch);
    // Each test gets a clean IndexedDB database too, not just a clean module registry.
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("ke-suite-offline");
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
    const utils = await import("./utils.js");
    offlineDB = await import("./offlineDB.js");
    sheetsAPI = utils.sheetsAPI;
    expect(utils.IS_DEMO).toBe(false);
  });

  it("caches data on a successful online read", async () => {
    const r = await sheetsAPI.read("Jobs", "2026-27");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]["Job ID"]).toBe("KE/JOB/26-27/001");
  });

  it("readMany(['Jobs','Clients'], fy) fetches both sheets in exactly one network call", async () => {
    const r = await sheetsAPI.readMany(["Jobs", "Clients"], "2026-27");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(r.Jobs.data).toHaveLength(1);
    expect(r.Jobs.data[0]["Job ID"]).toBe("KE/JOB/26-27/001");
    expect(r.Clients.data).toHaveLength(0);
  });

  it("serves the last cached read when offline instead of erroring", async () => {
    await sheetsAPI.read("Jobs", "2026-27"); // prime the cache while online
    mode = "offline";
    const r = await sheetsAPI.read("Jobs", "2026-27");
    expect(r.offline).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]["Job ID"]).toBe("KE/JOB/26-27/001");
  });

  it("returns a clear error (not a crash) when offline with nothing cached yet", async () => {
    mode = "offline";
    const r = await sheetsAPI.read("Jobs", "2026-27");
    expect(r.error).toMatch(/offline/i);
  });

  it("surfaces a genuine server error immediately instead of queuing it", async () => {
    mode = "servererror";
    const r = await sheetsAPI.append("Jobs", ["KE/JOB/26-27/002", "2026-27", "t", "u", "New Client", "Enquiry"]);
    expect(r.error).toMatch(/access denied/i);
    expect(r.queued).toBeUndefined();
  });

  it("queues an append on a genuine network failure, with a DRAFT placeholder id already baked in by the caller", async () => {
    mode = "offline";
    const row = ["DRAFT-JOB-1", "2026-27", "12/8/2026, 9:00:00 am", "Keshav Sharma", "New Client", "Enquiry"];
    const res = await sheetsAPI.append("Jobs", row);
    expect(res.status).toBe("queued");
    expect(res.queued).toBe(true);
    const queue = await sheetsAPI.getPendingWrites();
    expect(queue).toHaveLength(1);
    expect(queue[0].action).toBe("append");
  });

  it("update()/softDelete() fail fast with a clear error on a null rowIndex (a not-yet-synced create) instead of ever queuing an unrecoverable retry", async () => {
    mode = "online";
    const upd = await sheetsAPI.update("Jobs", null, ["x"]);
    expect(upd.error).toMatch(/hasn't finished syncing/i);
    expect(upd.queued).toBeUndefined();

    const del = await sheetsAPI.softDelete("Jobs", undefined);
    expect(del.error).toMatch(/hasn't finished syncing/i);
    expect(del.queued).toBeUndefined();

    // Confirm this never reaches the queue, even offline — the whole point
    // is that a queued entry with rowIndex:null could never sync, ever.
    mode = "offline";
    const updOffline = await sheetsAPI.update("Jobs", null, ["x"]);
    expect(updOffline.error).toMatch(/hasn't finished syncing/i);
    expect((await sheetsAPI.getPendingWrites())).toHaveLength(0);
  });

  it("nextSerial hands out DRAFT-JOB-1, DRAFT-JOB-2... offline instead of falling back to a real-looking 001", async () => {
    mode = "offline";
    const s1 = await sheetsAPI.nextSerial("Jobs", "JOB", "2026-27");
    const s2 = await sheetsAPI.nextSerial("Jobs", "JOB", "2026-27");
    expect(s1).toBe("DRAFT-JOB-1");
    expect(s2).toBe("DRAFT-JOB-2");
  });

  it("a queued offline append shows up in read() results merged with real data, then disappears once synced", async () => {
    await sheetsAPI.read("Jobs", "2026-27"); // prime cache
    mode = "offline";
    const draftId = await sheetsAPI.nextSerial("Jobs", "JOB", "2026-27");
    await sheetsAPI.append("Jobs", [draftId, "2026-27", "t", "Keshav Sharma", "Offline Client", "Enquiry"]);
    const offlineRead = await sheetsAPI.read("Jobs", "2026-27");
    expect(offlineRead.data.map(r => r["Job ID"])).toContain(draftId);
    const draftRow = offlineRead.data.find(r => r["Job ID"] === draftId);
    expect(draftRow._pendingSync).toBe(true);

    mode = "online";
    const flush = await sheetsAPI.flushQueue();
    expect(flush.synced).toBe(1);
    expect(flush.conflicts).toBe(0);
    const afterSync = await sheetsAPI.read("Jobs", "2026-27");
    expect(afterSync.data.some(r => r["Job ID"].startsWith("DRAFT-"))).toBe(false);
    expect(afterSync.data.some(r => r.Client === "Offline Client")).toBe(true);
  });

  it("queues an update offline, capturing a baseline, and syncs cleanly if nobody else touched the row", async () => {
    await sheetsAPI.read("Jobs", "2026-27"); // prime cache with the real row (_rowNum 2)
    mode = "offline";
    const editedRow = ["KE/JOB/26-27/001", "2026-27", "13/8/2026, 9:00:00 am", "Keshav Sharma", "Dhampur Sugar Mills", "Scheduled"];
    const res = await sheetsAPI.update("Jobs", 2, editedRow);
    expect(res.status).toBe("queued");

    const offlineRead = await sheetsAPI.read("Jobs", "2026-27");
    expect(offlineRead.data[0].Status).toBe("Scheduled");
    expect(offlineRead.data[0]._pendingSync).toBe(true);

    mode = "online";
    const flush = await sheetsAPI.flushQueue();
    expect(flush.synced).toBe(1);
    expect(flush.conflicts).toBe(0);
    expect(serverRows[0].Status).toBe("Scheduled");
  });

  it("detects a genuine conflict when someone else edited the row while offline, and does not overwrite it", async () => {
    await sheetsAPI.read("Jobs", "2026-27"); // baseline: Created By "Keshav Sharma"
    mode = "offline";
    const editedRow = ["KE/JOB/26-27/001", "2026-27", "13/8/2026, 9:00:00 am", "Keshav Sharma", "Dhampur Sugar Mills", "Scheduled"];
    await sheetsAPI.update("Jobs", 2, editedRow);

    // Someone else edits the same row on the server while this user is still offline.
    mode = "online";
    serverRows[0]["Created At"] = "13/8/2026, 10:00:00 am";
    serverRows[0]["Created By"] = "Staff User";
    serverRows[0]["Status"] = "In Progress";

    const flush = await sheetsAPI.flushQueue();
    expect(flush.synced).toBe(0);
    expect(flush.conflicts).toBe(1);
    // Must NOT have overwritten their change.
    expect(serverRows[0].Status).toBe("In Progress");
    expect(serverRows[0]["Created By"]).toBe("Staff User");

    const queue = await sheetsAPI.getPendingWrites();
    expect(queue[0].status).toBe("conflict");
    expect(queue[0].theirs.createdBy).toBe("Staff User");
  });

  it("resolveConflict('theirs') drops the queued edit without touching the server", async () => {
    await sheetsAPI.read("Jobs", "2026-27");
    mode = "offline";
    await sheetsAPI.update("Jobs", 2, ["KE/JOB/26-27/001", "2026-27", "t", "Keshav Sharma", "Dhampur Sugar Mills", "Scheduled"]);
    mode = "online";
    serverRows[0]["Created By"] = "Staff User"; serverRows[0]["Created At"] = "later"; serverRows[0].Status = "In Progress";
    await sheetsAPI.flushQueue();
    const [conflict] = await sheetsAPI.getPendingWrites();

    const res = await sheetsAPI.resolveConflict(conflict.localId, "theirs");
    expect(res.status).toBe("ok");
    expect(await sheetsAPI.getPendingWrites()).toHaveLength(0);
    expect(serverRows[0].Status).toBe("In Progress"); // untouched — theirs wins
  });

  it("resolveConflict('mine') force-pushes the offline edit over the live row", async () => {
    await sheetsAPI.read("Jobs", "2026-27");
    mode = "offline";
    await sheetsAPI.update("Jobs", 2, ["KE/JOB/26-27/001", "2026-27", "t", "Keshav Sharma", "Dhampur Sugar Mills", "Scheduled"]);
    mode = "online";
    serverRows[0]["Created By"] = "Staff User"; serverRows[0]["Created At"] = "later"; serverRows[0].Status = "In Progress";
    await sheetsAPI.flushQueue();
    const [conflict] = await sheetsAPI.getPendingWrites();

    const res = await sheetsAPI.resolveConflict(conflict.localId, "mine");
    expect(res.status).toBe("ok");
    expect(await sheetsAPI.getPendingWrites()).toHaveLength(0);
    expect(serverRows[0].Status).toBe("Scheduled"); // mine wins
  });

  it("two sequential offline edits to the SAME row sync without falsely conflicting with each other", async () => {
    await sheetsAPI.read("Jobs", "2026-27");
    mode = "offline";
    await sheetsAPI.update("Jobs", 2, ["KE/JOB/26-27/001", "2026-27", "t1", "Keshav Sharma", "Dhampur Sugar Mills", "Scheduled"]);
    await sheetsAPI.update("Jobs", 2, ["KE/JOB/26-27/001", "2026-27", "t2", "Keshav Sharma", "Dhampur Sugar Mills", "In Progress"]);
    mode = "online";
    const flush = await sheetsAPI.flushQueue();
    expect(flush.synced).toBe(2);
    expect(flush.conflicts).toBe(0);
    expect(serverRows[0].Status).toBe("In Progress");
  });

  it("a non-network error during sync (e.g. permission revoked) is marked as error and kept, not retried forever as pending", async () => {
    await sheetsAPI.read("Jobs", "2026-27");
    mode = "offline";
    const draftId = await sheetsAPI.nextSerial("Jobs", "JOB", "2026-27");
    await sheetsAPI.append("Jobs", [draftId, "2026-27", "t", "Keshav Sharma", "X", "Enquiry"]);
    mode = "servererror";
    const flush = await sheetsAPI.flushQueue();
    expect(flush.failed).toBe(1);
    const queue = await sheetsAPI.getPendingWrites();
    expect(queue[0].status).toBe("error");
  });

  it("flushQueue isolates a non-network error on one entry — the rest of a 3-entry queue still syncs", async () => {
    await sheetsAPI.read("Jobs", "2026-27");
    mode = "offline";
    const id1 = await sheetsAPI.nextSerial("Jobs", "JOB", "2026-27");
    await sheetsAPI.append("Jobs", [id1, "2026-27", "t", "Keshav Sharma", "Client A", "Enquiry"]);
    const id2 = await sheetsAPI.nextSerial("Jobs", "JOB", "2026-27");
    await sheetsAPI.append("Jobs", [id2, "2026-27", "t", "Keshav Sharma", "FAIL_ME", "Enquiry"]);
    const id3 = await sheetsAPI.nextSerial("Jobs", "JOB", "2026-27");
    await sheetsAPI.append("Jobs", [id3, "2026-27", "t", "Keshav Sharma", "Client C", "Enquiry"]);
    mode = "online";
    const flush = await sheetsAPI.flushQueue();
    // Entry #2's genuine server rejection must not block #1 or #3 — the loop
    // only breaks on a NETWORK failure (see isNetworkFailure in flushQueue),
    // a non-network error marks that one entry and continues.
    expect(flush.synced).toBe(2);
    expect(flush.conflicts).toBe(0);
    expect(flush.failed).toBe(1);
    const queue = await sheetsAPI.getPendingWrites();
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe("error");
    expect(queue[0].row[4]).toBe("FAIL_ME");
    expect(serverRows.some(r => r.Client === "Client A")).toBe(true);
    expect(serverRows.some(r => r.Client === "Client C")).toBe(true);
    expect(serverRows.some(r => r.Client === "FAIL_ME")).toBe(false);
  });

  // ─── Multi-item Sales Invoices (Phase 6 integration tests) ───────────────────
  it("saveInvoiceItems: saving 3 items writes them before the invoice header, both keyed to the same Invoice No.", async () => {
    const invoiceNo = "KE/INV/2026-27/900";
    const itemRows = [
      ["Turbine Bearing SKF 6310", "84821010", 2, "Pcs", 1200],
      ["Carbon Seal Ring 50mm", "84842000", 4, "Pcs", 850],
      ["Mobil DTE Oil 32", "27101980", 1, "Can", 2800],
    ].map(([description, hsn, qty, unit, rate], i) => [invoiceNo, "2026-27", i + 1, description, hsn, qty, unit, rate, qty * rate, "t", false]);

    const itemsRes = await sheetsAPI.saveInvoiceItems(invoiceNo, "2026-27", itemRows);
    expect(itemsRes.error).toBeUndefined();
    expect(itemsRes.count).toBe(3);

    const headerRow = ["KE/INV/2026-27/900", "2026-27", "t", "u", "14/8/2026", "Client X", "", "", "", "", "", 0, 0, 0, 0, 0, 0, 0, "IGST", 0, 0, 0, 0, "No", 0, 0, 0, 0, "30 days", "", "", "", "", "Unpaid", 0, "", "", "", "", ""];
    await sheetsAPI.append("Sales Invoices", headerRow);

    expect(callOrder).toEqual(["saveInvoiceItems", "append"]);

    const saved = serverItemRows.filter(r => r["Invoice No."] === invoiceNo && !r["Deleted"]);
    expect(saved).toHaveLength(3);
    expect(saved.every(r => r["Invoice No."] === invoiceNo)).toBe(true);
  });

  it("saveInvoiceItems: a simulated items-write failure means the header write is never attempted", async () => {
    const invoiceNo = "KE/INV/2026-27/901";
    const badItemRow = [invoiceNo, "2026-27", 1, "FAIL_ITEM", "", 1, "Pcs", 100, 100, "t", false];

    const itemsRes = await sheetsAPI.saveInvoiceItems(invoiceNo, "2026-27", [badItemRow]);
    expect(itemsRes.error).toMatch(/validation failed/i);

    // Mirrors Invoices.jsx's handleSave: on an items error, return before
    // ever calling sheetsAPI.append/update for the header row.
    expect(callOrder).toEqual(["saveInvoiceItems"]);
    expect(serverRows.some(r => r["Job ID"] === invoiceNo)).toBe(false);
  });

  it("getInvoiceItems filters to one invoice, excludes soft-deleted rows, and sorts by SR No.", async () => {
    const invoiceNo = "KE/INV/2026-27/902";
    const rowsV1 = [
      [invoiceNo, "2026-27", 2, "Second item", "", 1, "Pcs", 200, 200, "t", false],
      [invoiceNo, "2026-27", 1, "First item", "", 1, "Pcs", 100, 100, "t", false],
    ];
    await sheetsAPI.saveInvoiceItems(invoiceNo, "2026-27", rowsV1);
    // A different invoice's items must never leak into this invoice's read.
    await sheetsAPI.saveInvoiceItems("KE/INV/2026-27/903", "2026-27", [["KE/INV/2026-27/903", "2026-27", 1, "Other invoice's item", "", 1, "Pcs", 50, 50, "t", false]]);

    let items = await sheetsAPI.getInvoiceItems(invoiceNo);
    expect(items.map(i => i.description)).toEqual(["First item", "Second item"]);

    // Edit: replace-on-edit removes "Second item" — soft-deleted rows must not resurrect.
    const rowsV2 = [[invoiceNo, "2026-27", 1, "First item", "", 1, "Pcs", 100, 100, "t", false]];
    await sheetsAPI.saveInvoiceItems(invoiceNo, "2026-27", rowsV2);
    items = await sheetsAPI.getInvoiceItems(invoiceNo);
    expect(items.map(i => i.description)).toEqual(["First item"]);
  });

  it("offline queue: a queued saveInvoiceItems write and a queued header append for the same invoice replay in the original order after reconnect", async () => {
    mode = "offline";
    const invoiceNo = "DRAFT-INV-1";
    const itemRows = [[invoiceNo, "2026-27", 1, "Offline item", "", 1, "Pcs", 500, 500, "t", false]];
    const itemsRes = await sheetsAPI.saveInvoiceItems(invoiceNo, "2026-27", itemRows);
    expect(itemsRes.status).toBe("queued");
    const headerRes = await sheetsAPI.append("Jobs", ["DRAFT-JOB-x", "2026-27", "t", "u", "Client", "Enquiry"]);
    expect(headerRes.status).toBe("queued");

    const queue = await sheetsAPI.getPendingWrites();
    expect(queue.map(q => q.action)).toEqual(["saveInvoiceItems", "append"]);

    mode = "online";
    const flush = await sheetsAPI.flushQueue();
    expect(flush.synced).toBe(2);
    expect(flush.failed).toBe(0);
    // The items write reached the mock server BEFORE the header append —
    // replaying the header first would recreate the exact
    // wrong-Material-Charges-with-no-line-items problem Phase 2 exists to avoid.
    expect(callOrder).toEqual(["saveInvoiceItems", "append"]);
  });

  // ─── IndiaMART Leads (Phase 2 + 6 checks — generic CRUD, no new backend actions) ───
  it("nextSerial(\"IndiaMART Leads\",\"IM\",fy) produces an IM-prefixed id, not a JOB-prefixed one — confirms the generic dispatcher passes prefix/sheet through correctly", async () => {
    const serial = await sheetsAPI.nextSerial("IndiaMART Leads", "IM", "2026-27");
    expect(serial).toBe("KE/IM/2026-27/001");
  });

  it("append/read round-trip for the new \"IndiaMART Leads\" sheet through the existing generic dispatcher — no sheet-specific backend code needed", async () => {
    const row = ["KE/IM/2026-27/001", "2026-27", "t", "Keshav Sharma", "Rohilkhand Sugar Works", "New"];
    const appendRes = await sheetsAPI.append("IndiaMART Leads", row);
    expect(appendRes.error).toBeUndefined();

    const readRes = await sheetsAPI.read("IndiaMART Leads", "2026-27");
    expect(readRes.data).toHaveLength(1);
    expect(readRes.data[0]["Company Name"]).toBe("Rohilkhand Sugar Works");
  });

  it("update/softDelete round-trip for \"IndiaMART Leads\" through the same generic dispatcher used by every other sheet", async () => {
    await sheetsAPI.append("IndiaMART Leads", ["KE/IM/2026-27/002", "2026-27", "t", "Keshav Sharma", "Ganga Paper Mills", "New"]);
    const readRes = await sheetsAPI.read("IndiaMART Leads", "2026-27");
    const rowIndex = readRes.data[0]._rowNum;

    const updRes = await sheetsAPI.update("IndiaMART Leads", rowIndex, ["KE/IM/2026-27/002", "2026-27", "t", "Keshav Sharma", "Ganga Paper Mills", "Contacted"]);
    expect(updRes.error).toBeUndefined();
    let after = await sheetsAPI.read("IndiaMART Leads", "2026-27");
    expect(after.data[0].Status).toBe("Contacted");

    const delRes = await sheetsAPI.softDelete("IndiaMART Leads", rowIndex);
    expect(delRes.error).toBeUndefined();
    after = await sheetsAPI.read("IndiaMART Leads", "2026-27");
    expect(after.data[0].Status).toBe("Deleted");
  });

  it("save-failure: a genuine server error on an IndiaMART Leads save surfaces immediately (not queued) — mirrors the Invoices.jsx/Clients.jsx \"stays open, shows red toast\" contract this codebase relies on", async () => {
    mode = "servererror";
    const res = await sheetsAPI.append("IndiaMART Leads", ["KE/IM/2026-27/003", "2026-27", "t", "Keshav Sharma", "Elite Cement Works", "New"]);
    expect(res.error).toMatch(/access denied/i);
    expect(res.queued).toBeUndefined();
    // The component's handleSave treats any res.error as _saveFailed, keeps
    // the modal open, and never fires onRefresh — this confirms the API
    // layer actually returns the shape (an `error` string, no `queued`
    // flag) that logic branches on.
  });
});
