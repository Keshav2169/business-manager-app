// ═══════════════════════════════════════════════════════════════════════════════
// KESHAV ENTERPRISES — GOOGLE APPS SCRIPT BACKEND v4
// ═══════════════════════════════════════════════════════════════════════════════
// SETUP STEPS:
//   1. script.google.com → New Project → paste this file
//   2. Replace SHEET_ID with your Google Sheet ID
//   3. Replace CONFIG values (email, company details)
//   4. Run initAllSheets() once to create all tabs with headers
//   5. Deploy → New Deployment → Web App → Execute as Me → Anyone
//   6. Set triggers: dailyAlerts → 8 AM, monthlyReport → 1st of month
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  SHEET_ID:      "1JJY9sSVmHYiJzUC32HONERoObSuzisaNXMN9Gs9O7DQ",
  // Shared secret the frontend must send on every request (query param `key` on GET,
  // `key` field in the JSON body on POST). Generate a long random string yourself —
  // e.g. run `=REPT(CHAR(65+RANDBETWEEN(0,57)),1)` 32x in a scratch sheet, or use
  // https://www.uuidgenerator.net — and put the SAME value in the frontend's
  // VITE_API_KEY env var. Do not reuse the Admin/Staff/CA passcodes for this.
  //
  // IMPORTANT: this is a DETERRENT, not real authentication. It ships baked
  // into the client JS bundle (unavoidable for any static SPA — view-source
  // reveals it), so it only stops casual/automated scraping of the bare Web
  // App URL. The real access control is per-request passcode -> role
  // resolution in resolveRole(), done server-side on every call.
  API_KEY:       "UtCSKzGjPWYlkWpv0_-_R164yBgP3aDH", // generated for you — must match VITE_API_KEY in .env / Vercel exactly. Generate your own instead if you prefer (any long random string works).
  ALERT_EMAIL:   "keshav2169@gmail.com",
  COMPANY_NAME:  "Keshav Enterprises",
  COMPANY_ADDR:  "Shamli, Uttar Pradesh",
  COMPANY_GSTIN: "09XXXXXXXXXXXXX",
  COMPANY_PAN:   "XXXXXPXXXXXX",
  COMPANY_PHONE: "+91-XXXXXXXXXX",
  APP_URL:       "https://your-app.vercel.app",
  PETTY_CASH_FLOAT: 10000,
  LOW_STOCK_ALERT:  true,
  AR_ALERT_DAYS:    60,
  FD_ALERT_DAYS:    30,
};

// ─── SHEET SCHEMA ─────────────────────────────────────────────────────────────
// Every sheet has exact column definitions.
// Column order here = column order in Sheets = column order in buildXxxRow() in utils.js
// NEVER change column order without updating both files.

