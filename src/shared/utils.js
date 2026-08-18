// ─── FORMATTING ──────────────────────────────────────────────────────────────
export const fmt   = n  => "₹" + Number(n||0).toLocaleString("en-IN");
export const fmtD  = d  => d ? new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "—";
export const fmtDt = d  => d ? new Date(d).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
export const stars = n  => "★".repeat(Math.max(0,+n||0)) + "☆".repeat(Math.max(0,5-(+n||0)));
export const today = () => new Date().toISOString().split("T")[0];
export const isPast= d  => d && d !== "—" && new Date(d) < new Date();

// ─── LIVE DATE CALCULATIONS (fixes hardcoded daysLeft / daysElapsed) ─────────
export const daysFromToday = d => {
  if (!d || d === "—") return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
};
export const daysOverdue = d => {
  if (!d) return 0;
  return Math.max(0, Math.ceil((new Date() - new Date(d)) / 86400000));
};
// Auto-calculate FD maturity date from deposit + tenure
export const calcMaturityDate = (depositDate, tenureMonths) => {
  if (!depositDate || !tenureMonths) return "";
  const d = new Date(depositDate);
  d.setMonth(d.getMonth() + (+tenureMonths));
  return d.toISOString().split("T")[0];
};
// FD maturity amount: quarterly compounding A = P(1+r/4)^(4t)
export const calcFDMaturity = (principal, ratePercent, tenureMonths) => {
  const t = (+tenureMonths)/12, r = (+ratePercent)/100;
  return Math.round((+principal) * Math.pow(1+r/4, 4*t));
};
export const calcClosing   = (o,p,i) => Math.max(0,(+o||0)+(+p||0)-(+i||0));
export const calcAnnualDep = (c,ic,r)=> Math.round(((+c||0)+(+ic||0))*(+r||0)/100);

// ─── GST / INVOICE CALCULATIONS ──────────────────────────────────────────────
// Sums an items array [{qty,rate,...}] into a materialCharges total. Exported
// separately from calcInvoice so the Invoices modal can show a live running
// total in the item table itself, not just in the final CalcStrip.
export const calcItemsTotal = (items) => (items||[]).reduce((s,i)=>s+(+i.qty||0)*(+i.rate||0),0);

export const calcInvoice = (form) => {
  // Backward compatibility: an invoice with a populated `items` array gets
  // materialCharges computed from it; one with an empty/missing `items`
  // (every invoice saved before this feature shipped, or a new invoice with
  // no rows added yet) falls back to the legacy typed-in materialCharges
  // number exactly as before. Never force old invoices through the new path.
  const itemsMaterial = (form.items && form.items.length) ? calcItemsTotal(form.items) : null;
  const materialCharges = itemsMaterial!==null ? itemsMaterial : (+form.materialCharges||0);
  form = { ...form, materialCharges };
  const sub    = [+form.labourCharges,+form.materialCharges,+form.travelCharges,+form.otherCharges].reduce((a,b)=>a+b,0);
  const taxable= sub - (+form.discount||0);
  const gstPct = +form.gstPct || 18;
  const exempt = form.gstType==="Exempt"||form.gstType==="Nil";
  const gstAmt = exempt ? 0 : Math.round(taxable*gstPct/100);
  const cgst   = form.gstType==="CGST+SGST" ? Math.round(gstAmt/2) : 0;
  const sgst   = form.gstType==="CGST+SGST" ? gstAmt-cgst : 0;
  const igst   = form.gstType==="IGST" ? gstAmt : 0;
  const grand  = taxable + gstAmt;
  const tdsAmt = form.tdsApplicable==="Yes" ? Math.round(taxable*(+form.tdsRate||1)/100) : 0;
  // materialCharges rides along on the result so buildInvoiceRow can use the
  // SAME resolved number (items-derived or legacy field) that this
  // calculation was actually based on, instead of re-reading the possibly-
  // stale raw form field itself.
  return { sub, taxable, gstAmt, cgst, sgst, igst, grand, tdsAmt, netPay:grand-tdsAmt, materialCharges };
};
export const calcPurchase = (form) => {
  const taxable= (+form.basicAmount||0)-(+form.discount||0);
  const exempt = form.gstType==="Exempt"||form.gstType==="Nil";
  const cgst   = (!exempt&&form.gstType==="CGST+SGST") ? Math.round(taxable*(+form.cgstPct||9)/100) : 0;
  const sgst   = (!exempt&&form.gstType==="CGST+SGST") ? Math.round(taxable*(+form.sgstPct||9)/100) : 0;
  const igst   = (!exempt&&form.gstType==="IGST")       ? Math.round(taxable*(+form.igstPct||18)/100) : 0;
  const gstTot = cgst+sgst+igst;
  const grand  = taxable+gstTot;
  const tdsAmt = form.tdsApplicable==="Yes" ? Math.round(taxable*(+form.tdsRate||2)/100) : 0;
  return { taxable, cgst, sgst, igst, gstTot, grand, tdsAmt, netPay:grand-tdsAmt };
};

