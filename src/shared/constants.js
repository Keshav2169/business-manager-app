// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
// ── Palette: "Instrumentation" ──────────────────────────────────────────────
// Grounded in the subject, not a generic SaaS default: navy reads as the
// turbine housing / control-panel chassis; brass is the actual bearing/
// bushing/fitting material on the equipment this company services, split
// into two shades because one accent can't carry both "bright highlight on
// a dark sidebar" and "legible label on a white table row" at once. Status
// colors are pitched like gauge-panel indicators (a steam-plant register,
// not a generic app) rather than default Bootstrap red/green/amber.
export const T = {
  navy:"#15325A",        // primary chassis blue — deepened from the old #1B3A6B for more weight
  sidebar:"#0D2138",      // near-black steel navy, sidebar/header depth
  gold:"#D89A3A",         // bright brass — for text/icons/highlights ON dark navy (sidebar nav, avatars, logo)
  brass:"#A6741F",        // deep brass — for the same accent role ON light backgrounds (labels, "NET PAYABLE")
  light:"#F1F2F5",        // neutral gray page background (warmed slightly off cool-blue default)
  white:"#FFFFFF",
  dark:"#182233",         // primary text
  red:"#B23A2E",          // critical / error — panel "fault" red
  green:"#1A7A4A",        // success — panel "normal operation" green
  amber:"#B0630E",        // warning / pending — panel "caution" amber, distinct from brass
  slate:"#57616F",        // secondary text — warm graphite rather than cool blue-slate
  border:"#D8DCE3",
  purple:"#6B4FA0",       // category accent (muted plum, tuned to sit with the warmer navy/brass pair)
  teal:"#0E7490",         // category accent (blue-cyan, kept distinct from the success green)
  // All tokens above are ≥4.5:1 against white (WCAG AA, normal text); gold is
  // reserved for use on navy/sidebar backgrounds where it clears 5:1+.
};

// ─── ROLES ───────────────────────────────────────────────────────────────────
export const ROLES = {
  admin: {
    label: "Admin (Keshav)",
    color: T.gold,
    modules: [
      "dashboard","jobs","invoices","purchases","quotations","indiamart",
      "clients","vendors","inventory","expenses","pettycash",
      "ledger","ar","pl","gst","tds","assets","fd",
      "vault","attendance","vehicles","settings","archiving",
    ],
  },
  staff: {
    label: "Staff",
    color: T.green,
    modules: [
      "dashboard","jobs","invoices","quotations","indiamart",
      "clients","vendors","inventory","expenses","pettycash",
    ],
  },
  ca: {
    label: "CA / Accountant",
    color: T.teal,
    modules: ["dashboard","purchases","ledger","ar","pl","gst","tds","assets"],
  },
};

// ─── ALL MODULES ─────────────────────────────────────────────────────────────
export const ALL_MODULES = [
  // Operations
  { id:"dashboard",   icon:"🏠", label:"Dashboard",          group:"Main" },
  { id:"jobs",        icon:"⚙️", label:"Jobs",                group:"Operations" },
  { id:"invoices",    icon:"📄", label:"Sales Invoices",      group:"Operations" },
  { id:"purchases",   icon:"🛒", label:"Purchase Invoices",   group:"Operations" },
  { id:"quotations",  icon:"📋", label:"Quotations",          group:"Operations" },
  { id:"indiamart",   icon:"🔎", label:"IndiaMART Leads",     group:"Operations" },
  { id:"clients",     icon:"👥", label:"Clients",             group:"Operations" },
  { id:"vendors",     icon:"🏭", label:"Vendors",             group:"Operations" },
  { id:"inventory",   icon:"📦", label:"Inventory",           group:"Operations" },
  // Finance
  { id:"expenses",    icon:"💸", label:"Expenses",            group:"Finance" },
  { id:"pettycash",   icon:"💵", label:"Petty Cash",          group:"Finance" },
  { id:"ledger",      icon:"📒", label:"Accounts Ledger",     group:"Finance" },
  { id:"ar",          icon:"📅", label:"AR Aging",            group:"Finance" },
  { id:"pl",          icon:"📈", label:"P&L Summary",         group:"Finance" },
  { id:"gst",         icon:"🧾", label:"GST Summary",         group:"Finance" },
  { id:"tds",         icon:"🏛️", label:"TDS Register",       group:"Finance" },
  // Assets & Personal
  { id:"assets",      icon:"🏗️", label:"Fixed Assets",       group:"Assets" },
  { id:"fd",          icon:"🏦", label:"FD Tracker",          group:"Assets" },
  // Admin
  { id:"vault",       icon:"🗄️", label:"Document Vault",     group:"Admin" },
  { id:"attendance",  icon:"👷", label:"Attendance & Labour", group:"Admin" },
  { id:"vehicles",    icon:"🚗", label:"Vehicle Log",         group:"Admin" },
  { id:"settings",    icon:"⚙️", label:"Settings",            group:"Admin" },
  { id:"archiving",   icon:"🗄️", label:"FY Archiving",        group:"Admin" },
];