const SCHEMA = {

  Jobs: {
    headers: [
      "Job ID","FY","Created At","Created By",
      "Client","Turbine / Equipment","OEM Make","Capacity",
      "Job Type","Status","Start Date","Completion Date",
      "Client PO No.","PO Date","PO Value (Rs)",
      "Site Location","Site Engineer","Assigned To",
      "Labour Charges (Rs)","Material Charges (Rs)","Travel Charges (Rs)","Other Charges (Rs)",
      "Estimated Value (Rs)","Scope of Work","Special Tools","Safety Requirements",
      "Work Permit No.","Last Overhaul Date","RPM","Lube Oil Type",
      "Warranty Period (Months)","Invoice Status","Remarks",
    ],
    freeze: 1, color: "#1B3A6B",
  },

  "Sales Invoices": {
    headers: [
      "Invoice No.","FY","Created At","Created By",
      "Invoice Date","Client","Job Reference","Client PO No.","PO Date",
      "Description","Scope Details",
      "Labour Charges (Rs)","Material Charges (Rs)","Travel Charges (Rs)","Other Charges (Rs)",
      "Subtotal (Rs)","Discount (Rs)","Taxable Amount (Rs)",
      "GST Type","CGST (Rs)","SGST (Rs)","IGST (Rs)","Total GST (Rs)",
      "TDS Applicable","TDS Rate %","TDS Amount (Rs)",
      "Grand Total (Rs)","Net Payable (Rs)",
      "Payment Terms","Due Date","Bank Name","Account No.","IFSC",
      "Payment Status","Amount Received (Rs)","Last Payment Date","Place of Supply","Remarks",
      // Added 2026-08-17 — appended at the END (not inserted earlier in the
      // row) so an already-live sheet only needs two new columns added after
      // its last existing column, with every prior column staying exactly
      // where FIELD_MAPS in constants.js already expects it.
      "Eway Bill No.","Vehicle No.",
    ],
    freeze: 1, color: "#1A7A4A",
  },

  "Purchase Invoices": {
    headers: [
      "Our Reference","FY","Created At","Created By",
      "Invoice Date","Vendor Invoice No.","Vendor Name",
      "Description","Job Reference","PO Reference","Category",
      "Basic Amount (Rs)","Discount (Rs)","Taxable Amount (Rs)",
      "GST Type","CGST (Rs)","SGST (Rs)","IGST (Rs)","Total GST (Rs)",
      "TDS Applicable","TDS Section","TDS Rate %","TDS Amount (Rs)",
      "Total Amount (Rs)","Net Payable (Rs)",
      "ITC Eligible","Payment Status","Payment Mode",
      "Amount Paid (Rs)","Payment Date","UTR / Cheque Ref.","Remarks",
    ],
    freeze: 1, color: "#B8860B",
  },

  Quotations: {
    headers: [
      "Quote No.","FY","Created At","Created By",
      "Client","Subject","Quote Date","Valid Till","Follow-up Date",
      "Value Ex-GST (Rs)","GST Rate %","GST Amount (Rs)","Total with GST (Rs)",
      "Discount %","Payment Terms","Delivery Terms",
      "Scope Notes","Prepared By","Revision","Status","Remarks",
    ],
    freeze: 1, color: "#C8961E",
  },

  Clients: {
    headers: [
      "Client Code","FY Added","Created At","Created By",
      "Company Name","Sector","Contact Person","Designation",
      "Mobile","Alt. Mobile","WhatsApp No.","Email","Alt. Email",
      "Address","City","State","PIN",
      "GSTIN","PAN","Credit Limit (Rs)","Payment Terms",
      "Annual Potential (Rs)","TDS Applicable","TDS Rate",
      "No. of Turbines","OEM Installed","Seasonal Dependency",
      "Decision Maker","Influencer / Recommender","Source","Status",
      "Next Follow-up","Last Visited Date","Outstanding (Rs)","Remarks",
    ],
    freeze: 1, color: "#1B3A6B",
  },

  Vendors: {
    headers: [
      "Vendor Code","FY Added","Created At","Created By",
      "Company Name","Category","Contact Person","Designation",
      "Mobile","Alt. Mobile","Email","City","State",
      "GSTIN","PAN","Bank Name","Account No.","IFSC","Account Type",
      "Payment Terms","Credit Limit Given (Rs)","MSE Status",
      "Products / Services","Rating","Status",
      "Last Order Date","Total Business Given (Rs)","Remarks",
    ],
    freeze: 1, color: "#0F766E",
  },

  Inventory: {
    headers: [
      "Item Code","FY","Created At","Created By",
      "Item Name","Category","HSN Code","Unit",
      "Opening Stock","Purchased Qty","Issued Qty","Closing Stock",
      "Reorder Level","Min. Order Qty","Lead Time (Days)",
      "Purchase Price (Rs)","Selling Price (Rs)","Stock Value (Rs)",
      "Primary Supplier","Alt. Supplier","Storage Location",
      "Condition","Shelf Life (Months)","Last Count Date","Remarks",
    ],
    freeze: 1, color: "#6B21A8",
  },

  Expenses: {
    headers: [
      "Voucher No.","FY","Created At","Created By",
      "Date","Category","Sub-Category","Description",
      "Vendor / Paid To","Payment Mode","Amount (Rs)","GST (Rs)","GST Type",
      "Total Amount (Rs)","Bill No.","Approved By",
      "Job Reference","Remarks",
    ],
    freeze: 1, color: "#C0392B",
  },

  "Petty Cash": {
    headers: [
      "Entry ID","FY","Created At","Created By",
      "Date","Type","Category","Description",
      "Paid To","Received From","Mode","Amount (Rs)",
      "Voucher / Bill No.","Job Reference","Approved By","Remarks",
    ],
    freeze: 1, color: "#B8860B",
  },

  Ledger: {
    headers: [
      "Voucher No.","FY","Created At","Created By",
      "Date","Party Name","Transaction Type","Narration",
      "Invoice Ref.","Cheque / UTR No.","Bank Name",
      "Debit (Rs)","Credit (Rs)","TDS (Rs)","GST (Rs)",
      "Due Date","Remarks",
    ],
    freeze: 1, color: "#1B3A6B",
  },

  TDS: {
    headers: [
      "TDS ID","FY","Created At","Created By",
      "Date","Type","Party Name","PAN",
      "Nature of Payment","TDS Section","Amount Paid (Rs)","TDS Rate %","TDS Amount (Rs)",
      "Quarter","Challan No.","Deposit Date","Status","Remarks",
    ],
    freeze: 1, color: "#1A7A4A",
  },

  "Fixed Assets": {
    headers: [
      "Asset Code","FY","Created At","Created By",
      "Asset Name","Category","Location","Purchased From",
      "Purchase Date","Invoice No.","Asset Cost (Rs)","Installation Cost (Rs)","Total Cost (Rs)",
      "Useful Life (Yrs)","Dep. Rate %","Annual Dep. (Rs)","Accum. Dep. (Rs)","Book Value (Rs)",
      "Status","Insurance Expiry","AMC / Warranty","Serial No.","Remarks",
    ],
    freeze: 1, color: "#0F766E",
  },

  "FD Tracker": {
    headers: [
      "FD No.","FY","Created At","Created By",
      "Bank / NBFC","Branch","FD Receipt No.","FD Type",
      "Principal (Rs)","Interest Rate % p.a.","Deposit Date","Tenure (Months)","Maturity Date",
      "Interest Payout","Nominee","Nominee Relation","Auto-Renew","Pledged","Status","Remarks",
    ],
    freeze: 1, color: "#1B3A6B",
  },

  "Document Vault": {
    headers: [
      "Doc ID","FY","Created At","Created By",
      "Document Name","Category","Document No.","Issuing Authority",
      "Upload Date","Google Drive Link","Expiry Date","File Size","Added By","Remarks",
    ],
    freeze: 1, color: "#6B21A8",
  },

  Attendance: {
    headers: [
      "Log ID","FY","Created At","Created By",
      "Date","Worker Name","Designation","Type",
      "Job Reference","Site Location","Hours Worked",
      "Daily Rate (Rs)","Wages (Rs)","Advance Deducted (Rs)","Net Wages (Rs)","Remarks",
    ],
    freeze: 1, color: "#C0392B",
  },

  Vehicles: {
    headers: [
      "Log ID","FY","Created At","Created By",
      "Date","Vehicle","Driver","Purpose",
      "Job Reference","Destination","Odometer Start","Odometer End","Km Covered",
      "Fuel Filled (L)","Fuel Cost (Rs)","Toll / Parking (Rs)","Remarks",
    ],
    freeze: 1, color: "#B8860B",
  },

  Config: {
    headers: ["Key","Value","Notes","Last Updated"],
    freeze: 1, color: "#64748B",
  },

};

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
// `ss`, when passed, is a Spreadsheet already opened by the caller — used by
// bulkRead below so a batch of sheets shares one openById() instead of one
// per sheet. Every other caller keeps opening its own (unchanged behavior).
function getSheet(name, ss) {
  const spreadsheet = ss || SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const ws = spreadsheet.getSheetByName(name);
  if (!ws) throw new Error(`Sheet not found: ${name}`);
  return ws;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function timestamp() {
  return new Date().toLocaleString("en-IN", { timeZone:"Asia/Kolkata" });
}

// ─── ROLE-BASED ACCESS CONTROL ─────────────────────────────────────────────────
// Previously the ONLY gate on every request was the single API_KEY, which is
// compiled into the public frontend bundle and visible to anyone who opens
// DevTools → Sources. That meant the Staff/CA vs Admin split was cosmetic —
// it hid modules in the UI, but nothing stopped a browser from POSTing
// straight to Ledger, P&L-feeding sheets, or Config regardless of which
// passcode was used to log in. This layer makes the backend itself check the
// role tied to the passcode presented with the request (resolved here, never
// trusted from a client-supplied field) against what that role is allowed to
// touch. It closes the "staff opens DevTools and writes to Ledger" gap.
//
// It is NOT a substitute for real auth: the API key remains the root secret,
// and Settings already tells Keshav that — for real security — this should
// eventually move to Google OAuth. Someone who extracts BOTH the API key and
// a passcode can still act as that role, same as before. What's new is that
// they're now held to that role's boundaries by the server, not just the UI.
//
// MODULE_SHEETS maps each module id to the raw sheet(s) it needs READ access
// to. Most modules map 1:1 to their own sheet — but "ar"/"pl"/"gst" are
// DERIVED views (AR Aging, P&L, GST Summary) computed from other sheets, not
// their own tab. CA has "ar"/"pl"/"gst" in its module list but deliberately
// does NOT have "invoices"/"expenses" as standalone modules (CA sees rolled-
// up reports, not the raw invoice-entry screen) — so without listing the
// underlying sheets here too, sheetAllowedForRole() would block CA from
// reading the very sheets its own reports are computed from.
const MODULE_SHEETS = {
  jobs:["Jobs"], invoices:["Sales Invoices"], purchases:["Purchase Invoices"], quotations:["Quotations"],
  clients:["Clients"], vendors:["Vendors"], inventory:["Inventory"], expenses:["Expenses"],
  pettycash:["Petty Cash"], ledger:["Ledger"], tds:["TDS"], assets:["Fixed Assets"], fd:["FD Tracker"],
  vault:["Document Vault"], attendance:["Attendance"], vehicles:["Vehicles"],
  ar:["Sales Invoices"], pl:["Sales Invoices","Purchase Invoices","Expenses"], gst:["Sales Invoices","Purchase Invoices"],
};
const ROLE_MODULES = {
  admin: ["*"],
  staff: ["dashboard","jobs","invoices","quotations","clients","vendors","inventory","expenses","pettycash"],
  ca:    ["dashboard","purchases","ledger","ar","pl","gst","tds","assets"],
};
// CA is explicitly read-only per its label in Settings — never allowed to append/update/delete/setConfig.
const READONLY_ROLES = ["ca"];

// ─── LOGIN THROTTLING ───────────────────────────────────────────────────────────
// Apps Script web apps don't expose the caller's IP address to server code, so
// true per-IP throttling isn't possible here — this is a single global
// failed-attempt counter shared across all callers. It won't stop a patient
// attacker spread across many windows, but it kills naive tight-loop
// brute-forcing of the passcode space, which is the realistic threat against a
// public Web App URL. Every SUCCESSFUL passcode resolution resets the counter,
// so normal usage (every read re-sends the passcode, per the request-scoped
// auth model below) never trips it — only genuinely wrong passcodes count.
const LOGIN_THROTTLE_WINDOW_SEC  = 300; // 5 min window for counting failures
const LOGIN_THROTTLE_MAX_FAILS   = 15;  // failures allowed in that window
const LOGIN_THROTTLE_LOCKOUT_SEC = 300; // lockout duration once tripped

function isLoginThrottled() {
  return CacheService.getScriptCache().get("loginLockout") === "1";
}

function recordFailedLogin() {
  const cache = CacheService.getScriptCache();
  const next = Number(cache.get("loginFails") || "0") + 1;
  cache.put("loginFails", String(next), LOGIN_THROTTLE_WINDOW_SEC);
  if (next >= LOGIN_THROTTLE_MAX_FAILS) {
    cache.put("loginLockout", "1", LOGIN_THROTTLE_LOCKOUT_SEC);
    alertOnLockout(next);
  }
}

// Emails CONFIG.ALERT_EMAIL the moment a lockout actually trips, so a
// sustained passcode-probing attempt gets noticed even if nobody happens to
// be locked out themselves at that moment. Throttled to ONE email per
// lockout window (not one per blocked request during the lockout) via its
// own cache key sharing the lockout's own TTL — a sustained attack keeps
// getting blocked by the throttle above, but only alerts once. Best-effort:
// a GmailApp failure here must never break the actual throttle logic.
function alertOnLockout(failCount) {
  const cache = CacheService.getScriptCache();
  if (cache.get("loginLockoutAlerted") === "1") return; // already alerted for this lockout window
  cache.put("loginLockoutAlerted", "1", LOGIN_THROTTLE_LOCKOUT_SEC);
  try {
    const email = getConfig("ALERT_EMAIL") || CONFIG.ALERT_EMAIL;
    const body = [
      `${CONFIG.COMPANY_NAME} — KE Business Suite login lockout triggered`,
      `Time: ${timestamp()}`,
      `${failCount} failed passcode attempts in the last ${Math.round(LOGIN_THROTTLE_WINDOW_SEC/60)} minutes tripped a ${Math.round(LOGIN_THROTTLE_LOCKOUT_SEC/60)}-minute lockout.`,
      "",
      "If this wasn't your team, someone may be probing your passcodes — consider rotating them in Settings.",
    ].join("\n");
    GmailApp.sendEmail(
      email,
      "[KE Alert] Login lockout triggered — possible passcode probing",
      body,
      { name:`${CONFIG.COMPANY_NAME} Alert Bot` }
    );
  } catch(e) {
    Logger.log("Lockout alert email failed: " + e.message);
  }
}

function resetLoginThrottle() {
  const cache = CacheService.getScriptCache();
  cache.remove("loginFails");
  cache.remove("loginLockout");
}

// Resolves a role from the passcode presented with the request, checked
// against the LIVE Config sheet first (so a passcode rotated in Settings
// takes effect immediately), falling back to the original defaults only if
// Config hasn't been seeded yet. Never trusts a client-declared role string.
function resolveRole(code) {
  if (!code) return null;
  if (isLoginThrottled()) return null;
  const upper = String(code).trim().toUpperCase();
  const cfg = getAllConfig();
  const admin = (cfg.ADMIN_PASSCODE || "ADMIN2024").toUpperCase();
  const staff = (cfg.STAFF_PASSCODE || "STAFF001").toUpperCase();
  const ca    = (cfg.CA_PASSCODE    || "CA1234").toUpperCase();
  let role = null;
  if (upper === admin) role = "admin";
  else if (upper === staff) role = "staff";
  else if (upper === ca)    role = "ca";
  if (role) resetLoginThrottle();
  else recordFailedLogin();
  return role;
}

function sheetAllowedForRole(role, sheetName) {
  if (!role) return false;
  if (role === "admin") return true;
  const modules = ROLE_MODULES[role] || [];
  return modules.some(m => (MODULE_SHEETS[m]||[]).includes(sheetName));
}

function getConfig(key) {
  try {
    const ws = getSheet("Config");
    const rows = ws.getDataRange().getValues();
    const row = rows.find(r => r[0] === key);
    return row ? row[1] : null;
  } catch { return null; }
}

// Returns every Config row as a plain { KEY: value } object, so the frontend
// can pull passcodes/company info/alert thresholds in one call instead of
// one getConfig() round trip per key.
function getAllConfig() {
  const ws = getSheet("Config");
  const rows = ws.getDataRange().getValues();
  const out = {};
  rows.slice(1).forEach(r => { if (r[0]) out[r[0]] = r[1]; });
  return out;
}

// Upserts a single Config row (Key/Value/Notes/Last Updated). Locked because
// this is a read-modify-write against a small sheet that also gates login —
// two admins saving Settings at the same moment must not race and silently
// drop one write.
function setConfig(key, value, notes) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ws = getSheet("Config");
    const rows = ws.getDataRange().getValues();
    const idx = rows.findIndex(r => r[0] === key);
    if (idx > -1) {
      ws.getRange(idx+1, 2).setValue(value);
      ws.getRange(idx+1, 4).setValue(timestamp());
      if (notes) ws.getRange(idx+1, 3).setValue(notes);
    } else {
      ws.appendRow([key, value, notes || "", timestamp()]);
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

// Generates a short, easy-to-type-once random passcode (uppercase letters +
// digits, no ambiguous characters like 0/O or 1/I/L) for seeding a fresh
// Config sheet. Replaces the old fixed ADMIN2024/STAFF001/CA1234 defaults,
// which never expired and were never forced to change.
function generateRandomPasscode(length) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < (length || 8); i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function fmtRs(n) {
  return "₹" + Number(n||0).toLocaleString("en-IN");
}

function detectFY(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const yr = d.getFullYear(), mo = d.getMonth() + 1;
  return mo >= 4 ? `${yr}-${String(yr+1).slice(2)}` : `${yr-1}-${String(yr).slice(2)}`;
}

function inFY(dateStr, fy) {
  const d = new Date(dateStr);
  const [sy] = fy.split("-").map(Number);
  return d >= new Date(sy,3,1) && d <= new Date(sy+1,2,31,23,59,59);
}

// ─── AUTO-SERIAL GENERATOR ─────────────────────────────────────────────────────
// Locked end-to-end: without this, two people opening "New Invoice" around the
// same moment (or one person leaving the form open while another saves) can
// both be handed "KE/INV/2026-27/007", producing duplicate invoice numbers —
// a genuine GST compliance problem, not just a cosmetic clash. The lock alone
// isn't sufficient though: the frontend must also call this at SAVE time, not
// at modal-open time, or a serial fetched minutes earlier is already stale by
// the time it's written. See sheetsAPI.nextSerial() callers — they should be
// invoked from handleSave, immediately before the append.
//
// Known accepted risk (audit Issue #3): the true "claim" of a serial only
// happens when the row is appended, not when this function returns — so two
// users submitting within the same network round-trip window could in theory
// receive the same serial before either has appended. Collapsing nextSerial +
// append into one locked `appendWithSerial` call would close this fully, but
// every one of the 12 callers above builds its row (with other user-entered
// fields) BETWEEN the nextSerial and append calls, and the offline queue
// (src/shared/offlineDB.js, sheetsAPI.resolveDraftId in utils.js) depends on
// that same two-step shape to resolve a DRAFT-* id into a real serial at sync
// time. Restructuring this touches all 12 modules and the offline draft-id
// flow for a genuinely low-probability race at this team's size (2-3
// concurrent users) — not worth the regression risk right now. If duplicate
// serials are ever actually observed in the Sheet, revisit this.
function nextSerial(sheetName, prefix, fy) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ws = getSheet(sheetName);
    if (ws.getLastRow() <= 1) return `KE/${prefix}/${fy}/001`;
    const data = ws.getRange(2, 1, ws.getLastRow()-1, 1).getValues().flat();
    const pattern = new RegExp(`KE/${prefix}/${fy.replace("-","\\-")}/(\\d+)`);
    const nums = data.map(v => { const m = String(v).match(pattern); return m ? parseInt(m[1]) : 0; }).filter(Boolean);
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `KE/${prefix}/${fy}/${String(next).padStart(3,"0")}`;
  } finally {
    lock.releaseLock();
  }
}