// ─── FORM VALIDATION ─────────────────────────────────────────────────────────
// Format patterns for the statutory / contact fields that recur across
// Clients, Vendors, Invoices and Purchase Invoices. These were previously
// plain text inputs with no shape checking at all, so a mistyped GSTIN or PAN
// would silently sit in the sheet until it broke a GST/TDS report much later.
// Reference in a RULES array like: { field:"gstin", label:"GSTIN", pattern:"gstin" }
export const PATTERNS = {
  gstin:  { re:/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, msg:"must be a valid 15-character GSTIN (e.g. 09ABCDE1234F1Z5)" },
  pan:    { re:/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,                                msg:"must be a valid 10-character PAN (e.g. ABCDE1234F)" },
  ifsc:   { re:/^[A-Z]{4}0[A-Z0-9]{6}$/,                                    msg:"must be a valid 11-character IFSC (e.g. SBIN0001234)" },
  mobile: { re:/^[6-9]\d{9}$/,                                              msg:"must be a valid 10-digit Indian mobile number" },
  email:  { re:/^[^\s@]+@[^\s@]+\.[^\s@]+$/,                                msg:"must be a valid email address" },
};

export const validate = (form, rules) => {
  const errors = {};
  rules.forEach(({ field, label, required, min, pattern }) => {
    const val = form[field];
    const isEmpty = !val || String(val).trim()==="" || val===0 || val==="0";
    if (required && isEmpty) { errors[field] = `${label} is required`; return; }
    if (min !== undefined && +val < min) { errors[field] = `${label} must be ≥ ${min}`; return; }
    // Pattern check only runs on non-empty values, so optional fields (like
    // an optional Alt. GSTIN) don't error out just for being blank.
    if (pattern && !isEmpty && PATTERNS[pattern] && !PATTERNS[pattern].re.test(String(val).trim().toUpperCase()))
      errors[field] = `${label} ${PATTERNS[pattern].msg}`;
  });
  return errors;
};

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
export const exportCSV = (filename, cols, rows) => {
  const esc = v => { const s=String(v??"").replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s; };
  const lines = [
    cols.map(c=>esc(c.label)).join(","),
    ...rows.map(row=>cols.map(c=>esc(c.exportVal?c.exportVal(row):(row[c.key]??""))).join(","))
  ].join("\n");
  const blob = new Blob(["\uFEFF"+lines],{type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"),{href:url,download:`${filename}_${today()}.csv`});
  a.click(); URL.revokeObjectURL(url);
};

// ─── GOOGLE SHEETS API ────────────────────────────────────────────────────────
import * as offlineDB from "./offlineDB.js";
import { denormalizeRows } from "./constants.js";
import { mergeQueueIntoResult, rowsConflict, isNetworkFailure, CREATED_AT_COL, CREATED_BY_COL, CREATED_AT_HEADER, CREATED_BY_HEADER } from "./offlineMerge.js";

const _API = (typeof import.meta!=="undefined"&&import.meta.env?.VITE_API_URL)||"YOUR_APPS_SCRIPT_WEB_APP_URL";
// Shared secret — must match CONFIG.API_KEY in apps-script-backend.js.
// Set VITE_API_KEY in your .env / Vercel project env vars. Never commit the real value.
const _KEY = (typeof import.meta!=="undefined"&&import.meta.env?.VITE_API_KEY)||"";
export const IS_DEMO = _API.includes("YOUR_");

// The passcode used to log in, held in memory (and mirrored to
// sessionStorage — see App.jsx) and sent as `code` with every request so the
// backend can resolve a role SERVER-SIDE and enforce it, rather than trusting
// whatever the frontend UI happens to show. Never logged, never sent
// anywhere except this app's own API.
let _authCode = "";
export const setAuthCode = code => { _authCode = code || ""; };

// post()/get() distinguish TWO very different failure modes:
//  - the fetch() call itself throwing (offline, DNS, CORS, timeout) → tagged
//    `isNetworkError:true`. This is the ONLY case sheetsAPI is allowed to
//    queue-and-retry instead of surfacing as a normal error.
//  - a reachable server responding with a non-OK status or a JSON {error}
//    (validation, permission, bad request) → a plain Error, never queued,
//    always surfaced immediately — queuing this would silently mask a real
//    problem behind a misleading "pending sync" state.
const post = async body => {
  let res;
  // IMPORTANT: Content-Type must stay "text/plain" here, NOT "application/json".
  // Apps Script Web Apps don't implement CORS preflight (no doOptions handler),
  // so any POST with a non-simple Content-Type gets blocked by the browser
  // before it's ever sent. text/plain is a CORS-safelisted header, so no
  // preflight is triggered. The backend still JSON.parses the raw body via
  // e.postData.contents regardless of the declared Content-Type, so this is
  // purely a browser-side workaround — no backend change needed.
  try { res = await fetch(_API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...body,key:_KEY,code:_authCode})}); }
  catch(e){ const err=new Error(e.message||"Network request failed"); err.isNetworkError=true; throw err; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error);
  return json;
};
const get = async url => {
  let res;
  try { res = await fetch(`${url}${url.includes("?")?"&":"?"}key=${encodeURIComponent(_KEY)}&code=${encodeURIComponent(_authCode)}`); }
  catch(e){ const err=new Error(e.message||"Network request failed"); err.isNetworkError=true; throw err; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error);
  return json;
};

// Fetches one sheet with NO fy filter — used for conflict re-checks and for
// locating a cached row's true position regardless of which FY tab it lives
// under. Bypasses the read() cache/queue-merge machinery on purpose: this is
// an internal freshness check, not something a module should ever call.
const getSheetRaw = sheet => get(`${_API}?sheet=${encodeURIComponent(sheet)}`);