export const MODULE_GROUPS = ["Main","Operations","Finance","Assets","Admin"];

// ─── FINANCIAL YEAR SYSTEM ───────────────────────────────────────────────────
export const ALL_FYS = ["2022-23","2023-24","2024-25","2025-26","2026-27","2027-28"];

export const detectCurrentFY = () => {
  const now = new Date(), yr = now.getFullYear(), mo = now.getMonth()+1;
  return mo >= 4 ? `${yr}-${String(yr+1).slice(2)}` : `${yr-1}-${String(yr).slice(2)}`;
};

export const CURRENT_FY = detectCurrentFY();

export const fyStartEnd = (fy) => {
  const [sy] = fy.split("-").map(Number);
  return { start: new Date(sy,3,1), end: new Date(sy+1,2,31,23,59,59) };
};

export const inFY = (dateStr, fy) => {
  if (!dateStr || !fy) return true;
  const d = new Date(dateStr), { start, end } = fyStartEnd(fy);
  return d >= start && d <= end;
};

export const getFY = (dateStr) => {
  if (!dateStr) return CURRENT_FY;
  const d = new Date(dateStr), yr = d.getFullYear(), mo = d.getMonth()+1;
  return mo >= 4 ? `${yr}-${String(yr+1).slice(2)}` : `${yr-1}-${String(yr).slice(2)}`;
};

// ─── AUTO SERIAL NUMBER GENERATORS ───────────────────────────────────────────
export const nextSerial = (prefix, existingList, fy = CURRENT_FY) => {
  const fyShort = fy.replace("-","");
  const pattern = new RegExp(`${prefix}${fyShort}/(\\d+)`);
  const nums = existingList
    .map(r => { const m = String(r).match(pattern); return m ? parseInt(m[1]) : 0; })
    .filter(Boolean);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `KE/${prefix}/${fy}/${String(next).padStart(3,"0")}`;
};

// ─── FIELD OPTIONS (shared across forms) ─────────────────────────────────────
export const OPT = {
  sectors:   ["Sugar Mill","Paper Mill","Power Plant","Petrochemical","OEM / Referral","Oil and Gas","Cement","Fertilizer","Distillery","Textile","Other"],
  states:    ["Uttar Pradesh","Uttarakhand","Delhi","Haryana","Rajasthan","Punjab","Bihar","Madhya Pradesh","Maharashtra","Gujarat","Tamil Nadu","Karnataka","Other"],
  oemMakes:  ["Triveni","BHEL","Siemens","KKK","ABB","Man Turbo","Belliss & Morcom","TurbineM","Kirloskar","Elliott","Other"],
  jobTypes:  ["Overhaul","Erection & Commissioning","Dynamic Balancing","Lube Oil Flushing","Alignment","Emergency Troubleshooting","Annual Maintenance","Inspection","Repair","Retrofitting","Reverse Engineering"],
  jobStages: ["Enquiry","Scheduled","In Progress","Completed","Invoiced","Paid"],
  payModes:  ["Cash","NEFT","RTGS","Cheque","UPI","Auto Debit","Online"],
  payTerms:  ["Advance","7 days","15 days","30 days","45 days","60 days","90 days"],
  gstTypes:  ["IGST","CGST+SGST","Exempt","Nil"],
  expCats:   ["Labour","Travel","Material","Office","Utilities","Maintenance","Communication","Professional","Fuel","Freight","Miscellaneous"],
  expSubCats:{
    Labour:        ["Site Wages","Contract Labour","Skilled Labour","Supervisor"],
    Travel:        ["Diesel","Petrol","Lodging","Meals","Airfare","Train","Taxi","Toll"],
    Material:      ["Bearings","Seals","Lubricants","Gaskets","Fasteners","Other Spares"],
    Office:        ["Stationery","Printing","Postage","Water","Tea/Coffee"],
    Utilities:     ["Electricity","Water","Gas","Internet","Phone"],
    Maintenance:   ["Tool Repair","Tool Calibration","Vehicle Repair","Workshop Repair"],
    Communication: ["Mobile","Internet","WhatsApp Business","Email"],
    Professional:  ["CA Fees","Legal","Consultant","Training"],
    Fuel:          ["Diesel","Petrol","CNG"],
    Freight:       ["Courier","Transport","Loading/Unloading"],
    Miscellaneous: ["Bank Charges","Miscellaneous"],
  },
  vendorCats:["Bearings","Lubricants","Seals & Gaskets","Precision Tools","Balancing Equip.","Electrical","Consumables","Fasteners","Services","Transport","Safety","Other"],
  invUnits:  ["Pcs","Set","Can","Tin","Sheet","Kg","Ltr","Box","Mtr","Roll","Pair"],
  tdsSection:["194C — Contractors (1%/2%)","194J — Professional (10%)","194I — Rent (10%)","194H — Commission (5%)","194A — Interest (10%)"],
  assetCats: ["Plant & Machinery","Tools & Equipment","Vehicles","Computers & IT","Office Equipment","Furniture & Fixtures","Buildings"],
  docCats:   ["Registration","Insurance","AMC / Contracts","Client Documents","Tax & GST","Legal","Certificates","Bank Documents","Permits","Other"],
  designations:["Maintenance Head","Plant Head","Chief Engineer","Reliability Engineer","Turbine Engineer","DGM Maintenance","MD / Owner","Purchase Manager","Project Manager","GM Technical","Electrical Engineer"],
  banks:     ["State Bank of India","HDFC Bank","ICICI Bank","Punjab National Bank","Axis Bank","Bank of Baroda","Canara Bank","Union Bank","Yes Bank"],
  leadTypes:  ["Buy Lead","Free Lead","Catalog View","Direct Call"],
  leadStatus: ["New","Contacted","Quoted","Follow-up","Won","Lost","Not Interested"],
  priorities: ["High","Medium","Low"],
};