// ─── READ API ──────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const setupError = setupIncompleteError();
    if (setupError) return jsonOut({ error: setupError });
    if (!isAuthorized(e.parameter.key)) {
      return jsonOut({ error: "Unauthorized — missing or invalid key" });
    }
    if (e.parameter.code && isLoginThrottled()) {
      return jsonOut({ error: "Too many failed passcode attempts — try again in a few minutes" });
    }

    const action = e.parameter.action || "read";
    const sheet  = e.parameter.sheet;
    const fy     = e.parameter.fy || null;

    if (action === "nextSerial") {
      const role = resolveRole(e.parameter.code);
      if (READONLY_ROLES.includes(role) || !sheetAllowedForRole(role, sheet)) {
        return jsonOut({ error: `Access denied — your role does not have access to "${sheet}"` });
      }
      const serial = nextSerial(sheet, e.parameter.prefix, e.parameter.fy || detectFY());
      return jsonOut({ serial });
    }

    if (action === "dashboard") {
      // Dashboard is available to every role (all three have it in their
      // module list) but still requires a resolvable passcode — an
      // unauthenticated caller with only the API key gets nothing.
      const role = resolveRole(e.parameter.code);
      if (!role) return jsonOut({ error: "Access denied — invalid or missing passcode" });
      return jsonOut(getDashboardData(fy));
    }

    if (action === "plSummary") {
      // P&L aggregates Sales Invoices + Purchase Invoices + Expenses. Staff
      // can read Sales Invoices/Expenses directly but NOT Purchase Invoices
      // (no "purchases" in ROLE_MODULES.staff) — without this check, hitting
      // this computed endpoint would leak purchase-derived totals a Staff
      // passcode is otherwise blocked from seeing.
      const role = resolveRole(e.parameter.code);
      if (role !== "admin" && role !== "ca") return jsonOut({ error: "Access denied — P&L is Admin/CA only" });
      return jsonOut(getPLSummary(fy));
    }

    if (action === "gstSummary") {
      // Same reasoning as plSummary — aggregates across sheets Staff can't
      // all read individually.
      const role = resolveRole(e.parameter.code);
      if (role !== "admin" && role !== "ca") return jsonOut({ error: "Access denied — GST Summary is Admin/CA only" });
      return jsonOut(getGSTSummary(fy));
    }

    if (action === "config") {
      return jsonOut({ status:"ok", config: getAllConfig() });
    }

    if (action === "bulkRead") {
      // Batches several single-sheet reads into ONE Apps Script execution —
      // one openById() instead of N — for cases like an Admin login or an FY
      // switch that need many sheets at once (see sheetsAPI.readMany in
      // utils.js). `sheets` is a comma-separated list of sheet names; `fy`
      // applies to all of them, same as the single-sheet `read` action.
      // resolveRole() is called exactly ONCE for the whole batch (not once
      // per sheet) — it has side effects on the login-throttle counters, and
      // calling it per-sheet would over/under-count a single request's
      // failures.
      const role = resolveRole(e.parameter.code);
      const sheetNames = (e.parameter.sheets || "").split(",").map(s => s.trim()).filter(Boolean);
      if (!sheetNames.length) return jsonOut({ error: "No sheets specified" });

      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const results = {};
      sheetNames.forEach(name => {
        // Per-sheet role check, same as the single-sheet path: a role that's
        // allowed 8 of 10 requested sheets gets data for those 8 and an
        // {error} entry for the other 2 — never a blanket rejection of the
        // whole batch for one disallowed sheet.
        if (!sheetAllowedForRole(role, name)) {
          results[name] = { error: `Access denied — your role does not have access to "${name}"` };
          return;
        }
        try {
          results[name] = readSheetData(name, fy, ss);
        } catch (err) {
          // One bad/missing tab (e.g. renamed sheet) doesn't blank out the
          // rest of the batch, same as readMany's existing per-sheet
          // independence on the frontend.
          results[name] = { error: err.message };
        }
      });
      return jsonOut(results);
    }

    if (!sheet) return jsonOut({ error: "No sheet specified" });

    // Role check: a passcode is required to read a data sheet directly (the
    // computed actions above — dashboard/plSummary/gstSummary/config — stay
    // open on just the API key, since dashboard/config need to work before
    // role can be resolved from a fresh login). Missing/invalid code, or a
    // role without this sheet in its module list, is rejected here — not
    // just hidden in the UI.
    const role = resolveRole(e.parameter.code);
    if (!sheetAllowedForRole(role, sheet)) {
      return jsonOut({ error: `Access denied — your role does not have access to "${sheet}"` });
    }

    return jsonOut(readSheetData(sheet, fy));

  } catch(err) {
    // Never echo err.stack to the client — it can leak sheet/file internals.
    return jsonOut({ error: err.message });
  }
}