export const sheetsAPI = {
  // Reads live when reachable; on a genuine network failure, serves the last
  // cached snapshot instead of erroring (so every module stays browsable
  // offline). Does NOT overlay the write queue — that's read()/readMany()'s
  // job (below). Split out so App.jsx's own same-session FY cache
  // (loadLiveData) can store this raw snapshot and re-merge the CURRENT
  // queue on top of it later, rather than baking in whatever queue state
  // existed at fetch time.
  async readRaw(sheet,fy=null){
    if(IS_DEMO) return {demo:true,data:[],headers:[]};
    const cacheKey = offlineDB.cacheKeyFor(sheet,fy);
    try{
      const r = await get(`${_API}?sheet=${encodeURIComponent(sheet)}${fy?`&fy=${fy}`:""}`);
      if (r && !r.error) offlineDB.setCache(cacheKey,{sheet,fy,headers:r.headers,data:r.data,savedAt:Date.now()});
      return r;
    }
    catch(e){
      if (!isNetworkFailure(e)) return {error:e.message};
      const cached = await offlineDB.getCache(cacheKey);
      if (!cached) return {error:`Offline, and no cached data yet for "${sheet}". Connect once to load it.`,offline:true};
      return {status:"ok",sheet,fy,headers:cached.headers,data:cached.data,count:cached.data.length,offline:true,cachedAt:cached.savedAt};
    }
  },
  // Reads live when reachable; on a genuine network failure, serves the last
  // cached snapshot instead of erroring (so every module stays browsable
  // offline). Either way, any of THIS user's own queued-but-unsynced writes
  // for `sheet` are overlaid on top before returning, so the view is
  // consistent whether the read came from the network or the cache.
  async read(sheet,fy=null){
    if(IS_DEMO) return {demo:true,data:[],headers:[]};
    const queue = await offlineDB.getQueue();
    const r = await sheetsAPI.readRaw(sheet,fy);
    return mergeQueueIntoResult(sheet,fy,r,queue);
  },
  // Same raw/merged split as readRaw()/read() above, but batched: fetches
  // several sheets in ONE network call (bulkRead on the backend opens the
  // Spreadsheet once and loops, instead of one Apps Script execution per
  // sheet — see apps-script-backend.js). Returns { [sheetName]: {data,headers,...} }
  // per sheet, unmerged — App.jsx's session FY cache stores this.
  async readManyRaw(sheetNames,fy=null){
    if(IS_DEMO){
      const entries = sheetNames.map(name => [name,{demo:true,data:[],headers:[]}]);
      return Object.fromEntries(entries);
    }
    const cacheKeyOf = name => offlineDB.cacheKeyFor(name,fy);
    try{
      const r = await get(`${_API}?action=bulkRead&sheets=${encodeURIComponent(sheetNames.join(","))}${fy?`&fy=${fy}`:""}`);
      const out = {};
      for (const name of sheetNames) {
        const sheetResult = r[name];
        if (sheetResult && !sheetResult.error) {
          offlineDB.setCache(cacheKeyOf(name),{sheet:name,fy,headers:sheetResult.headers,data:sheetResult.data,savedAt:Date.now()});
        }
        out[name] = sheetResult;
      }
      return out;
    }
    catch(e){
      // A non-network error (bad request, blanket auth failure) applies to
      // the whole batch the same way it would have to each individual read()
      // call — surface it per sheet immediately, never queue it.
      if (!isNetworkFailure(e)) {
        const out = {};
        for (const name of sheetNames) out[name] = {error:e.message};
        return out;
      }
      // Network failure: fall back to each sheet's own cached snapshot,
      // exactly like read() does for a single sheet.
      const out = {};
      for (const name of sheetNames) {
        const cached = await offlineDB.getCache(cacheKeyOf(name));
        out[name] = cached
          ? {status:"ok",sheet:name,fy,headers:cached.headers,data:cached.data,count:cached.data.length,offline:true,cachedAt:cached.savedAt}
          : {error:`Offline, and no cached data yet for "${name}". Connect once to load it.`,offline:true};
      }
      return out;
    }
  },
  // Fetch several sheets in ONE network call and overlay the write queue on
  // top, per sheet. Returns { [sheetName]: {data,headers,...} }, the exact
  // same shape the old N-calls-in-parallel version returned, so App.jsx and
  // everything else that calls readMany needs zero changes. Any individual
  // sheet that errors (role denied, missing tab) comes back as { error } for
  // that key only, so one bad sheet doesn't blank out the whole dashboard.
  async readMany(sheetNames,fy=null){
    if(IS_DEMO) return sheetsAPI.readManyRaw(sheetNames,fy);
    const queue = await offlineDB.getQueue();
    const raw = await sheetsAPI.readManyRaw(sheetNames,fy);
    const out = {};
    for (const name of sheetNames) out[name] = mergeQueueIntoResult(name,fy,raw[name],queue);
    return out;
  },
  // On a network failure, queues the append instead of erroring and applies
  // it optimistically (mergeQueueIntoResult picks it up on the very next
  // read). Returns {status:"queued"} — deliberately NOT {error:...} — so
  // existing per-module save handlers (which only branch on res.error) treat
  // this as a success and keep the optimistic-UI promise: the record shows
  // up immediately, sync happens quietly later.
  async append(sheet,row){
    if(IS_DEMO){ console.log("[DEMO] append →",sheet); return {status:"demo"}; }
    try{ return await post({action:"append",sheet,row}); }
    catch(e){
      if (!isNetworkFailure(e)) return {error:e.message};
      const fy = row?.[1] ?? null;
      const localId = await offlineDB.enqueueWrite({action:"append",sheet,row,fy});
      return {status:"queued",queued:true,localId,offline:true};
    }
  },
  async update(sheet,rowIndex,updates){
    if(IS_DEMO){ console.log("[DEMO] update →",sheet,rowIndex); return {status:"demo"}; }
    // Root-cause guard (not just the Tbl UI's disabled-button check): a null
    // rowIndex means the row is still a queued, unsynced CREATE — there's no
    // real Sheet row to address yet. The backend always rejects rowIndex:null
    // and, if this were allowed through while offline, the resulting queued
    // "update" entry could NEVER succeed (rowIndex never becomes real) and
    // would retry forever with no user-facing way to clear it. Fail fast and
    // clearly instead of ever creating that stuck state.
    if (rowIndex==null) return {error:"This record hasn't finished syncing yet — try again once it's synced."};
    try{ return await post({action:"update",sheet,rowIndex,updates}); }
    catch(e){
      if (!isNetworkFailure(e)) return {error:e.message};
      const baseline = await captureBaseline(sheet,rowIndex);
      const localId = await offlineDB.enqueueWrite({action:"update",sheet,rowIndex,row:updates,baseline});
      return {status:"queued",queued:true,localId,offline:true};
    }
  },
  async softDelete(sheet,rowIndex){
    if(IS_DEMO){ console.log("[DEMO] delete →",sheet,rowIndex); return {status:"demo"}; }
    // Same root-cause guard as update() above — see comment there.
    if (rowIndex==null) return {error:"This record hasn't finished syncing yet — try again once it's synced."};
    try{ return await post({action:"delete",sheet,rowIndex}); }
    catch(e){
      if (!isNetworkFailure(e)) return {error:e.message};
      const baseline = await captureBaseline(sheet,rowIndex);
      const localId = await offlineDB.enqueueWrite({action:"softDelete",sheet,rowIndex,baseline});
      return {status:"queued",queued:true,localId,offline:true};
    }
  },
  // Writes one invoice's full line-item set in a single request: soft-
  // deletes the invoice's existing item rows, then appends the fresh ones
  // (see saveInvoiceItems in apps-script-backend.js). `items` is an array
  // of rows already built by buildInvoiceItemRow — this function doesn't
  // build rows itself, same convention as append()/update() above.
  // On a network failure this queues as ONE offline-queue entry (not one
  // per item), so it replays as a single atomic write on reconnect — see
  // syncEntry's "saveInvoiceItems" case below.
  async saveInvoiceItems(invoiceNo,fy,items){
    if(IS_DEMO){ console.log("[DEMO] saveInvoiceItems →",invoiceNo); return {status:"demo"}; }
    try{ return await post({action:"saveInvoiceItems",invoiceNo,fy,items}); }
    catch(e){
      if (!isNetworkFailure(e)) return {error:e.message};
      const localId = await offlineDB.enqueueWrite({action:"saveInvoiceItems",sheet:"Sales Invoice Items",invoiceNo,fy,items});
      return {status:"queued",queued:true,localId,offline:true};
    }
  },
  // Reads "Sales Invoice Items" via the existing generic read path (no new
  // read endpoint) and filters client-side to this one invoice — mirrors
  // how other modules filter FY-scoped data client-side after a generic
  // read. Degrades to [] on any error (including an old deployment where
  // the sheet doesn't exist yet — the backend already soft-fails that case,
  // this is just the client-side half of the same "no items shown, never
  // crash" contract), so callers can always render straight from the
  // result without their own error branch.
  async getInvoiceItems(invoiceNo){
    if(IS_DEMO) return [];
    const r = await sheetsAPI.read("Sales Invoice Items");
    if (!r || r.error) return [];
    return denormalizeRows("Sales Invoice Items",r)
      .filter(i=>i.invoiceNo===invoiceNo && i.deleted!==true && i.deleted!=="TRUE")
      .sort((a,b)=>(+a.srNo||0)-(+b.srNo||0));
  },
  // Never falls back to a hardcoded "001" when offline — that's exactly what
  // risks two people, both offline, being handed the same document number.
  // Offline gets a clearly-fake DRAFT-<PREFIX>-<n> placeholder instead; the
  // real serial is assigned by the locked backend nextSerial() at sync time
  // (see resolveDraftSerial in flushQueue below), matching the existing
  // "fetch the serial immediately before writing" rule this app already
  // follows for the online path.
  async nextSerial(sheet,prefix,fy){
    if(IS_DEMO) return `KE/${prefix}/${fy}/001`;
    try{ const r=await get(`${_API}?action=nextSerial&sheet=${encodeURIComponent(sheet)}&prefix=${prefix}&fy=${fy}`);
         return r.serial||`KE/${prefix}/${fy}/001`; }
    catch(e){
      if (isNetworkFailure(e)) return await offlineDB.nextDraftSerial(sheet,prefix,fy);
      return `KE/${prefix}/${fy}/001`; // non-network error: preserve prior fallback behavior
    }
  },
  // Reads every Config row (passcodes, company info, alert thresholds) as one
  // { KEY: value } object. Called before login (to check passcodes live) and
  // by Settings (to prefill and later verify saves).
  async getConfig(){
    if(IS_DEMO) return {status:"demo",config:{}};
    try{ return await get(`${_API}?action=config`); }
    catch(e){ return {error:e.message,config:{}}; }
  },
  // Upserts one Config key. Used by Settings — every field there must
  // round-trip through here, never just update local component state.
  async setConfig(configKey,value,notes){
    if(IS_DEMO){ console.log("[DEMO] setConfig →",configKey,value); return {status:"demo"}; }
    try{ return await post({action:"setConfig",configKey,value,notes}); }
    catch(e){ return {error:e.message}; }
  },

  // Count-only dry run for the Admin archiving screen — no writes. Never
  // queued offline: archiving is an Admin-desk operation, not a field task
  // that needs to survive a dropped connection.
  async archivePreview(yearsToKeep){
    if(IS_DEMO) return {status:"demo",results:[]};
    try{ return await get(`${_API}?action=archivePreview&yearsToKeep=${encodeURIComponent(yearsToKeep)}`); }
    catch(e){ return {error:e.message}; }
  },
  // The real, destructive-adjacent archiving run. Deliberately NOT queued on
  // a network failure like append/update/softDelete — an archive run must
  // either fully happen now (with its own audit-log row) or the Admin
  // clearly sees it failed and can retry, never silently replay later from
  // an offline queue against whatever the sheet looks like by then.
  async archiveFY(yearsToKeep,runBy){
    if(IS_DEMO){ console.log("[DEMO] archiveFY →",yearsToKeep); return {status:"demo",results:[]}; }
    try{ return await post({action:"archiveFY",yearsToKeep,runBy}); }
    catch(e){ return {error:e.message}; }
  },

  // ─── OFFLINE QUEUE MANAGEMENT (used by App.jsx for the header indicator,
  // "Sync now", and the conflict-resolution modal) ───────────────────────────
  async getPendingWrites(){ return offlineDB.getQueue(); },
  // "Discard" in the Sync Queue panel — permanently drops a stuck "error"
  // entry without ever pushing it. Destructive and irreversible; the panel
  // confirms with the person before calling this.
  async discardQueueItem(localId){ return offlineDB.removeQueueItem(localId); },
  subscribeQueue: fn => offlineDB.subscribeQueue(fn),
  flushQueue: () => flushQueue(),
  retryOne: localId => retryOne(localId),
  resolveConflict: (localId,choice) => resolveConflict(localId,choice),
};