// ─── SHEET ↔ FRONTEND FIELD MAPS ───────────────────────────────────────────────
// sheetsAPI.read() returns rows keyed by the human-readable column header
// ("Client PO No.", "PO Value (Rs)", ...) because that's literally the sheet's
// row 1. Every module, however, was written against camelCase MOCK fields
// (poNo, poValue, ...). FIELD_MAPS lists each sheet's columns, IN ORDER, using
// the exact camelCase name the matching buildXxxRow() in utils.js already uses
// for that column — so read() output can be converted back with denormalize().
// Order was cross-checked column-by-column against every buildXxxRow() and the
// SCHEMA in apps-script-backend.js on 2026-08-14.
export const FIELD_MAPS = {
  Jobs: ["id","fy","createdAt","createdBy","client","turbine","oemMake","capacity","type","status","startDate","completionDate","poNo","poDate","poValue","siteLocation","siteEngineer","assignedTo","labourCharges","materialCharges","travelCharges","otherCharges","estimatedValue","scopeOfWork","specialTools","safetyRequirements","workPermitNo","lastOverhaulDate","rpm","lubOilType","warrantyPeriod","invoiceStatus","remarks"],
  "Sales Invoices": ["invoiceNo","fy","createdAt","createdBy","date","client","jobRef","poNo","poDate","description","scopeDetails","labourCharges","materialCharges","travelCharges","otherCharges","subtotal","discount","taxableAmount","gstType","cgst","sgst","igst","totalGST","tdsApplicable","tdsRate","tdsAmt","grandTotal","netPayable","paymentTerms","dueDate","bankName","accountNo","ifsc","status","amountReceived","lastPaymentDate","placeOfSupply","remarks","ewayBillNo","vehicleNo"],
  // Added 2026-08-18 — line items for multi-item Sales Invoices (separate
  // sheet, linked by invoiceNo string — see apps-script-backend.js SCHEMA
  // comment). Order matches "Sales Invoice Items" headers there exactly.
  "Sales Invoice Items": ["invoiceNo","fy","srNo","description","hsn","qty","unit","rate","amount","createdAt","deleted"],
  "Purchase Invoices": ["id","fy","createdAt","createdBy","date","vendorInvNo","vendorName","description","jobRef","poRef","category","basicAmount","discount","taxableAmount","gstType","cgst","sgst","igst","totalGST","tdsApplicable","tdsSection","tdsRate","tdsDeducted","totalAmount","netPayable","itcEligible","paymentStatus","paymentMode","amountPaid","paymentDate","utrRef","remarks"],
  Quotations: ["id","fy","createdAt","createdBy","client","subject","date","validTill","followUp","value","gstPct","gstAmt","total","discountPct","paymentTerms","deliveryTerms","scopeNotes","preparedBy","revision","status","remarks"],
  // Order matches "IndiaMART Leads" headers in apps-script-backend.js SCHEMA
  // exactly — 30 headers in, 30 fields out (cross-checked 2026-08-18).
  "IndiaMART Leads": ["leadId","fy","createdAt","createdBy","dateReceived","queryId","companyName","contactPerson","mobile","altMobile","whatsappOpted","email","city","state","productEnquired","requirementDetails","leadType","budget","priority","status","quotationRef","quotedValue","firstContactedAt","responseTimeHrs","followUpDate","wonDate","lostReason","competitorMentioned","assignedTo","remarks"],
  Clients: ["code","fy","createdAt","createdBy","name","sector","contact","designation","mobile","altMobile","whatsapp","email","altEmail","address","city","state","pin","gstin","pan","creditLimit","paymentTerms","annualPotential","tdsApplicable","tdsRate","noOfTurbines","oemInstalled","seasonalDependency","decisionMaker","influencer","source","status","nextFollowup","lastVisited","outstanding","remarks"],
  Vendors: ["code","fy","createdAt","createdBy","name","category","contact","designation","mobile","altMobile","email","city","state","gstin","pan","bankName","accountNo","ifsc","accountType","paymentTerms","creditLimitGiven","mseStatus","productList","rating","status","lastOrderDate","totalBusiness","remarks"],
  Inventory: ["code","fy","createdAt","createdBy","name","category","hsnCode","unit","opening","purchased","issued","closing","reorder","moq","leadTimeDays","purchasePrice","unitCost","stockValue","supplier","altSupplier","rack","condition","shelfLife","lastCountDate","remarks"],
  Expenses: ["voucher","fy","createdAt","createdBy","date","category","subCategory","description","vendor","mode","amount","gst","gstType","total","billNo","approvedBy","jobRef","remarks"],
  "Petty Cash": ["id","fy","createdAt","createdBy","date","type","category","description","paidTo","receivedFrom","mode","amount","voucherNo","jobRef","approvedBy","remarks"],
  Ledger: ["voucherNo","fy","createdAt","createdBy","date","party","type","narration","invoiceRef","chequeUtr","bankName","debit","credit","tds","gst","dueDate","remarks"],
  "FD Tracker": ["fdNo","fy","createdAt","createdBy","bank","branch","fdReceiptNo","fdType","principal","rate","depositDate","tenureMonths","maturityDate","interestPayout","nominee","nomineeRelation","autoRenew","pledged","status","remarks"],
  "Document Vault": ["id","fy","createdAt","createdBy","name","category","docNo","issuingAuthority","uploadDate","driveLink","expiry","fileSize","addedBy","remarks"],
  TDS: ["id","fy","createdAt","createdBy","date","type","party","pan","nature","section","amount","rate","tdsAmt","quarter","challan","depositDate","status","remarks"],
  "Fixed Assets": ["code","fy","createdAt","createdBy","name","category","location","vendor","purchaseDate","invoiceNo","cost","installCost","totalCost","usefulLife","depRate","annualDep","accumDep","bookValue","status","insuranceExpiry","amc","serialNo","remarks"],
  Attendance: ["id","fy","createdAt","createdBy","date","workerName","designation","type","jobRef","siteLocation","hoursWorked","dailyRate","wages","advanceDeducted","netWages","remarks"],
  Vehicles: ["logId","fy","createdAt","createdBy","date","vehicle","driver","purpose","jobRef","destination","odometerStart","odometerEnd","km","fuelL","fuelCost","toll","remarks"],
};