// Shared row-shaping logic used by both the single-sheet `read` action and
// the batched `bulkRead` action below, so the two paths can never drift out
// of sync (row addressing, FY filter, and empty-sheet shape all stay
// identical whichever path a caller takes). `ss`, when passed, is a
// Spreadsheet already opened by the caller (see bulkRead).
function readSheetData(sheet, fy, ss) {
  const ws     = getSheet(sheet, ss);
  const values = ws.getDataRange().getValues();
  if (values.length <= 1) return { status:"ok", sheet, fy, count:0, headers:values[0]||[], data:[] };

  const headers = values[0];
  // Tag every row with its TRUE sheet row number (i+2: 1 for header row,
  // 1 because sheet rows are 1-indexed) *before* any filtering happens.
  // This is critical: if we filtered first and then used array position as
  // the row address, "row 3 of the FY-filtered response" would not be row 3
  // of the actual sheet — any update/delete against it would silently hit
  // the wrong record. See CHANGELOG for the incident this fixes.
  let rows = values.slice(1).map((row,i) => ({ row, _rowNum: i+2 }));

  // FY filter if requested
  if (fy && headers.includes("FY")) {
    const fyCol = headers.indexOf("FY");
    rows = rows.filter(r => r.row[fyCol] === fy);
  }

  // Convert to objects, carrying the true row number along as `_rowNum`
  const data = rows.map(({row,_rowNum}) => {
    const obj = {};
    headers.forEach((h,i) => { obj[h] = row[i] ?? ""; });
    obj._rowNum = _rowNum;
    return obj;
  });

  return { status:"ok", sheet, fy, count:data.length, headers, data };
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
// Constant-time-ish compare isn't really achievable in Apps Script, but a plain
// key check is still far better than none — it stops casual/automated scraping
// of the bare Web App URL, which is what matters here (this isn't a bank).
function isAuthorized(key) {
  return typeof key === "string" && key.length > 0 && key === CONFIG.API_KEY;
}

// Fires BEFORE the auth check in both doGet/doPost, so an unconfigured
// deployment gets ONE clear, specific message ("you haven't finished
// README Step 2") instead of a generic "Unauthorized" (if API_KEY is still
// the placeholder, no real key will ever match it) or a cryptic
// SpreadsheetApp "Invalid argument" several calls deeper (if SHEET_ID is
// still the placeholder). Returns null once both are set to anything else.
function setupIncompleteError() {
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === "YOUR_GOOGLE_SHEET_ID_HERE") {
    return "Setup incomplete: CONFIG.SHEET_ID in apps-script-backend.js is still the placeholder value. Paste your Google Sheet's ID there (README Step 2), then redeploy.";
  }
  if (!CONFIG.API_KEY || CONFIG.API_KEY === "YOUR_LONG_RANDOM_SHARED_SECRET_HERE") {
    return "Setup incomplete: CONFIG.API_KEY in apps-script-backend.js is still the placeholder value. Generate a real shared secret (README Step 2), put the SAME value in the frontend's VITE_API_KEY, then redeploy both.";
  }
  return null;
}