// Snapshot of a row's current Created At/By, sourced from whichever cached
// sheet snapshot has it (any FY — row addressing is sheet-wide). This is
// "the version the edit was based on": since the row was loaded into the
// form from this same cache/live-read, it's exactly right as a baseline.
// Returns null if nothing cached yet — callers treat that as "can't verify,
// proceed" (documented in rowsConflict/flushQueue).
async function captureBaseline(sheet,rowIndex){
  const found = await offlineDB.findCachedRow(sheet,rowIndex);
  if (!found) return null;
  return { createdAt: found.row[CREATED_AT_HEADER], createdBy: found.row[CREATED_BY_HEADER] };
}

// Re-checks one queued update/delete against the LIVE sheet (not cache) right
// before pushing it, comparing columns 2-3 (Created At/By) against the
// baseline captured when it was queued. No live match found (row hard-deleted
// elsewhere, sheet unreachable for a non-network reason) is treated as "can't
// conflict" and lets the write proceed — the backend will simply error it out
// on its own terms if the row is truly gone.
async function checkConflict(entry){
  if (!entry.baseline) return {conflict:false};
  try{
    const r = await getSheetRaw(entry.sheet);
    if (!r || r.error) return {conflict:false};
    const live = (r.data||[]).find(row=>row._rowNum===entry.rowIndex);
    if (!live) return {conflict:false};
    const liveSnap = { createdAt: live[CREATED_AT_HEADER], createdBy: live[CREATED_BY_HEADER] };
    if (!rowsConflict(entry.baseline, liveSnap)) return {conflict:false};
    return {conflict:true, theirs:{...liveSnap, row:live, headers:r.headers}};
  } catch(e){
    if (isNetworkFailure(e)) throw e; // bubble up — whole flush is offline again, stop the loop
    return {conflict:false};
  }
}