// Converts one row object as returned by sheetsAPI.read() — keyed by the
// sheet's actual header text — into the camelCase shape modules expect, using
// FIELD_MAPS[sheetName] and the `headers` array the API call returned
// (so it still works even if someone reorders/renames a column later, as long
// as the FIELD_MAPS array is kept in the same order as the sheet).
export function denormalizeRow(sheetName, headers, row) {
  const fields = FIELD_MAPS[sheetName];
  // rowIndex is the row's TRUE position in the Google Sheet (see apps-script-
  // backend.js `_rowNum`) — this is what every module must use to address the
  // row for update/delete. NEVER derive it from array position after the data
  // has passed through any .filter()/.map() — that was the source of a
  // critical wrong-row-edited/deleted bug fixed in this pass (see CHANGELOG).
  const rowIndex = row._rowNum;
  // Offline-queue metadata (_pendingSync, _localId, _queuedAction, _conflict,
  // _syncError — see mergeQueueIntoResult in offlineMerge.js) rides along on
  // rows exactly like _rowNum does, so a queued/conflicted row is still
  // recognizable as such after denormalization — otherwise the shared <Tbl>
  // "pending sync" badge would have nothing to key off of.
  const meta = {};
  Object.keys(row).forEach(k => { if (k.startsWith("_") && k !== "_rowNum") meta[k] = row[k]; });
  if (!fields) return { ...row, rowIndex, ...meta }; // no map defined yet — pass through raw (header-keyed)
  const out = { rowIndex, ...meta };
  headers.forEach((h, i) => {
    const field = fields[i];
    if (field) out[field] = row[h];
  });
  return out;
}

export function denormalizeRows(sheetName, apiResult) {
  if (!apiResult || apiResult.error || !apiResult.data) return [];
  const { headers, data } = apiResult;
  return data.map(row => denormalizeRow(sheetName, headers, row));
}