// ─── WRITE API ────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const setupError = setupIncompleteError();
    if (setupError) return jsonOut({ error: setupError });
    const payload = JSON.parse(e.postData.contents);
    if (!isAuthorized(payload.key)) {
      return jsonOut({ error: "Unauthorized — missing or invalid key" });
    }
    if (payload.code && isLoginThrottled()) {
      return jsonOut({ error: "Too many failed passcode attempts — try again in a few minutes" });
    }
    const { action, sheet, row, rowIndex, updates, code } = payload;
    const role = resolveRole(code);

    if (action === "setConfig") {
      // Company info, alert thresholds, and — critically — the passcodes
      // themselves live in Config. Only Admin may write here: a Staff or CA
      // passcode hitting this endpoint directly (bypassing the UI, which
      // never shows them Settings) must not be able to grant itself Admin by
      // overwriting ADMIN_PASSCODE, or quietly change alert routing.
      if (role !== "admin") {
        return jsonOut({ error: "Access denied — only Admin can update settings" });
      }
      const { configKey, value, notes } = payload;
      if (!configKey) return jsonOut({ error:"configKey required for setConfig" });
      setConfig(configKey, value, notes);
      return jsonOut({ status:"ok", action:"setConfig", configKey });
    }

    // Every other write (append/update/delete) touches a specific sheet — CA
    // is read-only across the board, and Staff/Admin are scoped to the
    // sheets their role covers (see sheetAllowedForRole / ROLE_MODULES).
    if (READONLY_ROLES.includes(role)) {
      return jsonOut({ error: "Access denied — your role is read-only" });
    }
    if (!sheetAllowedForRole(role, sheet)) {
      return jsonOut({ error: `Access denied — your role does not have access to "${sheet}"` });
    }

    const ws = getSheet(sheet);

    if (action === "append") {
      // Validate row length matches headers
      const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
      if (row.length !== headers.length) {
        return jsonOut({ error: `Row has ${row.length} cols but sheet has ${headers.length}. Check buildXxxRow() in utils.js` });
      }
      ws.appendRow(row);
      const newRowIdx = ws.getLastRow();
      // Style data rows alternating
      if (newRowIdx % 2 === 0) {
        ws.getRange(newRowIdx, 1, 1, headers.length).setBackground("#EEF2F7");
      }
      return jsonOut({ status:"ok", action:"appended", sheet, rowIndex:newRowIdx });
    }

    if (action === "update") {
      if (!rowIndex) return jsonOut({ error:"rowIndex required for update" });
      const headers = ws.getRange(1,1,1,ws.getLastColumn()).getValues()[0];
      // Full-row overwrite: this is what every current caller sends (the frontend's
      // buildXxxRow() helpers produce a full array). Route arrays here regardless of
      // which field (updates or row) they arrived in.
      if (Array.isArray(updates) || Array.isArray(row)) {
        const fullRow = Array.isArray(updates) ? updates : row;
        // Same guard as append: catches a schema-drift bug (FIELD_MAPS in
        // constants.js edited without updating the headers here, or vice
        // versa) loudly on every save, not just on new records.
        if (fullRow.length !== headers.length) {
          return jsonOut({ error: `Row has ${fullRow.length} cols but sheet has ${headers.length}. Check buildXxxRow() in utils.js` });
        }
        ws.getRange(rowIndex, 1, 1, fullRow.length).setValues([fullRow]);
      } else if (updates && typeof updates === "object") {
        // Partial update: only update specified columns. Reserved for a future
        // caller that sends a real {columnName: value} diff object — no current
        // caller uses this path.
        Object.entries(updates).forEach(([col, val]) => {
          const colIdx = headers.indexOf(col);
          if (colIdx > -1) ws.getRange(rowIndex, colIdx+1).setValue(val);
        });
      }
      return jsonOut({ status:"ok", action:"updated", sheet, rowIndex });
    }

    if (action === "delete") {
      // Soft delete: mark as Deleted rather than remove row
      const headers = ws.getRange(1,1,1,ws.getLastColumn()).getValues()[0];
      const statusCol = headers.indexOf("Status");
      if (statusCol > -1) {
        ws.getRange(rowIndex, statusCol+1).setValue("Deleted");
        ws.getRange(rowIndex, 1, 1, headers.length).setFontColor("#999999");
      } else {
        ws.deleteRow(rowIndex); // hard delete only if no Status column
      }
      return jsonOut({ status:"ok", action:"deleted", sheet, rowIndex });
    }

    return jsonOut({ error:`Unknown action: ${action}` });

  } catch(err) {
    return jsonOut({ error: err.message });
  }
}