// When entry A (an update to some row) syncs successfully, any OTHER still-
// queued entry for that exact same row was, if made offline in the same
// session, based on the SAME pre-sync baseline — so after A lands, B's
// baseline is stale even though B is really just the same person's own next
// edit, not a real conflict. Advance B's baseline to A's post-sync stamp
// (columns 2-3 of the row A just wrote) so sequential offline edits to one
// record don't falsely conflict with each other.
async function propagateBaseline(sheet,rowIndex,syncedRow,exceptLocalId){
  const queue = await offlineDB.getQueue();
  const newBaseline = { createdAt: syncedRow[CREATED_AT_COL], createdBy: syncedRow[CREATED_BY_COL] };
  await Promise.all(queue
    .filter(q=>q.sheet===sheet && q.rowIndex===rowIndex && q.localId!==exceptLocalId && q.status!=="conflict")
    .map(q=>offlineDB.updateQueueItem(q.localId,{baseline:newBaseline})));
}

// Syncs ONE queue entry (the shared logic behind both flushQueue's loop and
// retryOne, below, so they can never drift out of sync). Returns "synced" or
// "conflict" on success; throws on failure (network or genuine server
// error) — callers decide how to record that.
async function syncEntry(entry){
  if (entry.action==="append"){
    let row = entry.row;
    if (typeof row?.[0]==="string" && row[0].startsWith("DRAFT-")){
      const prefix = row[0].split("-")[1] || "ID";
      const real = await liveNextSerial(entry.sheet, prefix, entry.fy);
      row = row.slice(); row[0] = real;
    }
    const res = await post({action:"append",sheet:entry.sheet,row});
    if (res?.error) throw new Error(res.error);
    await offlineDB.removeQueueItem(entry.localId);
    return "synced";
  }
  if (entry.action==="update" || entry.action==="softDelete"){
    const check = await checkConflict(entry);
    if (check.conflict){
      await offlineDB.updateQueueItem(entry.localId,{status:"conflict",theirs:check.theirs});
      return "conflict";
    }
    if (entry.action==="update"){
      const res = await post({action:"update",sheet:entry.sheet,rowIndex:entry.rowIndex,updates:entry.row});
      if (res?.error) throw new Error(res.error);
      if (entry.row) await propagateBaseline(entry.sheet,entry.rowIndex,entry.row,entry.localId);
    } else {
      const res = await post({action:"delete",sheet:entry.sheet,rowIndex:entry.rowIndex});
      if (res?.error) throw new Error(res.error);
    }
    await offlineDB.removeQueueItem(entry.localId);
    return "synced";
  }
  if (entry.action==="saveInvoiceItems"){
    // No conflict check here (unlike update/softDelete above) — this is a
    // full soft-delete-then-append replace, not a positional edit, so
    // there's no single "baseline row" to compare against. Runs the exact
    // same backend action a live saveInvoiceItems call would.
    const res = await post({action:"saveInvoiceItems",invoiceNo:entry.invoiceNo,fy:entry.fy,items:entry.items});
    if (res?.error) throw new Error(res.error);
    await offlineDB.removeQueueItem(entry.localId);
    return "synced";
  }
  return "synced"; // unknown action — shouldn't happen, nothing to do
}