// ─── DASHBOARD DATA ────────────────────────────────────────────────────────────
function getDashboardData(fy) {
  const currentFY = fy || detectFY();
  const result = { fy:currentFY, kpis:{}, alerts:[], upcomingFDs:[], pendingAR:[], recentJobs:[] };

  try {
    // Revenue from Sales Invoices
    const invWs = getSheet("Sales Invoices");
    const invData = invWs.getDataRange().getValues();
    if (invData.length > 1) {
      const h = invData[0];
      const rows = invData.slice(1).filter(r=>r[h.indexOf("FY")]===currentFY);
      result.kpis.totalRevenue    = rows.reduce((s,r)=>s+(+r[h.indexOf("Grand Total (Rs)")]||0),0);
      result.kpis.totalReceived   = rows.reduce((s,r)=>s+(+r[h.indexOf("Amount Received (Rs)")]||0),0);
      result.kpis.totalBalance    = result.kpis.totalRevenue - result.kpis.totalReceived;
      result.kpis.invoiceCount    = rows.length;
    }

    // Jobs
    const jobWs = getSheet("Jobs");
    const jobData = jobWs.getDataRange().getValues();
    if (jobData.length > 1) {
      const h = jobData[0];
      const rows = jobData.slice(1).filter(r=>r[h.indexOf("FY")]===currentFY);
      result.kpis.activeJobs  = rows.filter(r=>["In Progress","Scheduled"].includes(r[h.indexOf("Status")])).length;
      result.kpis.totalJobs   = rows.length;
      result.recentJobs = rows.slice(-5).reverse().map(r=>({
        id:r[h.indexOf("Job ID")], client:r[h.indexOf("Client")],
        type:r[h.indexOf("Job Type")], status:r[h.indexOf("Status")],
      }));
    }

    // FD Alerts
    const fdWs = getSheet("FD Tracker");
    const fdData = fdWs.getDataRange().getValues();
    if (fdData.length > 1) {
      const h = fdData[0];
      const today = new Date();
      fdData.slice(1).filter(r=>r[h.indexOf("Status")]==="Active").forEach(r=>{
        const mat = new Date(r[h.indexOf("Maturity Date")]);
        const days = Math.ceil((mat-today)/86400000);
        if (days <= CONFIG.FD_ALERT_DAYS) {
          result.alerts.push({ type:days<0?"red":"amber", icon:"🏦", msg:`FD ${r[h.indexOf("FD No.")]} at ${r[h.indexOf("Bank / NBFC")]} — ${days<0?`Matured ${Math.abs(days)} days ago`:`Matures in ${days} days`}`, action:"Renew / Withdraw" });
          result.upcomingFDs.push({ fdNo:r[h.indexOf("FD No.")], bank:r[h.indexOf("Bank / NBFC")], principal:r[h.indexOf("Principal (Rs)")], maturityDate:r[h.indexOf("Maturity Date")], daysLeft:days });
        }
      });
    }

    // AR Aging
    const invWs2 = getSheet("Sales Invoices");
    const invData2 = invWs2.getDataRange().getValues();
    if (invData2.length > 1) {
      const h = invData2[0];
      const today = new Date();
      invData2.slice(1).filter(r=>r[h.indexOf("FY")]===currentFY&&r[h.indexOf("Payment Status")]!=="Paid").forEach(r=>{
        const balance = +r[h.indexOf("Grand Total (Rs)")]-(+r[h.indexOf("Amount Received (Rs)")]||0);
        if (balance > 0) {
          const due = new Date(r[h.indexOf("Due Date")]);
          const overdue = Math.ceil((today-due)/86400000);
          if (overdue > CONFIG.AR_ALERT_DAYS) {
            result.alerts.push({ type:"red", icon:"💰", msg:`${r[h.indexOf("Client")]} — ${fmtRs(balance)} overdue ${overdue} days (${r[h.indexOf("Invoice No.")]})` });
          }
          result.pendingAR.push({ client:r[h.indexOf("Client")], invoiceNo:r[h.indexOf("Invoice No.")], balance, dueDate:r[h.indexOf("Due Date")], overdue });
        }
      });
      result.kpis.totalAR = result.pendingAR.reduce((s,r)=>s+r.balance,0);
    }

    // Low stock
    const invStockWs = getSheet("Inventory");
    const stockData = invStockWs.getDataRange().getValues();
    if (stockData.length > 1) {
      const h = stockData[0];
      const lowItems = stockData.slice(1).filter(r=>(+r[h.indexOf("Closing Stock")])<=(+r[h.indexOf("Reorder Level")]));
      result.kpis.lowStockCount = lowItems.length;
      if (lowItems.length > 0) {
        result.alerts.push({ type:"amber", icon:"📦", msg:`${lowItems.length} items below reorder level: ${lowItems.slice(0,3).map(r=>r[h.indexOf("Item Name")]).join(", ")}` });
      }
    }

    // Petty cash balance
    const pcWs = getSheet("Petty Cash");
    const pcData = pcWs.getDataRange().getValues();
    if (pcData.length > 1) {
      const h = pcData[0];
      const rows = pcData.slice(1).filter(r=>r[h.indexOf("FY")]===currentFY);
      const inflow = rows.filter(r=>r[h.indexOf("Type")]==="Top-up").reduce((s,r)=>s+(+r[h.indexOf("Amount (Rs)")]||0),0);
      const outflow= rows.filter(r=>r[h.indexOf("Type")]==="Payment").reduce((s,r)=>s+(+r[h.indexOf("Amount (Rs)")]||0),0);
      result.kpis.pettyCashBalance = inflow-outflow;
      if (inflow-outflow < 500) {
        result.alerts.push({ type:"red", icon:"💵", msg:`Petty cash low — only ${fmtRs(inflow-outflow)} remaining. Request top-up.` });
      }
    }

    // Docs expiring
    const vaultWs = getSheet("Document Vault");
    const vaultData = vaultWs.getDataRange().getValues();
    if (vaultData.length > 1) {
      const h = vaultData[0];
      const today = new Date();
      vaultData.slice(1).forEach(r=>{
        const exp = r[h.indexOf("Expiry Date")];
        if (exp && exp !== "—") {
          const d = new Date(exp), days = Math.ceil((d-today)/86400000);
          if (days < 30) result.alerts.push({ type:days<0?"red":"amber", icon:"📄", msg:`Document "${r[h.indexOf("Document Name")]}" ${days<0?`expired ${Math.abs(days)} days ago`:`expires in ${days} days`}` });
        }
      });
    }

  } catch(err) {
    result.error = err.message;
  }

  return result;
}