// Pushes every queued write in the order it was made. Stops (rather than
// erroring out the whole batch) the moment a genuine network failure shows
// up again — the rest stays queued for the next attempt. A queued item whose
// sync attempt reveals a genuine (non-network) server error is marked
// "error" and kept, rather than retried forever or silently dropped.
async function flushQueue(){
  if (IS_DEMO) return {synced:0,conflicts:0,failed:0};
  const queue = await offlineDB.getQueue();
  let synced=0, conflicts=0, failed=0;
  for (const entry of queue){
    if (entry.status==="conflict") { conflicts++; continue; } // awaiting the user's Keep mine/theirs choice
    try{
      const outcome = await syncEntry(entry);
      if (outcome==="conflict") { conflicts++; continue; }
      synced++;
      if (entry.action==="update" && entry.row) {
        // Also patch the in-memory queue (not just IndexedDB) so a LATER
        // entry for this same row in this same flush pass sees the fresh
        // baseline immediately — otherwise it'd compare against the
        // pre-sync baseline it was loaded with at the top of this
        // function and falsely conflict with its own sibling edit.
        const newBaseline = { createdAt: entry.row[CREATED_AT_COL], createdBy: entry.row[CREATED_BY_COL] };
        queue.forEach(q => { if (q.sheet===entry.sheet && q.rowIndex===entry.rowIndex && q.localId!==entry.localId && q.status!=="conflict") q.baseline = newBaseline; });
      }
    } catch(e){
      if (isNetworkFailure(e)) { failed++; break; } // offline again — leave the rest queued, stop for now
      await offlineDB.updateQueueItem(entry.localId,{status:"error",errorMsg:e.message});
      failed++;
    }
  }
  return {synced,conflicts,failed};
}

// Re-attempts ONE queue entry (used by the Sync Queue panel's "Retry now" on
// an individual error/pending row) instead of running the whole queue —
// runs it through the exact same syncEntry() logic flushQueue's loop uses.
// A network failure here does NOT mark the entry "error" (it's still just
// offline, will retry automatically once reconnected); a genuine server
// error does, same as flushQueue.
async function retryOne(localId){
  if (IS_DEMO) return {error:"Not available in demo mode"};
  const entry = await offlineDB.getQueueItem(localId);
  if (!entry) return {error:"That change is no longer pending — it may have already synced."};
  try{
    const outcome = await syncEntry(entry);
    return {status: outcome==="conflict" ? "conflict" : "ok"};
  } catch(e){
    if (isNetworkFailure(e)) return {error:"Still offline — will retry automatically once you're back online."};
    await offlineDB.updateQueueItem(localId,{status:"error",errorMsg:e.message});
    return {error:e.message};
  }
}

// Real nextSerial() call used only at sync time to resolve a DRAFT-* id into
// a real one — separate from sheetsAPI.nextSerial so a network failure here
// (e.g. connection drops mid-flush) throws normally and is handled by
// flushQueue's own try/catch rather than silently minting another draft.
async function liveNextSerial(sheet,prefix,fy){
  const r = await get(`${_API}?action=nextSerial&sheet=${encodeURIComponent(sheet)}&prefix=${prefix}&fy=${fy}`);
  return r.serial || `KE/${prefix}/${fy}/001`;
}

// "Keep mine" force-pushes the offline edit over whatever is live now.
// "Keep theirs" simply drops the queued edit — the next read already shows
// the live version since we never touch the server for that side.
async function resolveConflict(localId,choice){
  const entry = await offlineDB.getQueueItem(localId);
  if (!entry) return {error:"That change is no longer pending — it may have already synced."};
  if (choice==="theirs"){ await offlineDB.removeQueueItem(localId); return {status:"ok"}; }
  try{
    const res = entry.action==="update"
      ? await post({action:"update",sheet:entry.sheet,rowIndex:entry.rowIndex,updates:entry.row})
      : await post({action:"delete",sheet:entry.sheet,rowIndex:entry.rowIndex});
    if (res?.error) return {error:res.error};
    if (entry.action==="update" && entry.row) await propagateBaseline(entry.sheet,entry.rowIndex,entry.row,localId);
    await offlineDB.removeQueueItem(localId);
    return {status:"ok"};
  } catch(e){
    if (isNetworkFailure(e)) return {error:"Still offline — try again once you're back online."};
    return {error:e.message};
  }
}