// ─── P&L SUMMARY ─────────────────────────────────────────────────────────────
function getPLSummary(fy) {
  const currentFY = fy || detectFY();
  const result = { fy:currentFY, revenue:{}, expenses:{}, purchases:{}, net:0, margin:0 };

  const invWs = getSheet("Sales Invoices");
  const invData = invWs.getDataRange().getValues();
  if (invData.length > 1) {
    const h = invData[0];
    const rows = invData.slice(1).filter(r=>r[h.indexOf("FY")]===currentFY);
    result.revenue.salesInvoices  = rows.reduce((s,r)=>s+(+r[h.indexOf("Taxable Amount (Rs)")]||0),0);
    result.revenue.outputGST      = rows.reduce((s,r)=>s+(+r[h.indexOf("Total GST (Rs)")]||0),0);
    result.revenue.tdsDeducted    = rows.reduce((s,r)=>s+(+r[h.indexOf("TDS Amount (Rs)")]||0),0);
    result.revenue.totalInvoiced  = rows.reduce((s,r)=>s+(+r[h.indexOf("Grand Total (Rs)")]||0),0);
    result.revenue.received       = rows.reduce((s,r)=>s+(+r[h.indexOf("Amount Received (Rs)")]||0),0);
  }

  const expWs = getSheet("Expenses");
  const expData = expWs.getDataRange().getValues();
  if (expData.length > 1) {
    const h = expData[0];
    const rows = expData.slice(1).filter(r=>r[h.indexOf("FY")]===currentFY);
    result.expenses.total   = rows.reduce((s,r)=>s+(+r[h.indexOf("Amount (Rs)")]||0),0);
    result.expenses.inputGST= rows.reduce((s,r)=>s+(+r[h.indexOf("GST (Rs)")]||0),0);
    result.expenses.byCategory = {};
    rows.forEach(r=>{ const cat=r[h.indexOf("Category")]; result.expenses.byCategory[cat]=(result.expenses.byCategory[cat]||0)+(+r[h.indexOf("Amount (Rs)")]||0); });
  }

  const purWs = getSheet("Purchase Invoices");
  const purData = purWs.getDataRange().getValues();
  if (purData.length > 1) {
    const h = purData[0];
    const rows = purData.slice(1).filter(r=>r[h.indexOf("FY")]===currentFY);
    result.purchases.total   = rows.reduce((s,r)=>s+(+r[h.indexOf("Taxable Amount (Rs)")]||0),0);
    result.purchases.inputGST= rows.reduce((s,r)=>s+(+r[h.indexOf("Total GST (Rs)")]||0),0);
  }

  const pcWs = getSheet("Petty Cash");
  const pcData = pcWs.getDataRange().getValues();
  if (pcData.length > 1) {
    const h = pcData[0];
    const rows = pcData.slice(1).filter(r=>r[h.indexOf("FY")]===currentFY&&r[h.indexOf("Type")]==="Payment");
    result.expenses.pettyCash = rows.reduce((s,r)=>s+(+r[h.indexOf("Amount (Rs)")]||0),0);
  }

  result.totalExpenses = (result.expenses.total||0) + (result.purchases.total||0) + (result.expenses.pettyCash||0);
  result.net    = (result.revenue.salesInvoices||0) - result.totalExpenses;
  result.margin = result.revenue.salesInvoices ? Math.round(result.net/result.revenue.salesInvoices*100*10)/10 : 0;
  result.netGST = (result.revenue.outputGST||0) - (result.expenses.inputGST||0) - (result.purchases.inputGST||0);
  return result;
}

// ─── GST SUMMARY ─────────────────────────────────────────────────────────────
function getGSTSummary(fy) {
  const pl = getPLSummary(fy);
  return {
    fy: pl.fy,
    outputGST:     pl.revenue.outputGST || 0,
    inputGSTExp:   pl.expenses.inputGST || 0,
    inputGSTPur:   pl.purchases.inputGST || 0,
    totalInputGST: (pl.expenses.inputGST||0) + (pl.purchases.inputGST||0),
    netGSTPayable: pl.netGST || 0,
  };
}

// ─── INIT ALL SHEETS ──────────────────────────────────────────────────────────
function initAllSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const ui = SpreadsheetApp.getUi();

  Object.entries(SCHEMA).forEach(([name, schema]) => {
    let ws = ss.getSheetByName(name);
    if (!ws) {
      ws = ss.insertSheet(name);
      Logger.log(`Created sheet: ${name}`);
    }

    // Set headers
    const lastCol = schema.headers.length;
    const hdrRange = ws.getRange(1, 1, 1, lastCol);
    hdrRange.setValues([schema.headers]);
    hdrRange.setBackground(schema.color||"#1B3A6B");
    hdrRange.setFontColor("#FFFFFF");
    hdrRange.setFontWeight("bold");
    hdrRange.setFontFamily("Arial");
    hdrRange.setFontSize(10);
    hdrRange.setHorizontalAlignment("center");
    hdrRange.setVerticalAlignment("middle");
    ws.setRowHeight(1, 36);

    // Freeze
    ws.setFrozenRows(schema.freeze || 1);
    ws.setFrozenColumns(1);

    // Column widths — auto for now
    ws.autoResizeColumns(1, lastCol);

    // Add filter
    if (ws.getLastRow() > 1) {
      ws.getRange(1,1,ws.getLastRow(),lastCol).createFilter();
    }
  });

  // Config defaults
  const configWs = ss.getSheetByName("Config");
  const isFirstSeed = configWs.getLastRow() <= 1;
  // Random on every fresh seed — never ship a fixed, guessable default that
  // stays valid forever. These are shown ONCE via ui.alert below; after that
  // they only live in the Config sheet (Settings module can rotate them).
  const adminPasscode = isFirstSeed ? generateRandomPasscode(8) : "ADMIN2024";
  const staffPasscode = isFirstSeed ? generateRandomPasscode(8) : "STAFF001";
  const caPasscode    = isFirstSeed ? generateRandomPasscode(8) : "CA1234";
  const configDefaults = [
    ["COMPANY_NAME",    CONFIG.COMPANY_NAME,  "Company name", timestamp()],
    ["COMPANY_GSTIN",   CONFIG.COMPANY_GSTIN, "GST number",   timestamp()],
    ["ALERT_EMAIL",     CONFIG.ALERT_EMAIL,   "Daily alert email", timestamp()],
    ["PETTY_CASH_FLOAT",CONFIG.PETTY_CASH_FLOAT,"Imprest float amount", timestamp()],
    ["LOW_STOCK_ALERT", "TRUE",               "Enable low stock email alerts", timestamp()],
    ["AR_ALERT_DAYS",   CONFIG.AR_ALERT_DAYS, "Alert when AR overdue > N days", timestamp()],
    ["FD_ALERT_DAYS",   CONFIG.FD_ALERT_DAYS, "Alert when FD matures within N days", timestamp()],
    ["ADMIN_PASSCODE",  adminPasscode,        "Admin passcode", timestamp()],
    ["STAFF_PASSCODE",  staffPasscode,        "Staff passcode", timestamp()],
    ["CA_PASSCODE",     caPasscode,           "CA passcode",    timestamp()],
    ["APP_URL",         CONFIG.APP_URL,       "Deployed app URL", timestamp()],
  ];
  if (isFirstSeed) {
    configWs.getRange(2,1,configDefaults.length,4).setValues(configDefaults);
    // Shown exactly once, at seed time — record these somewhere safe (a
    // password manager, not a sticky note). They can be rotated any time
    // afterwards from the Settings module, which writes back through
    // setConfig() and takes effect on the very next request.
    ui.alert(
      "Passcodes generated — record these now",
      `These are shown only once and are NOT saved anywhere but the Config sheet:\n\n` +
      `Admin: ${adminPasscode}\nStaff: ${staffPasscode}\nCA: ${caPasscode}\n\n` +
      `Change them any time from the Settings module in the app.`,
      ui.ButtonSet.OK
    );
  }

  // Sort sheets in logical order
  const order = ["Dashboard","Jobs","Sales Invoices","Purchase Invoices","Quotations","Clients","Vendors","Inventory","Expenses","Petty Cash","Ledger","TDS","Fixed Assets","FD Tracker","Document Vault","Attendance","Vehicles","Config"];
  order.forEach((name, idx) => {
    const ws = ss.getSheetByName(name);
    if (ws) ss.setActiveSheet(ws);
    try { if (ws) ws.setTabColor(SCHEMA[name]?.color||"#1B3A6B"); } catch(e) {}
  });

  ui.alert("✅ All " + Object.keys(SCHEMA).length + " sheets initialized!\n\nYour KE Business Suite backend is ready.\nCopy the Web App URL after deploying and paste into App.jsx.");
}