// ─── ROW BUILDERS (column order matches Google Sheets schema exactly) ─────────
const ts = () => new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"});
export const buildJobRow      = (f,fy,u)   => [f.id,fy,ts(),u,f.client,f.turbine,f.oemMake,f.capacity,f.type,f.status,f.startDate,f.completionDate,f.poNo,f.poDate,+f.poValue||0,f.siteLocation,f.siteEngineer,f.assignedTo,+f.labourCharges||0,+f.materialCharges||0,+f.travelCharges||0,+f.otherCharges||0,+f.estimatedValue||0,f.scopeOfWork,f.specialTools,f.safetyRequirements,f.workPermitNo||"",f.lastOverhaulDate||"",f.rpm||"",f.lubOilType||"",+f.warrantyPeriod||0,f.invoiceStatus||"Pending",f.remarks||""];
// c.materialCharges is the resolved number calcInvoice() actually used
// (items-derived total when f.items is populated, else the legacy typed
// field) — using it here instead of re-reading +f.materialCharges keeps the
// saved row consistent with whatever total was shown on screen.
export const buildInvoiceRow  = (f,c,fy,u) => [f.invoiceNo,fy,ts(),u,f.date,f.client,f.jobRef||"",f.poNo||"",f.poDate||"",f.description,f.scopeDetails||"",+f.labourCharges||0,+(c.materialCharges??f.materialCharges)||0,+f.travelCharges||0,+f.otherCharges||0,c.sub,+f.discount||0,c.taxable,f.gstType,c.cgst,c.sgst,c.igst,c.gstAmt,f.tdsApplicable,+f.tdsRate||0,c.tdsAmt,c.grand,c.netPay,f.paymentTerms,f.dueDate||"",f.bankName||"",f.accountNo||"",f.ifsc||"","Unpaid",0,"",f.placeOfSupply||"",f.remarks||"",f.ewayBillNo||"",f.vehicleNo||""];
// One row per Sales Invoice line item, column order matching the "Sales
// Invoice Items" headers in apps-script-backend.js SCHEMA exactly. srNo is
// the item's 1-based position within THIS save — it's a display/print
// field only, never used to address the row (that's always Invoice No. +
// the sheet's own row number).
export const buildInvoiceItemRow = (item,invoiceNo,fy,srNo) => [invoiceNo,fy,srNo,item.description||"",item.hsn||"",+item.qty||0,item.unit||"",+item.rate||0,(+item.qty||0)*(+item.rate||0),ts(),false];
export const buildPurchaseRow = (f,c,fy,u) => [f.ourRef||"",fy,ts(),u,f.date,f.vendorInvNo,f.vendorName,f.description,f.jobRef||"",f.poRef||"",f.category,+f.basicAmount||0,+f.discount||0,c.taxable,f.gstType,c.cgst,c.sgst,c.igst,c.gstTot,f.tdsApplicable,f.tdsSection||"194C",+f.tdsRate||0,c.tdsAmt,c.grand,c.netPay,f.itcEligible,f.paymentStatus,f.paymentMode,+f.amountPaid||0,f.paymentDate||"",f.utrRef||"",f.remarks||""];
export const buildQuotationRow= (f,fy,u)   => [f.id,fy,ts(),u,f.client,f.subject,f.date,f.validTill||"",f.followUp||"",+f.value||0,+f.gstPct||18,Math.round((+f.value)*(+f.gstPct)/100),Math.round((+f.value)*(1+(+f.gstPct)/100)),+f.discountPct||0,f.paymentTerms,f.deliveryTerms,f.scopeNotes||"",f.preparedBy,f.revision,f.status,f.remarks||""];
export const buildClientRow   = (f,fy,u)   => [f.code,fy,ts(),u,f.name,f.sector,f.contact,f.designation||"",f.mobile,f.altMobile||"",f.whatsapp||"",f.email||"",f.altEmail||"",f.address||"",f.city,f.state,f.pin||"",f.gstin||"",f.pan||"",+f.creditLimit||0,f.paymentTerms,+f.annualPotential||0,f.tdsApplicable,f.tdsRate||"",+f.noOfTurbines||0,f.oemInstalled||"",f.seasonalDependency||"",f.contact,f.influencer||"",f.source||"",f.status,f.nextFollowup||"","",0,f.remarks||""];
// Column order matches "IndiaMART Leads" headers in apps-script-backend.js
// SCHEMA exactly (see FIELD_MAPS comment in constants.js). Required fields
// (dateReceived/companyName/contactPerson/mobile/productEnquired, plus the
// select-backed status/priority/leadType which always carry a BLANK
// default) go through unwrapped — same convention as buildClientRow above;
// every genuinely optional field is wrapped `||""` / `+field||0` so a blank
// stays a clean empty cell / zero instead of "undefined" / "NaN".
// Win rate for the IndiaMART Leads KPI strip — pulled out as its own pure
// function (like calcItemsTotal above) specifically so the "0 Won + 0 Lost"
// edge case can be unit tested directly, instead of only being exercised
// via a component render this codebase has no harness for. Returns "—" on
// the divide-by-zero case, never "NaN%" or "Infinity%".
export const calcWinRate = (won,lost) => (won+lost)===0 ? "—" : `${Math.round((won/(won+lost))*100)}%`;