// ─── DAILY ALERT ─────────────────────────────────────────────────────────────
function dailyAlerts() {
  const email   = getConfig("ALERT_EMAIL") || CONFIG.ALERT_EMAIL;
  const fy      = detectFY();
  const today   = new Date();
  const data    = getDashboardData(fy);
  const sections= [];

  if (data.alerts && data.alerts.length > 0) {
    sections.push("ACTION REQUIRED");
    sections.push("─".repeat(48));
    data.alerts.forEach(a => sections.push(`${a.icon}  ${a.msg}`));
    sections.push("");
  }

  if (data.upcomingFDs && data.upcomingFDs.length > 0) {
    sections.push("FD MATURITY SCHEDULE");
    sections.push("─".repeat(48));
    data.upcomingFDs.forEach(f => {
      sections.push(`  ${f.bank} | ${f.fdNo} | ${fmtRs(f.principal)} | ${f.daysLeft < 0 ? "MATURED" : f.daysLeft + " days left"}`);
    });
    sections.push("");
  }

  if (data.pendingAR && data.pendingAR.length > 0) {
    sections.push("OUTSTANDING RECEIVABLES");
    sections.push("─".repeat(48));
    data.pendingAR.sort((a,b)=>b.overdue-a.overdue).forEach(r => {
      sections.push(`  ${r.client} | ${r.invoiceNo} | ${fmtRs(r.balance)} | Overdue: ${r.overdue} days`);
    });
    sections.push(`  TOTAL AR: ${fmtRs(data.kpis.totalAR||0)}`);
    sections.push("");
  }

  sections.push("DAILY KPIs — FY " + fy);
  sections.push("─".repeat(48));
  sections.push(`  Revenue (Invoiced): ${fmtRs(data.kpis.totalRevenue||0)}`);
  sections.push(`  Amount Received:    ${fmtRs(data.kpis.totalReceived||0)}`);
  sections.push(`  Balance Pending:    ${fmtRs(data.kpis.totalBalance||0)}`);
  sections.push(`  Active Jobs:        ${data.kpis.activeJobs||0}`);
  sections.push(`  Petty Cash in Hand: ${fmtRs(data.kpis.pettyCashBalance||0)}`);

  if (sections.length === 0) {
    sections.push("✅ All clear! No alerts today.");
  }

  const totalAlerts = data.alerts ? data.alerts.length : 0;
  const body = [
    `${CONFIG.COMPANY_NAME} — Daily Business Alert`,
    `Date: ${today.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}`,
    `FY: ${fy} | Alerts: ${totalAlerts}`,
    "═".repeat(50),
    "",
    ...sections,
    "═".repeat(50),
    `Open app: ${CONFIG.APP_URL}`,
    "This is an automated daily report from your KE Business Suite.",
  ].join("\n");

  GmailApp.sendEmail(
    email,
    `[KE Daily] ${totalAlerts} alerts · ${today.toLocaleDateString("en-IN")}`,
    body,
    { name:`${CONFIG.COMPANY_NAME} Alert Bot` }
  );

  Logger.log("Daily alert sent: " + totalAlerts + " alerts");
}

// ─── MONTHLY REPORT ───────────────────────────────────────────────────────────
function monthlyReport() {
  const email = getConfig("ALERT_EMAIL") || CONFIG.ALERT_EMAIL;
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth()-1);
  const fy = detectFY(lastMonth.toISOString());
  const pl = getPLSummary(fy);
  const gst = getGSTSummary(fy);

  const body = [
    `${CONFIG.COMPANY_NAME} — Monthly Report`,
    `Month: ${lastMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}`,
    "═".repeat(50),
    "",
    "PROFIT & LOSS",
    "─".repeat(40),
    `  Sales Revenue:       ${fmtRs(pl.revenue.salesInvoices||0)}`,
    `  Operating Expenses:  ${fmtRs(pl.expenses.total||0)}`,
    `  Material Purchases:  ${fmtRs(pl.purchases.total||0)}`,
    `  Petty Cash Spend:    ${fmtRs(pl.expenses.pettyCash||0)}`,
    `  ─────────────────────────────────`,
    `  NET PROFIT/(LOSS):   ${fmtRs(pl.net)}`,
    `  Net Margin:          ${pl.margin}%`,
    "",
    "GST SUMMARY",
    "─".repeat(40),
    `  Output GST (A):      ${fmtRs(gst.outputGST)}`,
    `  Input GST / ITC (B): ${fmtRs(gst.totalInputGST)}`,
    `  NET PAYABLE (A-B):   ${fmtRs(gst.netGSTPayable)}`,
    "",
    "═".repeat(50),
    "Note: Verify with CA before filing. This is internal estimate.",
  ].join("\n");

  GmailApp.sendEmail(
    email,
    `[KE Monthly] P&L Report — ${lastMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"})} | Net: ${fmtRs(pl.net)}`,
    body,
    { name:`${CONFIG.COMPANY_NAME} Reports` }
  );
}

// ─── TRIGGER SETUP (run once manually) ───────────────────────────────────────
function setupTriggers() {
  // Remove existing triggers
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Daily alert at 8 AM IST
  ScriptApp.newTrigger("dailyAlerts")
    .timeBased().everyDays(1).atHour(8).create();

  // Monthly report on 1st at 9 AM
  ScriptApp.newTrigger("monthlyReport")
    .timeBased().onMonthDay(1).atHour(9).create();

  Logger.log("Triggers set: dailyAlerts (8AM daily), monthlyReport (1st of month 9AM)");
  SpreadsheetApp.getUi().alert("✅ Triggers set successfully!\n• Daily alert: 8:00 AM every day\n• Monthly report: 1st of each month at 9:00 AM");
}