export const buildLeadRow = (f,fy,u) => [
  f.leadId,fy,ts(),u,
  f.dateReceived,f.queryId||"",
  f.companyName,f.contactPerson,f.mobile,f.altMobile||"",
  f.whatsappOpted||"No",f.email||"",
  f.city||"",f.state||"",
  f.productEnquired,f.requirementDetails||"",
  f.leadType,+f.budget||0,f.priority,
  f.status,f.quotationRef||"",+f.quotedValue||0,
  f.firstContactedAt||"",+f.responseTimeHrs||0,
  f.followUpDate||"",f.wonDate||"",f.lostReason||"",
  f.competitorMentioned||"",f.assignedTo||"",f.remarks||"",
];
export const buildVendorRow   = (f,fy,u)   => [f.code,fy,ts(),u,f.name,f.category,f.contact,f.designation||"",f.mobile,f.altMobile||"",f.email||"",f.city||"",f.state||"",f.gstin||"",f.pan||"",f.bankName||"",f.accountNo||"",f.ifsc||"",f.accountType||"Current",f.paymentTerms,+f.creditLimitGiven||0,f.mseStatus,f.productList||"",+f.rating||3,f.status,"",0,f.remarks||""];
export const buildInventoryRow= (f,fy,u)   => [f.code,fy,ts(),u,f.name,f.category,f.hsnCode||"",f.unit,+f.opening||0,0,0,+f.opening||0,+f.reorder||0,+f.moq||1,+f.leadTimeDays||0,+f.purchasePrice||0,+f.unitCost||0,Math.round((+f.opening||0)*(+f.unitCost||0)),f.supplier||"",f.altSupplier||"",f.rack||"",f.condition||"New",f.shelfLife||"",today(),f.remarks||""];
export const buildExpenseRow  = (f,fy,u)   => [f.voucherNo||"",fy,ts(),u,f.date,f.category,f.subCategory||"",f.description,f.vendor||"",f.mode,(+f.amount||0),(+f.gst||0),f.gstType,(+f.amount||0)+(+f.gst||0),f.billNo||"",f.approvedBy,f.jobRef||"",f.remarks||""];
export const buildPettyCashRow= (f,type,fy,u)=>  [f.id||"",fy,ts(),u,f.date,type,f.category||"Top-up",f.description||f.remarks||"",f.paidTo||"",f.receivedFrom||"",f.mode||"Cash",+f.amount||0,f.voucherNo||"",f.jobRef||"",f.approvedBy||f.by||"Keshav Sharma",f.remarks||""];
export const buildLedgerRow   = (f,fy,u)   => [f.voucherNo||"",fy,ts(),u,f.date,f.party,f.type,f.narration,f.invoiceRef||"",f.chequeUtr||"",f.bankName||"",(+f.debit||0),(+f.credit||0),(+f.tds||0),(+f.gst||0),f.dueDate||"",f.remarks||""];
export const buildFDRow       = (f,fy,u)   => [f.fdNo,fy,ts(),u,f.bank,f.branch||"",f.fdReceiptNo||"",f.fdType,+f.principal||0,+f.rate||0,f.depositDate,+f.tenureMonths||12,calcMaturityDate(f.depositDate,f.tenureMonths),f.interestPayout,f.nominee||"",f.nomineeRelation||"",f.autoRenew,f.pledged,"Active",f.remarks||""];
export const buildAssetRow    = (f,fy,u)   => { const tot=(+f.cost||0)+(+f.installCost||0); return [f.code,fy,ts(),u,f.name,f.category,f.location||"",f.vendor||"",f.purchaseDate,f.invoiceNo||"",+f.cost||0,+f.installCost||0,tot,+f.usefulLife||10,+f.depRate||0,calcAnnualDep(f.cost,f.installCost,f.depRate),0,tot,f.status||"Active",f.insuranceExpiry||"",f.amc||"No",f.serialNo||"",f.remarks||""]; };
export const buildAttendanceRow=(f,fy,u)   => { const w=Math.round((+f.hoursWorked/8)*(+f.dailyRate)); return [f.id||"",fy,ts(),u,f.date,f.workerName,f.designation||"",f.type,f.jobRef||"",f.siteLocation||"",+f.hoursWorked||0,+f.dailyRate||0,w,+f.advanceDeducted||0,w-(+f.advanceDeducted||0),f.remarks||""]; };
export const buildVehicleRow  = (f,fy,u)   => { const km=Math.max(0,(+f.odometerEnd||0)-(+f.odometerStart||0)); return [f.logId||"",fy,ts(),u,f.date,f.vehicle,f.driver||"",f.purpose,f.jobRef||"",f.destination,+f.odometerStart||0,+f.odometerEnd||0,km,+f.fuelL||0,+f.fuelCost||0,+f.toll||0,f.remarks||""]; };
export const buildVaultRow    = (f,fy,u)   => [`DOC-${Date.now()}`,fy,ts(),u,f.name,f.category,f.docNo||"",f.issuingAuthority||"",today(),f.driveLink,f.expiry||"—",f.fileSize||"",f.addedBy||u,f.remarks||""];
export const buildTDSRow      = (f,fy,u)   => [f.id||"",fy,ts(),u,f.date,f.type,f.party,f.pan||"",f.nature,f.section,+f.amount||0,+f.rate||0,+f.tdsAmt||0,f.quarter,f.challan||"",f.depositDate||"",f.status||"Pending",f.remarks||""];

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
export const waLink = (mobile,msg) => `https://wa.me/91${String(mobile||"").replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`;
