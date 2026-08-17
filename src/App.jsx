import { useState, useEffect, useRef, createContext, useContext } from "react";
import { T, ROLES, ALL_MODULES, MODULE_GROUPS, ALL_FYS, CURRENT_FY, FIELD_MAPS, denormalizeRow, denormalizeRows } from "./shared/constants.js";
import { fmt, fmtD, isPast, daysFromToday, daysOverdue, stars, waLink, sheetsAPI, IS_DEMO, setAuthCode } from "./shared/utils.js";
import { mergeQueueIntoResult } from "./shared/offlineMerge.js";
import { FYSelector, useToast, Alert, SyncStatusBadge, ConflictModal, SyncQueuePanel } from "./shared/ui.jsx";
import { ErrorBoundary } from "./shared/ErrorBoundary.jsx";
import { Dashboard, Jobs, Invoices, PurchaseInvoices, Quotations, Clients, Vendors, Inventory, Expenses, PettyCash, Ledger, ARaging, PandL, GSTSummary, TDSRegister, FixedAssets, FDTracker, Attendance, VehicleLog, DocumentVault, Settings } from "./modules/index.js";

// ─── Contexts ─────────────────────────────────────────────────────────────────
export const AuthCtx = createContext(null);
export const FYCtx   = createContext(CURRENT_FY);
export const useAuth = () => useContext(AuthCtx);
export const useFY   = () => useContext(FYCtx);

// ─── SEED / DEMO DATA ────────────────────────────────────────────────────────
// Used as the initial render before the first live sync completes, as the
// permanent dataset when VITE_API_URL is unset (IS_DEMO), and as a fallback
// for any single sheet that fails to load (see `D()` below).
const MOCK = {
  clients: [
    { code:"KE-CL-001", fy:"2026-27", name:"Dhampur Sugar Mills Ltd",   sector:"Sugar Mill",    contact:"Mr. R.K. Agarwal",  designation:"Maintenance Head",     mobile:"9812345678", altMobile:"",          whatsapp:"9812345678", email:"rk.agarwal@dhampur.com",   address:"NH-74, Dhampur", city:"Dhampur",      state:"Uttar Pradesh", pin:"246761", gstin:"09AABCD1234F1Z5", pan:"AABCD1234F", creditLimit:500000,  paymentTerms:"30 days", annualPotential:2500000, tdsApplicable:"Yes", tdsRate:"1%", noOfTurbines:3, oemInstalled:"Triveni",  seasonalDependency:"Oct-Mar",  outstanding:250000, status:"Active",   nextFollowup:"2026-07-15", rating:5, source:"Reference",  remarks:"Key account" },
    { code:"KE-CL-002", fy:"2026-27", name:"Triveni Engineering",        sector:"OEM / Referral",contact:"Mr. Suresh Verma",   designation:"Service Manager",      mobile:"9823456789", altMobile:"",          whatsapp:"9823456789", email:"s.verma@triveni.com",      address:"Naini",          city:"Allahabad",    state:"Uttar Pradesh", pin:"211010", gstin:"09AABCE5678G1Z3", pan:"AABCE5678G", creditLimit:1000000, paymentTerms:"45 days", annualPotential:5000000, tdsApplicable:"Yes", tdsRate:"2%", noOfTurbines:0, oemInstalled:"BHEL",     seasonalDependency:"None",     outstanding:90000,  status:"Active",   nextFollowup:"2026-07-01", rating:5, source:"Direct",     remarks:"OEM partner" },
    { code:"KE-CL-003", fy:"2026-27", name:"Saharanpur Paper Mill",      sector:"Paper Mill",    contact:"Mr. Pankaj Goel",   designation:"Plant Head",           mobile:"9834567890", altMobile:"",          whatsapp:"9834567890", email:"pgoel@spmills.com",        address:"Industrial Area",city:"Saharanpur",   state:"Uttar Pradesh", pin:"247001", gstin:"09AABCF9012H1Z1", pan:"AABCF9012H", creditLimit:300000,  paymentTerms:"30 days", annualPotential:800000,  tdsApplicable:"No",  tdsRate:"",    noOfTurbines:1, oemInstalled:"KKK",      seasonalDependency:"None",     outstanding:0,      status:"Active",   nextFollowup:"2026-08-01", rating:4, source:"Trade Show", remarks:"Annual AMC" },
    { code:"KE-CL-004", fy:"2026-27", name:"IOCL Mathura Refinery",      sector:"Petrochemical", contact:"Mr. D.S. Negi",     designation:"Reliability Engineer", mobile:"9845678901", altMobile:"9845678902",whatsapp:"9845678901", email:"ds.negi@iocl.co.in",       address:"IOCL Complex",   city:"Mathura",      state:"Uttar Pradesh", pin:"281006", gstin:"09AABCG3456I1Z9", pan:"AABCG3456I", creditLimit:2000000, paymentTerms:"60 days", annualPotential:8000000, tdsApplicable:"Yes", tdsRate:"2%", noOfTurbines:5, oemInstalled:"BHEL",     seasonalDependency:"None",     outstanding:0,      status:"Active",   nextFollowup:"2026-09-01", rating:5, source:"Tender",     remarks:"PSU — NIT" },
    { code:"KE-CL-005", fy:"2026-27", name:"Mawana Sugars Ltd",           sector:"Sugar Mill",    contact:"Mr. Alok Jain",     designation:"Turbine Engineer",     mobile:"9856789012", altMobile:"",          whatsapp:"9856789012", email:"alok.j@mawana.com",        address:"Mawana Mill",    city:"Mawana",       state:"Uttar Pradesh", pin:"250401", gstin:"09AABCH7890J1Z7", pan:"AABCH7890J", creditLimit:400000,  paymentTerms:"30 days", annualPotential:1200000, tdsApplicable:"Yes", tdsRate:"1%", noOfTurbines:2, oemInstalled:"Siemens",  seasonalDependency:"Oct-Mar",  outstanding:115000, status:"Active",   nextFollowup:"2026-07-20", rating:4, source:"Reference",  remarks:"Seasonal" },
    { code:"KE-CL-006", fy:"2026-27", name:"NTPC Dadri",                  sector:"Power Plant",   contact:"Mr. S.P. Yadav",    designation:"DGM Maintenance",      mobile:"9867890123", altMobile:"",          whatsapp:"9867890123", email:"sp.yadav@ntpc.co.in",      address:"NTPC Complex",   city:"Greater Noida",state:"Uttar Pradesh", pin:"203207", gstin:"09AABCI2345K1Z5", pan:"AABCI2345K", creditLimit:3000000, paymentTerms:"60 days", annualPotential:10000000,tdsApplicable:"Yes", tdsRate:"2%", noOfTurbines:8, oemInstalled:"BHEL",     seasonalDependency:"None",     outstanding:0,      status:"Active",   nextFollowup:"2026-10-01", rating:5, source:"Tender",     remarks:"PTW mandatory" },
    { code:"KE-CL-007", fy:"2026-27", name:"Balrampur Chini Mills",       sector:"Sugar Mill",    contact:"Mr. Vikas Tiwari",  designation:"Chief Engineer",       mobile:"9889012345", altMobile:"",          whatsapp:"9889012345", email:"v.tiwari@bcml.in",         address:"Balrampur Mill", city:"Balrampur",    state:"Uttar Pradesh", pin:"271201", gstin:"09AABCK1234M1Z1", pan:"AABCK1234M", creditLimit:500000,  paymentTerms:"30 days", annualPotential:1500000, tdsApplicable:"Yes", tdsRate:"1%", noOfTurbines:4, oemInstalled:"Triveni",  seasonalDependency:"Oct-Mar",  outstanding:0,      status:"Prospect", nextFollowup:"2026-11-01", rating:4, source:"Reference",  remarks:"Target Oct" },
  ],
  jobs: [
    { id:"KE-JOB-2026-041", fy:"2026-27", client:"Dhampur Sugar Mills Ltd", turbine:"Triveni 3.5MW",  oemMake:"Triveni", capacity:"3.5 MW", type:"Overhaul",                  status:"In Progress", startDate:"2026-04-01", completionDate:"",           poNo:"DSM/PO/2026/55",   poDate:"2026-06-01", poValue:800000,  siteLocation:"Dhampur",    siteEngineer:"Ramesh Kumar",  assignedTo:"Site Team",     labourCharges:500000, materialCharges:250000, travelCharges:35000, otherCharges:15000, estimatedValue:850000, scopeOfWork:"Full overhaul — bearing, seal, coupling", specialTools:"Hydraulic puller, Schenck balancer", safetyRequirements:"Work permit, PPE mandatory", workPermitNo:"DSM/WP/2026/041", lastOverhaulDate:"2024-04-01", rpm:"3000", lubOilType:"Mobil DTE 32", warrantyPeriod:6, invoiceStatus:"Invoiced", remarks:"Stage 2 complete" },
    { id:"KE-JOB-2026-042", fy:"2026-27", client:"Triveni Engineering",       turbine:"BHEL 500kW",    oemMake:"BHEL",    capacity:"500 kW", type:"Erection & Commissioning",  status:"Completed",   startDate:"2026-04-10", completionDate:"2026-04-20", poNo:"TRVN/PO/2026/88", poDate:"2026-03-25", poValue:540000,  siteLocation:"Allahabad",   siteEngineer:"Keshav Sharma", assignedTo:"Keshav Sharma", labourCharges:350000, materialCharges:150000, travelCharges:25000, otherCharges:15000, estimatedValue:590000, scopeOfWork:"Erection, alignment, commissioning, trial run", specialTools:"Dial indicator, alignment tools", safetyRequirements:"Work permit required", workPermitNo:"TRV/WP/2026/042", lastOverhaulDate:"", rpm:"3000", lubOilType:"Shell Turbo 32", warrantyPeriod:3, invoiceStatus:"Paid",     remarks:"" },
    { id:"KE-JOB-2026-043", fy:"2026-27", client:"Saharanpur Paper Mill",     turbine:"KKK 1.5MW",     oemMake:"KKK",     capacity:"1.5 MW", type:"Dynamic Balancing",         status:"Completed",   startDate:"2026-05-01", completionDate:"2026-05-03", poNo:"SPM/PO/2026/12",  poDate:"2026-04-20", poValue:100000,  siteLocation:"Saharanpur",  siteEngineer:"Keshav Sharma", assignedTo:"Keshav Sharma", labourCharges:80000,  materialCharges:15000,  travelCharges:8000,  otherCharges:0,     estimatedValue:118000, scopeOfWork:"Dynamic balancing, vibration analysis, certificate", specialTools:"Portable balancing kit", safetyRequirements:"Standard PPE", workPermitNo:"", lastOverhaulDate:"", rpm:"3600", lubOilType:"Mobil DTE 32", warrantyPeriod:3, invoiceStatus:"Paid",     remarks:"" },
    { id:"KE-JOB-2026-044", fy:"2026-27", client:"Mawana Sugars Ltd",         turbine:"Siemens 2MW",   oemMake:"Siemens", capacity:"2 MW",   type:"Emergency Troubleshooting", status:"Scheduled",   startDate:"2026-07-15", completionDate:"",           poNo:"",                poDate:"",           poValue:0,       siteLocation:"Mawana",      siteEngineer:"TBD",           assignedTo:"Site Team",     labourCharges:0,      materialCharges:0,      travelCharges:0,     otherCharges:0,     estimatedValue:320000, scopeOfWork:"Vibration investigation, root cause analysis", specialTools:"Vibration analyser", safetyRequirements:"Work permit, hot work permit", workPermitNo:"", lastOverhaulDate:"2023-10-01", rpm:"1500", lubOilType:"Mobil DTE 32", warrantyPeriod:0, invoiceStatus:"Pending",  remarks:"PO awaited" },
    { id:"KE-JOB-2026-045", fy:"2026-27", client:"NTPC Dadri",                 turbine:"BHEL 210MW",    oemMake:"BHEL",    capacity:"210 MW", type:"Lube Oil Flushing",         status:"Enquiry",     startDate:"",           completionDate:"",           poNo:"",                poDate:"",           poValue:0,       siteLocation:"Greater Noida",siteEngineer:"",             assignedTo:"Keshav Sharma", labourCharges:0,      materialCharges:0,      travelCharges:0,     otherCharges:0,     estimatedValue:180000, scopeOfWork:"Lube oil flushing, cleanliness test", specialTools:"Flush rig, particle counter", safetyRequirements:"PTW from NTPC mandatory", workPermitNo:"", lastOverhaulDate:"", rpm:"3000", lubOilType:"Turbine oil 46", warrantyPeriod:0, invoiceStatus:"",         remarks:"Quote submitted" },
  ],
  invoices: [
    { invoiceNo:"KE/INV/2026-27/001", fy:"2026-27", date:"2026-04-10", client:"Triveni Engineering",    jobRef:"KE-JOB-2026-042", poNo:"TRVN/PO/2026/88", poDate:"2026-03-25", description:"Turbine E&C — BHEL 500kW", scopeDetails:"Erection, alignment, commissioning, trial run", labourCharges:350000, materialCharges:150000, travelCharges:25000, otherCharges:15000, subtotal:540000, discount:0, taxableAmount:540000, gstType:"IGST", cgst:0, sgst:0, igst:97200, totalGST:97200, tdsApplicable:"Yes", tdsRate:1, tdsAmt:5400, grandTotal:637200, netPayable:631800, paymentTerms:"30 days", dueDate:"2026-05-10", bankName:"SBI", status:"Partial Paid", amountReceived:300000, placeOfSupply:"Allahabad", remarks:"Balance pending" },
    { invoiceNo:"KE/INV/2026-27/002", fy:"2026-27", date:"2026-05-01", client:"Saharanpur Paper Mill", jobRef:"KE-JOB-2026-043", poNo:"SPM/PO/2026/12",  poDate:"2026-04-20", description:"Dynamic Balancing — KKK 1.5MW",  scopeDetails:"Balancing, vibration analysis, certificate",    labourCharges:80000,  materialCharges:15000,  travelCharges:8000,  otherCharges:0,     subtotal:103000,discount:3000,taxableAmount:100000,gstType:"CGST+SGST",cgst:9000,sgst:9000,igst:0,    totalGST:18000, tdsApplicable:"No",  tdsRate:0, tdsAmt:0,    grandTotal:118000, netPayable:118000, paymentTerms:"30 days", dueDate:"2026-05-31", bankName:"SBI", status:"Paid",         amountReceived:118000, placeOfSupply:"Saharanpur",  remarks:"" },
    { invoiceNo:"KE/INV/2026-27/003", fy:"2026-27", date:"2026-06-15", client:"Dhampur Sugar Mills Ltd",jobRef:"KE-JOB-2026-041", poNo:"DSM/PO/2026/55",  poDate:"2026-06-01", description:"Turbine Overhaul — Stage 1 & 2",  scopeDetails:"Dismantling, bearing, seal, reassembly, trial run", labourCharges:500000, materialCharges:250000, travelCharges:35000, otherCharges:15000, subtotal:800000,discount:0,  taxableAmount:800000,gstType:"IGST",     cgst:0,    sgst:0,    igst:144000,totalGST:144000,tdsApplicable:"Yes", tdsRate:1, tdsAmt:8000, grandTotal:944000, netPayable:936000, paymentTerms:"45 days", dueDate:"2026-07-30", bankName:"SBI", status:"Unpaid",       amountReceived:0,      placeOfSupply:"Dhampur",     remarks:"Due Jul 30" },
  ],
  purchases: [
    { id:"KE/PINV/2627/001", fy:"2026-27", date:"2026-04-05", vendorInvNo:"SKF/2026/441",  vendorName:"SKF India Pvt Ltd",       description:"Turbine Bearing SKF 6310 x2", jobRef:"KE-JOB-2026-041", category:"Material",    basicAmount:2400, discount:0,  taxableAmount:2400, gstType:"CGST+SGST", cgst:216,  sgst:216,  igst:0,    totalGST:432,  totalAmount:2832,  tdsDeducted:0,  netPayable:2832,  paymentStatus:"Paid",  amountPaid:2832,  paymentDate:"2026-04-07", paymentMode:"NEFT",   utrRef:"UTR-SKF-001", itcEligible:"Yes", remarks:"" },
    { id:"KE/PINV/2627/002", fy:"2026-27", date:"2026-04-12", vendorInvNo:"PVVNL/APR2026", vendorName:"PVVNL",                   description:"Electricity April 2026",      jobRef:"",               category:"Utilities",   basicAmount:4200, discount:0,  taxableAmount:4200, gstType:"Nil",       cgst:0,    sgst:0,    igst:0,    totalGST:0,    totalAmount:4200,  tdsDeducted:0,  netPayable:4200,  paymentStatus:"Paid",  amountPaid:4200,  paymentDate:"2026-04-14", paymentMode:"Online", utrRef:"PVVNL-APR",   itcEligible:"No",  remarks:"No ITC" },
    { id:"KE/PINV/2627/003", fy:"2026-27", date:"2026-04-20", vendorInvNo:"CA-GUPTA/APR",  vendorName:"CA Gupta and Associates", description:"Professional fees April 2026", jobRef:"",               category:"Professional",basicAmount:5000, discount:0,  taxableAmount:5000, gstType:"CGST+SGST", cgst:450,  sgst:450,  igst:0,    totalGST:900,  totalAmount:5900,  tdsDeducted:500,netPayable:5400,  paymentStatus:"Paid",  amountPaid:5400,  paymentDate:"2026-04-22", paymentMode:"Cheque", utrRef:"CHQ-00451",   itcEligible:"Yes", remarks:"TDS 194J" },
    { id:"KE/PINV/2627/004", fy:"2026-27", date:"2026-05-08", vendorInvNo:"HP-LUB/5541",   vendorName:"HP Lubricants",           description:"Mobil DTE Oil 32 x4 cans",    jobRef:"KE-JOB-2026-041",category:"Material",    basicAmount:10000,discount:200,taxableAmount:9800, gstType:"CGST+SGST", cgst:882,  sgst:882,  igst:0,    totalGST:1764, totalAmount:11564, tdsDeducted:0,  netPayable:11564, paymentStatus:"Paid",  amountPaid:11564, paymentDate:"2026-05-10", paymentMode:"NEFT",   utrRef:"UTR-HP-001",  itcEligible:"Yes", remarks:"" },
    { id:"KE/PINV/2627/005", fy:"2026-27", date:"2026-06-01", vendorInvNo:"MITU/2026/0091", vendorName:"Mitutoyo India",          description:"Dial Indicator calibration",   jobRef:"",               category:"Maintenance", basicAmount:3200, discount:0,  taxableAmount:3200, gstType:"CGST+SGST", cgst:288,  sgst:288,  igst:0,    totalGST:576,  totalAmount:3776,  tdsDeducted:0,  netPayable:3776,  paymentStatus:"Unpaid",amountPaid:0,     paymentDate:"",           paymentMode:"",       utrRef:"",            itcEligible:"Yes", remarks:"Due Jun 15" },
  ],
  quotations: [
    { id:"KE/QT/2026-27/001", fy:"2026-27", client:"Dhampur Sugar Mills Ltd",  subject:"Turbine annual overhaul FY26-27",        date:"2026-04-01", validTill:"2026-04-30", followUp:"2026-07-01", value:950000,  gstPct:18, discountPct:0, paymentTerms:"30 days",  deliveryTerms:"At site", scopeNotes:"Full overhaul", preparedBy:"Keshav Sharma", revision:"R0", status:"Accepted", remarks:"" },
    { id:"KE/QT/2026-27/002", fy:"2026-27", client:"IOCL Mathura Refinery",    subject:"Lube oil flushing + shaft alignment",    date:"2026-05-15", validTill:"2026-06-15", followUp:"2026-07-10", value:450000,  gstPct:18, discountPct:0, paymentTerms:"60 days",  deliveryTerms:"At site", scopeNotes:"LO flushing + alignment", preparedBy:"Keshav Sharma", revision:"R1", status:"Pending",  remarks:"" },
    { id:"KE/QT/2026-27/003", fy:"2026-27", client:"Balrampur Chini Mills",    subject:"Pre-crushing season turbine inspection", date:"2026-06-10", validTill:"2026-07-10", followUp:"2026-07-25", value:280000,  gstPct:18, discountPct:0, paymentTerms:"30 days",  deliveryTerms:"At site", scopeNotes:"Pre-season inspection + alignment", preparedBy:"Keshav Sharma", revision:"R0", status:"Sent",     remarks:"" },
    { id:"KE/QT/2026-27/004", fy:"2026-27", client:"Mawana Sugars Ltd",        subject:"Bearing replacement + dynamic balancing", date:"2026-06-01", validTill:"2026-07-01", followUp:"2026-07-20", value:185000,  gstPct:18, discountPct:5, paymentTerms:"30 days",  deliveryTerms:"At site", scopeNotes:"Bearing + balancing + certificate", preparedBy:"Keshav Sharma", revision:"R0", status:"Negotiating",remarks:"" },
  ],
  vendors: [
    { code:"KE-VN-001", fy:"2026-27", name:"SKF India Pvt Ltd",     category:"Bearings",         contact:"Mr. Rajesh Kumar", designation:"Area Sales Manager", mobile:"9812340001", altMobile:"", email:"rajesh.k@skf.com",   city:"Delhi",     state:"Delhi",       gstin:"07AABCS1234A1Z5", pan:"AABCS1234A", bankName:"HDFC Bank", accountNo:"XXXX1234", ifsc:"HDFC0001234", accountType:"Current", paymentTerms:"30 days", creditLimitGiven:200000, mseStatus:"No",  productList:"Bearings, seals, lubrication", rating:5, status:"Active", remarks:"Authorized SKF" },
    { code:"KE-VN-002", fy:"2026-27", name:"Schenck RoTec India",   category:"Balancing Equip.", contact:"Mr. Sinha",       designation:"Service Manager",    mobile:"9823450002", altMobile:"", email:"sinha@schenck.net",   city:"Pune",      state:"Maharashtra", gstin:"27AABCT5678B1Z3", pan:"AABCT5678B", bankName:"ICICI Bank",accountNo:"XXXX5678", ifsc:"ICIC0001234", accountType:"Current", paymentTerms:"45 days", creditLimitGiven:0,      mseStatus:"No",  productList:"Balancing machines, AMC",      rating:5, status:"Active", remarks:"AMC partner" },
    { code:"KE-VN-003", fy:"2026-27", name:"HP Lubricants",         category:"Lubricants",       contact:"Mr. Sharma",      designation:"Sales Executive",    mobile:"9834560003", altMobile:"", email:"sharma@hplub.com",    city:"Shamli",    state:"Uttar Pradesh",gstin:"09AABCU9012C1Z1", pan:"AABCU9012C", bankName:"SBI",       accountNo:"XXXX5678", ifsc:"SBIN0001234", accountType:"Current", paymentTerms:"15 days", creditLimitGiven:50000,  mseStatus:"Yes", productList:"Mobil DTE oils, grease",       rating:4, status:"Active", remarks:"Local supplier" },
    { code:"KE-VN-004", fy:"2026-27", name:"Mitutoyo India",        category:"Precision Tools",  contact:"Mr. Gupta",       designation:"Technical Sales",    mobile:"9845670004", altMobile:"", email:"gupta@mitutoyo.co.in",city:"Bangalore", state:"Karnataka",   gstin:"29AABCW7890E1Z7", pan:"AABCW7890E", bankName:"Axis Bank", accountNo:"XXXX9012", ifsc:"UTIB0001234", accountType:"Current", paymentTerms:"Advance",  creditLimitGiven:0,      mseStatus:"No",  productList:"Calipers, dial indicators",     rating:5, status:"Active", remarks:"Calibration cert" },
  ],
  inventory: [
    { code:"KE-SP-001", fy:"2026-27", name:"Turbine Bearing SKF 6310", category:"Spares",     unit:"Pcs", hsnCode:"84821010", opening:10, purchased:5, issued:8, reorder:3, moq:2, leadTimeDays:7,  purchasePrice:1000, unitCost:1200, supplier:"SKF India Pvt Ltd",  altSupplier:"Local",   rack:"Rack A1",  condition:"New", shelfLife:"", remarks:"Critical spare" },
    { code:"KE-SP-002", fy:"2026-27", name:"Carbon Seal Ring 50mm",    category:"Spares",     unit:"Pcs", hsnCode:"84842000", opening:20, purchased:10,issued:12,reorder:5, moq:5, leadTimeDays:3,  purchasePrice:700,  unitCost:850,  supplier:"OEM Supplier",       altSupplier:"",        rack:"Rack A2",  condition:"New", shelfLife:"", remarks:"" },
    { code:"KE-LB-001", fy:"2026-27", name:"Mobil DTE Oil 32 (20L)",   category:"Lubricants", unit:"Can", hsnCode:"27101980", opening:8,  purchased:4, issued:6, reorder:3, moq:4, leadTimeDays:2,  purchasePrice:2500, unitCost:2800, supplier:"HP Lubricants",      altSupplier:"",        rack:"Store",    condition:"New", shelfLife:24,  remarks:"" },
    { code:"KE-LB-002", fy:"2026-27", name:"Grease MP2 500g",          category:"Lubricants", unit:"Tin", hsnCode:"27101600", opening:15, purchased:10,issued:8, reorder:5, moq:10,leadTimeDays:1,  purchasePrice:290,  unitCost:350,  supplier:"HP Lubricants",      altSupplier:"Local",   rack:"Store",    condition:"New", shelfLife:36,  remarks:"" },
    { code:"KE-TL-001", fy:"2026-27", name:"Dial Indicator 0.01mm",    category:"Tools",      unit:"Pcs", hsnCode:"90311000", opening:3,  purchased:1, issued:0, reorder:1, moq:1, leadTimeDays:14, purchasePrice:2800, unitCost:3200, supplier:"Mitutoyo India",     altSupplier:"",        rack:"Tool Box", condition:"New", shelfLife:"", remarks:"Calibrate annually" },
  ],
  expenses: [
    { voucher:"EXP/2627/001", fy:"2026-27", date:"2026-04-01", category:"Labour",    subCategory:"Site Wages",  description:"Turbine erection crew Dhampur",  vendor:"Cash",       mode:"Cash",  amount:42000,gst:0,   gstType:"Nil",      total:42000, billNo:"",         approvedBy:"Keshav Sharma", jobRef:"KE-JOB-2026-041", remarks:"" },
    { voucher:"EXP/2627/002", fy:"2026-27", date:"2026-04-03", category:"Travel",    subCategory:"Diesel",      description:"Diesel — site vehicle April wk1", vendor:"Petrol Pump",mode:"Cash",  amount:3200, gst:576, gstType:"CGST+SGST",total:3776,  billNo:"PB-001",   approvedBy:"Keshav Sharma", jobRef:"",               remarks:"" },
    { voucher:"EXP/2627/003", fy:"2026-27", date:"2026-04-05", category:"Material",  subCategory:"Bearings",    description:"SKF 6310 x2 pcs",               vendor:"SKF India",  mode:"NEFT",  amount:2400, gst:432, gstType:"IGST",     total:2832,  billNo:"SKF-441",  approvedBy:"Keshav Sharma", jobRef:"KE-JOB-2026-041", remarks:"" },
    { voucher:"EXP/2627/004", fy:"2026-27", date:"2026-04-12", category:"Utilities", subCategory:"Electricity", description:"Workshop electricity April 2026",  vendor:"PVVNL",      mode:"Online",amount:4200, gst:0,   gstType:"Nil",      total:4200,  billNo:"PVVNL-Apr",approvedBy:"Keshav Sharma", jobRef:"",               remarks:"" },
    { voucher:"EXP/2627/005", fy:"2026-27", date:"2026-04-20", category:"Professional",subCategory:"CA Fees",   description:"CA fees April 2026",             vendor:"CA Gupta",   mode:"Cheque",amount:5000, gst:900, gstType:"CGST+SGST",total:5900,  billNo:"CA-Apr26", approvedBy:"Keshav Sharma", jobRef:"",               remarks:"" },
  ],
  pettyCash: [
    { id:"PCTOP/2627/001", fy:"2026-27", type:"Top-up",  date:"2026-04-01", category:"Top-up",  description:"Opening float FY 2026-27", paidTo:"",             receivedFrom:"Main Account", mode:"Cash", amount:10000, voucherNo:"",        jobRef:"", approvedBy:"Keshav Sharma", remarks:"Opening float",    by:"Keshav Sharma" },
    { id:"PCTOP/2627/002", fy:"2026-27", type:"Top-up",  date:"2026-05-01", category:"Top-up",  description:"Top-up after April",       paidTo:"",             receivedFrom:"Main Account", mode:"Cash", amount:8240,  voucherNo:"",        jobRef:"", approvedBy:"Keshav Sharma", remarks:"Top-up after April", by:"Keshav Sharma" },
    { id:"PC/2627/001",    fy:"2026-27", type:"Payment", date:"2026-04-02", category:"Travel",  description:"Auto to railway station",  paidTo:"Auto Driver",  receivedFrom:"",             mode:"Cash", amount:120,   voucherNo:"",        jobRef:"", approvedBy:"Keshav Sharma", remarks:"" },
    { id:"PC/2627/002",    fy:"2026-27", type:"Payment", date:"2026-04-03", category:"Office",  description:"Printer cartridge HP 802",  paidTo:"Stationery",   receivedFrom:"",             mode:"Cash", amount:850,   voucherNo:"STAT-01", jobRef:"", approvedBy:"Keshav Sharma", remarks:"" },
    { id:"PC/2627/003",    fy:"2026-27", type:"Payment", date:"2026-04-05", category:"Travel",  description:"Diesel — site visit Dhampur",paidTo:"Petrol Pump", receivedFrom:"",             mode:"Cash", amount:2800,  voucherNo:"FUEL-01", jobRef:"KE-JOB-2026-041", approvedBy:"Keshav Sharma", remarks:"" },
    { id:"PC/2627/004",    fy:"2026-27", type:"Payment", date:"2026-04-07", category:"Meals",   description:"Tea/snacks — site team",   paidTo:"Tea Stall",    receivedFrom:"",             mode:"Cash", amount:250,   voucherNo:"",        jobRef:"KE-JOB-2026-041", approvedBy:"Keshav Sharma", remarks:"" },
    { id:"PC/2627/005",    fy:"2026-27", type:"Payment", date:"2026-04-10", category:"Courier", description:"Courier docs to Triveni",  paidTo:"DTDC",         receivedFrom:"",             mode:"Cash", amount:180,   voucherNo:"DTC-0410",jobRef:"KE-JOB-2026-042", approvedBy:"Keshav Sharma", remarks:"" },
    { id:"PC/2627/006",    fy:"2026-27", type:"Payment", date:"2026-04-15", category:"Labour",  description:"Helper wages workshop",    paidTo:"Raju",         receivedFrom:"",             mode:"Cash", amount:600,   voucherNo:"",        jobRef:"KE-JOB-2026-041", approvedBy:"Keshav Sharma", remarks:"" },
    { id:"PC/2627/007",    fy:"2026-27", type:"Payment", date:"2026-05-02", category:"Travel",  description:"Diesel — Saharanpur site",  paidTo:"Petrol Pump",  receivedFrom:"",             mode:"Cash", amount:2400,  voucherNo:"FUEL-02", jobRef:"KE-JOB-2026-043", approvedBy:"Keshav Sharma", remarks:"" },
    { id:"PC/2627/008",    fy:"2026-27", type:"Payment", date:"2026-05-10", category:"Office",  description:"Stationery supplies",      paidTo:"Stationery",   receivedFrom:"",             mode:"Cash", amount:320,   voucherNo:"",        jobRef:"",               approvedBy:"Keshav Sharma", remarks:"" },
  ],
  ledger: [
    { voucherNo:"KE/REC/2627/001", fy:"2026-27", date:"2026-04-01", party:"Dhampur Sugar Mills", type:"Receipt",      narration:"Advance — turbine overhaul",     invoiceRef:"",                   chequeUtr:"UTR123456", bankName:"SBI",  debit:0,      credit:250000,tds:0,   gst:0,     dueDate:"" },
    { voucherNo:"KE/INV/2627/001", fy:"2026-27", date:"2026-04-10", party:"Triveni Engineering",  type:"Sales Invoice",narration:"Erection & commissioning",        invoiceRef:"KE/INV/2026-27/001", chequeUtr:"",          bankName:"",    debit:540000, credit:0,    tds:5400,gst:97200, dueDate:"2026-05-10" },
    { voucherNo:"KE/REC/2627/002", fy:"2026-27", date:"2026-04-18", party:"Triveni Engineering",  type:"Receipt",      narration:"Part payment INV/2026-27/001",    invoiceRef:"KE/INV/2026-27/001", chequeUtr:"NEFT884421",bankName:"HDFC",debit:0,      credit:300000,tds:0,   gst:0,     dueDate:"" },
    { voucherNo:"KE/INV/2627/002", fy:"2026-27", date:"2026-05-01", party:"Saharanpur Paper Mill",type:"Sales Invoice",narration:"Dynamic balancing service",        invoiceRef:"KE/INV/2026-27/002", chequeUtr:"",          bankName:"",    debit:100000, credit:0,    tds:0,   gst:18000, dueDate:"2026-05-31" },
    { voucherNo:"KE/REC/2627/003", fy:"2026-27", date:"2026-05-15", party:"Saharanpur Paper Mill",type:"Receipt",      narration:"Full payment INV/2026-27/002",    invoiceRef:"KE/INV/2026-27/002", chequeUtr:"UTR556677", bankName:"SBI", debit:0,      credit:118000,tds:0,   gst:0,     dueDate:"" },
    { voucherNo:"KE/INV/2627/003", fy:"2026-27", date:"2026-06-15", party:"Dhampur Sugar Mills",  type:"Sales Invoice",narration:"Overhaul Stage 1 & 2",             invoiceRef:"KE/INV/2026-27/003", chequeUtr:"",          bankName:"",    debit:800000, credit:0,    tds:8000,gst:144000,dueDate:"2026-07-30" },
  ],
  // AR — calculated live from invoices (daysOverdue from due date)
  fds: [
    { fdNo:"SBI-FD-88421",  fy:"2026-27", bank:"State Bank of India", branch:"Shamli Main", fdReceiptNo:"SBI/FDR/2025/8421",  fdType:"Cumulative", principal:500000, rate:7.10, depositDate:"2025-04-15", tenureMonths:24, maturityDate:"2027-04-15", interestPayout:"On Maturity", nominee:"Family", nomineeRelation:"Father",  autoRenew:"No",  pledged:"No", status:"Active",  remarks:"" },
    { fdNo:"HDFC-FD-22317", fy:"2026-27", bank:"HDFC Bank",           branch:"Shamli",      fdReceiptNo:"HDFC/FDR/2025/22317",fdType:"Cumulative", principal:750000, rate:7.25, depositDate:"2025-07-01", tenureMonths:36, maturityDate:"2028-07-01", interestPayout:"On Maturity", nominee:"Family", nomineeRelation:"Mother",  autoRenew:"No",  pledged:"No", status:"Active",  remarks:"" },
    { fdNo:"BAF-FD-55902",  fy:"2026-27", bank:"Bajaj Finance Ltd",   branch:"Online",      fdReceiptNo:"BAF/FDR/2025/55902", fdType:"Cumulative", principal:300000, rate:8.10, depositDate:"2025-10-10", tenureMonths:12, maturityDate:"2026-10-10", interestPayout:"On Maturity", nominee:"Self",   nomineeRelation:"Self",    autoRenew:"Yes", pledged:"No", status:"Active",  remarks:"NBFC — higher rate" },
    { fdNo:"AXIS-FD-99102", fy:"2026-27", bank:"Axis Bank",           branch:"Shamli",      fdReceiptNo:"AXIS/FDR/2023/99102",fdType:"Cumulative", principal:600000, rate:7.00, depositDate:"2023-06-15", tenureMonths:36, maturityDate:"2026-06-15", interestPayout:"On Maturity", nominee:"Family", nomineeRelation:"Spouse",  autoRenew:"No",  pledged:"No", status:"Matured", remarks:"URGENT — renew" },
    { fdNo:"SF-FD-33841",   fy:"2026-27", bank:"Shriram Finance",     branch:"Online",      fdReceiptNo:"SF/FDR/2025/33841",  fdType:"Cumulative", principal:350000, rate:8.40, depositDate:"2025-05-20", tenureMonths:24, maturityDate:"2027-05-20", interestPayout:"On Maturity", nominee:"Self",   nomineeRelation:"Self",    autoRenew:"Yes", pledged:"No", status:"Active",  remarks:"AA+ rated" },
  ],
  vault: [
    { name:"MSME Registration",        category:"Registration",    docNo:"UP/MSME/2018/XXXXX",  issuingAuthority:"Ministry of MSME",   uploadDate:"2024-01-01", driveLink:"https://drive.google.com/", expiry:"—",         fileSize:"245 KB", addedBy:"Keshav Sharma", remarks:"Permanent" },
    { name:"GST Registration",         category:"Registration",    docNo:"09XXXXX",              issuingAuthority:"GSTN",               uploadDate:"2024-01-01", driveLink:"https://drive.google.com/", expiry:"—",         fileSize:"180 KB", addedBy:"Keshav Sharma", remarks:"" },
    { name:"Vehicle Insurance — Tata", category:"Insurance",       docNo:"POL/2025/XXXXX",       issuingAuthority:"New India Assurance",uploadDate:"2025-06-01", driveLink:"https://drive.google.com/", expiry:"2026-05-31",fileSize:"320 KB", addedBy:"Keshav Sharma", remarks:"EXPIRED" },
    { name:"Schenck AMC Agreement",    category:"AMC / Contracts", docNo:"SCH/AMC/2026/089",    issuingAuthority:"Schenck RoTec India",uploadDate:"2026-01-10", driveLink:"https://drive.google.com/", expiry:"2027-01-09",fileSize:"1.2 MB", addedBy:"Keshav Sharma", remarks:"Active" },
    { name:"NTPC Vendor Empanelment",  category:"Client Documents",docNo:"NTPC/VE/2025/441",    issuingAuthority:"NTPC Ltd",           uploadDate:"2025-09-05", driveLink:"https://drive.google.com/", expiry:"—",         fileSize:"540 KB", addedBy:"Keshav Sharma", remarks:"PSU approved" },
  ],
  // Demo/fallback data for the modules wired to sheetsAPI in this pass
  // (Attendance, Vehicles, Fixed Assets, TDS). Field names match FIELD_MAPS.
  assets: [
    { code:"KE-FA-001", fy:"2026-27", name:"Schenck H5 Dynamic Balancing Machine", category:"Plant & Machinery", location:"Workshop, Shamli", vendor:"Schenck RoTec India", purchaseDate:"2020-06-15", invoiceNo:"SCH/INV/2020/441", cost:850000, installCost:25000, totalCost:875000, usefulLife:15, depRate:6.67, annualDep:58333, accumDep:291665, bookValue:583335, status:"Active",   insuranceExpiry:"2027-06-14", amc:"Yes — annual", serialNo:"H5-IN-20-4412", remarks:"Core equipment" },
    { code:"KE-FA-002", fy:"2026-27", name:"Tata Pickup Truck (1.2T)",             category:"Vehicles",         location:"Shamli",         vendor:"Tata Motors",        purchaseDate:"2021-03-01", invoiceNo:"TM/INV/2021/8821", cost:650000, installCost:0,     totalCost:650000, usefulLife:8,  depRate:25,   annualDep:162500,accumDep:487500, bookValue:162500, status:"Active",   insuranceExpiry:"2026-02-28", amc:"No",         serialNo:"UP11AXXXXX",   remarks:"Insurance renewal due" },
    { code:"KE-FA-003", fy:"2026-27", name:"Vibration Analyser — CSI 2130",        category:"Tools & Equipment",location:"Workshop, Shamli", vendor:"Emerson India",     purchaseDate:"2022-01-10", invoiceNo:"EMR/INV/2022/112", cost:180000, installCost:5000,  totalCost:185000, usefulLife:10, depRate:15,   annualDep:27750, accumDep:111000, bookValue:74000,  status:"Active",   insuranceExpiry:"",           amc:"Yes — biennial",serialNo:"CSI2130-2022-011",remarks:"Calibration due Jan 2027" },
  ],
  attendance: [
    { id:"ATT/2627/001", fy:"2026-27", date:"2026-04-01", workerName:"Ramesh Kumar",    designation:"Fitter",  type:"Regular",   jobRef:"KE-JOB-2026-041", siteLocation:"Dhampur Plant", hoursWorked:8, dailyRate:800, wages:800, advanceDeducted:0,   netWages:800,  remarks:"" },
    { id:"ATT/2627/002", fy:"2026-27", date:"2026-04-01", workerName:"Suresh Yadav",    designation:"Helper",  type:"Regular",   jobRef:"KE-JOB-2026-041", siteLocation:"Dhampur Plant", hoursWorked:8, dailyRate:600, wages:600, advanceDeducted:0,   netWages:600,  remarks:"" },
    { id:"ATT/2627/004", fy:"2026-27", date:"2026-04-03", workerName:"Ramesh Kumar",    designation:"Fitter",  type:"Overtime",  jobRef:"KE-JOB-2026-041", siteLocation:"Dhampur Plant", hoursWorked:4, dailyRate:800, wages:400, advanceDeducted:200, netWages:200,  remarks:"OT @1.5x" },
  ],
  vehicles: [
    { logId:"VL/2627/001", fy:"2026-27", date:"2026-04-03", vehicle:"Tata Pickup — UP-11 AX XXXX", driver:"Ramesh Kumar",  purpose:"Site Visit",      jobRef:"KE-JOB-2026-041", destination:"Dhampur Sugar Mills", odometerStart:28410, odometerEnd:28524, km:114, fuelL:12.5, fuelCost:1387, toll:60, remarks:"Equipment loading + site" },
    { logId:"VL/2627/002", fy:"2026-27", date:"2026-04-10", vehicle:"Tata Pickup — UP-11 AX XXXX", driver:"Keshav Sharma", purpose:"Site Visit",      jobRef:"KE-JOB-2026-042", destination:"Allahabad",           odometerStart:28524, odometerEnd:28884, km:360, fuelL:38.0, fuelCost:4218, toll:180,remarks:"2-day trip Allahabad" },
  ],
  tds: [
    { id:"TDS/2627/001", fy:"2026-27", date:"2026-04-22", type:"Deducted", party:"CA Gupta and Associates", pan:"AXXXX1234X", nature:"Professional fees", section:"194J", amount:5000, rate:10, tdsAmt:500, quarter:"Q1 (Apr-Jun)", challan:"", depositDate:"", status:"Pending", remarks:"" },
    { id:"TDS/2627/R01", fy:"2026-27", date:"2026-04-10", type:"Received", party:"Triveni Engineering",    pan:"CXXXX9012Z", nature:"Erection & Commissioning", section:"194C", amount:540000, rate:1, tdsAmt:5400, quarter:"Q1 (Apr-Jun)", challan:"TRV-TDS-001", depositDate:"2026-05-15", status:"Deposited", remarks:"Verify in 26AS" },
  ],
};

// ─── LOGIN ─────────────────────────────────────────────────────────────────────
// Hardcoded fallback ONLY — used while the live Config sheet hasn't loaded yet
// (first paint), when IS_DEMO, or if the fetch fails. Once Config loads, the
// ADMIN_PASSCODE / STAFF_PASSCODE / CA_PASSCODE values it contains are what
// actually gate login (see buildPasscodeMap below) — Settings → Passcodes
// writes to those same keys, so a change made there takes effect immediately,
// with no source edit or redeploy required.
const DEFAULT_PASSCODES = { "ADMIN2024":{ role:"admin",name:"Keshav Sharma" }, "STAFF001":{ role:"staff",name:"Staff User" }, "CA1234":{ role:"ca",name:"CA / Accountant" } };

const buildPasscodeMap = (config) => {
  if (!config || !config.ADMIN_PASSCODE) return DEFAULT_PASSCODES; // Config not loaded / not yet seeded
  const map = {};
  if (config.ADMIN_PASSCODE) map[String(config.ADMIN_PASSCODE).toUpperCase()] = { role:"admin", name:"Keshav Sharma" };
  if (config.STAFF_PASSCODE) map[String(config.STAFF_PASSCODE).toUpperCase()] = { role:"staff", name:"Staff User" };
  if (config.CA_PASSCODE)    map[String(config.CA_PASSCODE).toUpperCase()]    = { role:"ca",    name:"CA / Accountant" };
  return map;
};

function Login({ onLogin, passcodeMap, configLoading }) {
  const [code,setCode] = useState("");
  const [err, setErr]  = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showDemo, setShowDemo] = useState(false); // demo codes hidden by default — see note below
  const go = () => { const u=passcodeMap[code.toUpperCase()]; if(u){setErr("");onLogin({...u, code:code.toUpperCase()});}else setErr("Invalid passcode"); };
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${T.navy} 0%,${T.sidebar} 100%)`,padding:16}}>
      <div style={{background:"#fff",borderRadius:20,padding:"36px 32px",width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:56,height:56,borderRadius:14,background:T.navy,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontWeight:900,fontSize:20,color:T.gold}}>KE</div>
          <h1 style={{margin:0,fontSize:20,fontWeight:900,color:T.navy}}>Keshav Enterprises</h1>
          <p style={{margin:"5px 0 0",color:T.slate,fontSize:13}}>Business Suite v5 · Shamli UP</p>
        </div>
        <label htmlFor="ke-passcode" style={{display:"block",fontSize:11,fontWeight:700,color:T.navy,marginBottom:6,letterSpacing:.4}}>ACCESS PASSCODE</label>
        <div style={{position:"relative",marginBottom:10}}>
          <input id="ke-passcode" type={showPw?"text":"password"} value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="Enter passcode"
            aria-invalid={!!err} aria-describedby={err?"ke-passcode-err":undefined}
            style={{width:"100%",padding:"12px 44px 12px 13px",borderRadius:10,border:`2px solid ${err?T.red:T.border}`,fontSize:14,outline:"none",boxSizing:"border-box",letterSpacing:4,minHeight:44}}/>
          <button type="button" aria-label={showPw?"Hide passcode":"Show passcode"} onClick={()=>setShowPw(s=>!s)}
            style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:15,padding:8,color:T.slate}}>
            {showPw?"🙈":"👁️"}
          </button>
        </div>
        {err&&<p id="ke-passcode-err" role="alert" style={{color:T.red,fontSize:12,margin:"0 0 10px",fontWeight:600}}>{err}</p>}
        <button onClick={go} style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:T.navy,color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",minHeight:46}}>Sign In →</button>

        {/* Demo passcodes are hidden by default and only appear behind an explicit
            toggle — showing them in the clear on the login screen (as before) is
            harmless in a real demo, but a bad habit once this points at live
            company data, since anyone glancing at the screen sees valid credentials.
            IMPORTANT: this panel only ever shows DEFAULT_PASSCODES (the
            fallback), derived from passcodeMap when it equals the fallback —
            it never renders live/rotated passcodes read from Config, so
            changing passcodes in Settings makes this reveal panel disappear
            on its own rather than leaking the new codes on-screen. */}
        {passcodeMap===DEFAULT_PASSCODES && !configLoading && (
          <>
            <button type="button" onClick={()=>setShowDemo(s=>!s)} aria-expanded={showDemo}
              style={{width:"100%",marginTop:14,padding:"7px",borderRadius:8,border:"none",background:"none",color:T.slate,fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
              {showDemo?"▲ Hide demo passcodes":"▼ Show demo passcodes"}
            </button>
            {showDemo&&(
              <div style={{padding:"12px",background:T.light,borderRadius:10}}>
                <p style={{margin:"0 0 6px",fontSize:11,color:T.slate,fontWeight:700}}>DEFAULT PASSCODES — not yet customized in Settings</p>
                {Object.entries(DEFAULT_PASSCODES).map(([c,u])=>(
                  <p key={c} style={{margin:"2px 0",fontSize:12}}>
                    <button type="button" onClick={()=>setCode(c)} style={{background:"none",border:"none",padding:0,color:T.navy,cursor:"pointer",textDecoration:"underline",fontWeight:700,fontSize:12}}>{c}</button> — {u.name} ({u.role})
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Maps the MOCK/module data key to the actual Google Sheet tab name.
const SHEET_FOR = {
  jobs:"Jobs", invoices:"Sales Invoices", purchases:"Purchase Invoices",
  quotations:"Quotations", clients:"Clients", vendors:"Vendors",
  inventory:"Inventory", expenses:"Expenses", pettyCash:"Petty Cash",
  ledger:"Ledger", fds:"FD Tracker", vault:"Document Vault",
  tds:"TDS", attendance:"Attendance", vehicles:"Vehicles",
};
// Fixed Assets is cumulative across years (an asset bought in FY24-25 is still
// on the register in FY26-27), so unlike everything else it's fetched WITHOUT
// the FY filter — see loadLiveData below.
const ASSETS_SHEET = "Fixed Assets";

// Cross-module search: typing 2+ characters queries a curated set of
// identifying fields across every loaded dataset (not just the module
// currently open) and groups matches by module. Selecting a result switches
// to that module — it doesn't (yet) pre-filter the destination module's own
// search box, so landing on "Jobs" after finding "KE-JOB-2026-041" still
// means scanning the list, but it replaces "which of the 20 tabs is this
// client even in" with a single search box.
const SEARCH_CONFIG = [
  { key:"jobs",       moduleId:"jobs",       fields:["id","client","turbine","poNo","siteLocation"] },
  { key:"invoices",   moduleId:"invoices",   fields:["invoiceNo","client","description","poNo"] },
  { key:"purchases",  moduleId:"purchases",  fields:["id","vendorName","vendorInvNo","description"] },
  { key:"quotations", moduleId:"quotations", fields:["id","client","subject"] },
  { key:"clients",    moduleId:"clients",    fields:["name","code","contact","city","mobile"] },
  { key:"vendors",    moduleId:"vendors",    fields:["name","code","contact","city"] },
  { key:"ledger",     moduleId:"ledger",     fields:["voucherNo","party","narration"] },
  { key:"vault",      moduleId:"vault",      fields:["name","docNo","issuingAuthority"] },
  { key:"assets",     moduleId:"assets",     fields:["code","name","serialNo"] },
];

const searchResultLabel = (moduleId, row) => {
  switch (moduleId) {
    case "jobs":       return `${row.id} — ${row.client}`;
    case "invoices":   return `${row.invoiceNo} — ${row.client}`;
    case "purchases":  return `${row.id} — ${row.vendorName}`;
    case "quotations": return `${row.id} — ${row.client}`;
    case "clients":    return `${row.name}${row.code?` (${row.code})`:""}`;
    case "vendors":    return row.name;
    case "ledger":     return `${row.voucherNo} — ${row.party}`;
    case "vault":      return row.name;
    case "assets":     return `${row.code} — ${row.name}`;
    default:           return row.name || row.id || "—";
  }
};

function GlobalSearch({ D, onNavigate }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const results = q.trim().length < 2 ? [] : SEARCH_CONFIG
    .map(cfg => {
      const ql = q.toLowerCase();
      const rows = (D(cfg.key)||[]).filter(row => cfg.fields.some(f => String(row[f]||"").toLowerCase().includes(ql)));
      return { ...cfg, rows: rows.slice(0,4), total: rows.length };
    })
    .filter(r => r.rows.length > 0);

  return (
    <div style={{position:"relative",flex:1,minWidth:130,maxWidth:340}}>
      <input
        value={q}
        onChange={e=>{ setQ(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false),150)}
        placeholder="🔍 Search jobs, clients, invoices…"
        aria-label="Search across all modules"
        style={{width:"100%",padding:"7px 11px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:12,outline:"none",boxSizing:"border-box",minHeight:32}}
      />
      {open && q.trim().length>=2 && (
        <div role="listbox" style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:T.white,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:"0 10px 30px rgba(0,0,0,.15)",zIndex:50,maxHeight:360,overflowY:"auto"}}>
          {results.length===0 ? (
            <div style={{padding:14,fontSize:12,color:T.slate,textAlign:"center"}}>No matches for "{q}"</div>
          ) : results.map(r => {
            const mod = ALL_MODULES.find(m=>m.id===r.moduleId);
            return (
              <div key={r.moduleId}>
                <div style={{padding:"7px 12px 3px",fontSize:10,fontWeight:800,color:T.slate,letterSpacing:.4,textTransform:"uppercase"}}>
                  {mod?.icon} {mod?.label}{r.total>r.rows.length?` (${r.total})`:""}
                </div>
                {r.rows.map((row,i)=>(
                  <button key={i} role="option" onMouseDown={()=>{ onNavigate(r.moduleId); setQ(""); setOpen(false); }}
                    style={{display:"block",width:"100%",textAlign:"left",padding:"7px 12px",border:"none",background:"none",cursor:"pointer",fontSize:12,color:T.dark,borderTop:`1px solid ${T.light}`}}>
                    {searchResultLabel(r.moduleId,row)}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── APP SHELL ─────────────────────────────────────────────────────────────────
export default function App() {
  // Session is kept in sessionStorage (not localStorage): it survives a
  // reload within the same tab — previously ANY refresh logged the user out,
  // annoying on a phone where the OS reclaims background tabs constantly —
  // but still clears when the tab/browser actually closes, which matters
  // more here than on a typical app since login is a single shared passcode
  // rather than a personal account.
  const SESSION_KEY = "ke_suite_session";
  const [user, setUser] = useState(() => {
    if (typeof window === "undefined" || IS_DEMO) return null;
    try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  });
  // Keeps the API client's `code` (used by the backend to resolve role — see
  // resolveRole() in apps-script-backend.js) in sync with whoever is
  // currently logged in, both on fresh login and on session restore above.
  useEffect(() => { setAuthCode(user?.code); }, [user]);
  const login = u => {
    setUser(u);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch {}
    showToast(`Welcome, ${u.name}!`);
  };
  const logout = () => {
    setUser(null);
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    fyCacheRef.current.clear();
  };
  const [active, setActive] = useState("dashboard");
  const [open,   setOpen]   = useState(true);
  const [fy,     setFY]     = useState(CURRENT_FY);
  const { show: showToast, Toast } = useToast();

  // Mobile viewport tracking: below 768px the sidebar becomes an off-canvas
  // drawer (closed by default, opened via the hamburger in the topbar) rather
  // than the desktop collapse-to-rail behaviour.
  const [isMobile, setIsMobile] = useState(typeof window!=="undefined" && window.innerWidth<=768);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth<=768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // liveData holds real Sheet rows, already denormalized to camelCase.
  // null = not loaded yet for this key. Falls back to MOCK[key] until then
  // (and permanently in IS_DEMO mode / on per-sheet fetch error).
  const [liveData, setLiveData] = useState({});
  const [loading,  setLoading]  = useState(!IS_DEMO);
  const [lastSync, setLastSync] = useState(null);
  const [syncError, setSyncError] = useState(null);

  // Config (passcodes, company info, alert thresholds) is fetched once on
  // boot — BEFORE login, not after — because Login itself has to check
  // against it. Without this, Settings → Passcodes has nothing real to
  // change: the old hardcoded PASSCODES object never reads from Config, so
  // "updating" a passcode there silently did nothing.
  const [configData, setConfigData] = useState({});
  const [configLoading, setConfigLoading] = useState(!IS_DEMO);
  const loadConfig = async () => {
    if (IS_DEMO) { setConfigLoading(false); return; }
    setConfigLoading(true);
    const r = await sheetsAPI.getConfig();
    if (r && !r.error) setConfigData(r.config || {});
    setConfigLoading(false);
  };
  useEffect(() => { loadConfig(); /* eslint-disable-next-line */ }, []);
  const passcodeMap = buildPasscodeMap(configData);

// Reverse of ROLES[role].modules → which SHEET_FOR key(s) that module needs.
// Used to scope loadLiveData's bulk fetch to what the logged-in role can
// actually read — otherwise every login (including Staff/CA) requested
// every sheet, including ones the backend's new RBAC layer now correctly
// refuses (e.g. Staff has no "purchases"/"ledger"/"tds"/"fd" access), which
// would've shown a permanent, misleading sync-error banner for those roles.
//
// "ar"/"pl"/"gst" map to MULTIPLE underlying sheet keys because they're
// derived reports, not their own tab — CA has those in its module list but
// deliberately no standalone "invoices"/"expenses" module (CA sees rolled-up
// reports, not the raw invoice-entry screen), so without this, CA's own AR/
// P&L/GST views would have nothing to compute from. Keep this in sync with
// MODULE_SHEETS in apps-script-backend.js — same access model, described
// twice because Apps Script can't import the React source.
const MODULE_TO_SHEETKEYS = {
  jobs:["jobs"], invoices:["invoices"], purchases:["purchases"], quotations:["quotations"],
  clients:["clients"], vendors:["vendors"], inventory:["inventory"], expenses:["expenses"],
  pettycash:["pettyCash"], ledger:["ledger"], fd:["fds"], vault:["vault"], tds:["tds"],
  attendance:["attendance"], vehicles:["vehicles"],
  ar:["invoices"], pl:["invoices","purchases","expenses"], gst:["invoices","purchases"],
};

// Same-session, in-memory cache of the last successful RAW (pre-queue-merge)
// bulk read per FY — keyed by fy, holding { raw, assetsRaw }. Lets toggling
// back and forth between FYs already loaded this session (e.g. reconciling
// something) skip the network round-trip. Deliberately separate from
// offlineDB's IndexedDB cache: this is a same-session speed optimization
// that lives only in memory and never persists, not a new offline-durability
// mechanism — offlineDB.js is untouched.
const fyCacheRef = useRef(new Map());

  // `useCache: true` serves the last successful load for this FY from
  // fyCacheRef instead of hitting the network — but ONLY the raw snapshot;
  // the write queue is always re-fetched and re-merged fresh on top (see
  // mergeQueueIntoResult calls below), so a queued edit made after the cache
  // was populated still shows up when switching back to that FY. Callers
  // that need to guarantee fresh server truth (first login, explicit
  // refresh/sync) must NOT pass useCache — see call sites below.
  const loadLiveData = async ({ useCache = false } = {}) => {
    if (IS_DEMO) { setLoading(false); return; }
    setLoading(true);
    setSyncError(null);
    try {
      const allowedModules = ROLES[user.role]?.modules || [];
      const allowedKeys = new Set(allowedModules.flatMap(m => MODULE_TO_SHEETKEYS[m] || []));
      const names = Object.entries(SHEET_FOR).filter(([key]) => allowedKeys.has(key)).map(([,sheetName]) => sheetName);
      const wantsAssets = allowedModules.includes("assets");

      const cached = useCache ? fyCacheRef.current.get(fy) : null;
      let raw, assetsRaw;
      if (cached) {
        raw = cached.raw;
        assetsRaw = cached.assetsRaw;
      } else {
        [raw, assetsRaw] = await Promise.all([
          sheetsAPI.readManyRaw(names, fy),
          wantsAssets ? sheetsAPI.readRaw(ASSETS_SHEET, null) : Promise.resolve(null), // no FY filter — cumulative register
        ]);
        fyCacheRef.current.set(fy, { raw, assetsRaw });
      }

      // Overlay the CURRENT write queue on top, whether `raw`/`assetsRaw`
      // came from the network just now or from the cache above.
      const queue = await sheetsAPI.getPendingWrites();
      const results = {};
      names.forEach(name => { results[name] = mergeQueueIntoResult(name, fy, raw[name], queue); });
      const assetsResult = wantsAssets ? mergeQueueIntoResult(ASSETS_SHEET, null, assetsRaw, queue) : null;

      const next = {};
      let anyError = null;
      Object.entries(SHEET_FOR).forEach(([key, sheetName]) => {
        if (!allowedKeys.has(key)) return; // not requested for this role — leave undefined, components default to []
        const r = results[sheetName];
        if (!r || r.error) { anyError = anyError || r?.error || "Unknown error"; return; }
        next[key] = denormalizeRows(sheetName, r);
      });
      if (wantsAssets) {
        if (assetsResult?.error) { anyError = anyError || assetsResult.error; }
        else { next.assets = denormalizeRows(ASSETS_SHEET, assetsResult); }
      }
      setLiveData(prev => ({ ...prev, ...next }));
      setLastSync(new Date());
      if (anyError) setSyncError(anyError);
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Tracks whether [user, fy] changed because of a plain FY switch (same
  // user, different fy) as opposed to a fresh login (user changed) — only
  // the former is allowed to serve from fyCacheRef. A fresh login must
  // always hit the network even if its initial fy happens to match a value
  // seen in a prior session's cache.
  const prevFyRef = useRef(fy);
  useEffect(() => {
    if (!user) return;
    const isFySwitch = prevFyRef.current !== fy;
    prevFyRef.current = fy;
    loadLiveData({ useCache: isFySwitch });
    /* eslint-disable-next-line */
  }, [user, fy]);

  // ─── OFFLINE QUEUE: pending count, auto-sync, conflict resolution ──────────
  // Lives here (not per-module) because every module's writes land in the
  // same queue — one indicator + one "Sync now" + one conflict resolver
  // covers all 16 CRUD modules with zero changes to any of them.
  const [pendingWrites, setPendingWrites] = useState([]);
  const [isOnline, setIsOnline] = useState(typeof navigator==="undefined" || navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = () => { sheetsAPI.getPendingWrites().then(setPendingWrites); };
  useEffect(() => {
    refreshPending();
    const unsub = sheetsAPI.subscribeQueue(refreshPending);
    return unsub;
  }, []);

  const runSync = async () => {
    if (IS_DEMO || syncing) return;
    setSyncing(true);
    try { await sheetsAPI.flushQueue(); }
    finally {
      setSyncing(false);
      refreshPending();
      if (user) loadLiveData(); // pull fresh server truth now that some/all writes landed
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const goOnline  = () => { setIsOnline(true); runSync(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
    // eslint-disable-next-line
  }, []);

  // Safety-net retry — the browser's `online` event can miss flaky
  // reconnects (e.g. a captive portal that "connects" before real internet
  // is up), so also try periodically whenever something is waiting.
  useEffect(() => {
    if (!pendingWrites.length) return;
    const id = setInterval(() => { if (navigator.onLine) runSync(); }, 25000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [pendingWrites.length]);

  const pendingCount  = pendingWrites.filter(q => q.status!=="conflict").length;
  const conflictQueue = pendingWrites.filter(q => q.status==="conflict");

  // Best-effort human label + field-level diff for the conflict modal. Uses
  // the same FIELD_MAPS/denormalizeRow the rest of the app uses to turn
  // sheet rows into camelCase — "mine" from the queued row array, "theirs"
  // from the live row fetched at conflict-detection time.
  const ID_FIELD_CANDIDATES = ["id","invoiceNo","code","logId","voucherNo","fdNo","ourRef"];
  const SKIP_DIFF_FIELDS = new Set(["rowIndex","fy","createdAt","createdBy"]);
  const conflicts = conflictQueue.map(q => {
    const headers = q.theirs?.headers || [];
    const mineObj = {}; headers.forEach((h,i)=>{ mineObj[h]=q.row?.[i] ?? ""; });
    const mine   = denormalizeRow(q.sheet, headers, {...mineObj, _rowNum:q.rowIndex});
    const theirs = denormalizeRow(q.sheet, headers, {...(q.theirs?.row||{}), _rowNum:q.rowIndex});
    const label = ID_FIELD_CANDIDATES.map(f=>theirs[f]||mine[f]).find(Boolean) || `row ${q.rowIndex}`;
    const diffs = Object.keys(mine)
      .filter(f => !SKIP_DIFF_FIELDS.has(f) && !f.startsWith("_") && String(mine[f]??"")!==String(theirs[f]??""))
      .map(field => ({ field, mine: mine[field], theirs: theirs[field] }));
    return { localId:q.localId, sheet:q.sheet, label, diffs, theirsBy: q.theirs?.createdBy, theirsAt: q.theirs?.createdAt };
  });

  const [conflictsHidden, setConflictsHidden] = useState(false);
  useEffect(() => { if (conflictQueue.length) setConflictsHidden(false); /* eslint-disable-next-line */ }, [conflictQueue.length]);

  const resolveConflict = async (localId, choice) => {
    const res = await sheetsAPI.resolveConflict(localId, choice);
    if (res?.error) { showToast(res.error, "red"); return; }
    refreshPending();
    loadLiveData();
  };

  // ─── SYNC QUEUE PANEL ───────────────────────────────────────────────────────
  // Full visibility into EVERY queued item (pending/error), not just
  // conflicts — the per-row PendingBadge in ui.jsx only surfaces one item at
  // a time on whichever table row someone happens to open. Same
  // ID_FIELD_CANDIDATES label lookup as the conflict modal above, but
  // reading straight off FIELD_MAPS[sheet] (the row array's own column
  // order) since a plain pending/error entry has no `theirs` snapshot to
  // pull headers from.
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
  const queueLabel = q => {
    const fields = FIELD_MAPS[q.sheet] || [];
    const obj = {};
    (q.row || []).forEach((v,i) => { const f = fields[i]; if (f) obj[f] = v; });
    return ID_FIELD_CANDIDATES.map(f=>obj[f]).find(Boolean) || `row ${q.rowIndex ?? "—"}`;
  };
  const queueItems = pendingWrites
    .filter(q => q.status!=="conflict")
    .map(q => ({ localId:q.localId, sheet:q.sheet, action:q.action, status:q.status, errorMsg:q.errorMsg, label:queueLabel(q) }));

  const retryQueueItem = async localId => {
    const res = await sheetsAPI.retryOne(localId);
    if (res?.error) { showToast(res.error, "red"); }
    else { showToast(res?.status==="conflict" ? "Needs your decision — see Conflicts" : "Synced", res?.status==="conflict" ? "amber" : "green"); }
    refreshPending();
    loadLiveData();
  };
  const discardQueueItem = async localId => {
    await sheetsAPI.discardQueueItem(localId);
    showToast("Discarded — will not be synced", "amber");
    refreshPending();
  };

  if (!user) return <Login passcodeMap={passcodeMap} configLoading={configLoading} onLogin={login}/>;

  const allowed = ALL_MODULES.filter(m=>ROLES[user.role]?.modules.includes(m.id));
  const groups  = MODULE_GROUPS.filter(g=>allowed.some(m=>m.group===g));
  const activeM = ALL_MODULES.find(m=>m.id===active);
  const refresh = loadLiveData; // passed to modules as onRefresh — actually re-syncs now

  // D(key): real Sheet data once loaded, MOCK as seed/fallback until then or on error.
  const D = key => liveData[key] ?? MOCK[key];

  // Common prop bundles passed to modules
  const commonProps = { fy, user:user.name, onRefresh:refresh };
  const allData = { invoices:D("invoices"), expenses:D("expenses"), purchases:D("purchases"), pettyCash:D("pettyCash") };

  const VIEWS = {
    dashboard:  <Dashboard mockData={{...MOCK, ...liveData}} fy={fy}/>,
    jobs:       <Jobs       {...commonProps} data={D("jobs")}      clients={D("clients")}/>,
    invoices:   <Invoices   {...commonProps} data={D("invoices")}  clients={D("clients")} jobs={D("jobs")}/>,
    purchases:  <PurchaseInvoices {...commonProps} data={D("purchases")} vendors={D("vendors")} jobs={D("jobs")}/>,
    quotations: <Quotations {...commonProps} data={D("quotations")} clients={D("clients")}/>,
    clients:    <Clients    {...commonProps} data={D("clients")}/>,
    vendors:    <Vendors    {...commonProps} data={D("vendors")}/>,
    inventory:  <Inventory  {...commonProps} data={D("inventory")} vendors={D("vendors")}/>,
    expenses:   <Expenses   {...commonProps} data={D("expenses")}  jobs={D("jobs")}/>,
    pettycash:  <PettyCash  {...commonProps} data={D("pettyCash")} jobs={D("jobs")} imprestAmount={10000}/>,
    ledger:     <Ledger     {...commonProps} data={D("ledger")}/>,
    ar:         <ARaging    {...commonProps} data={D("invoices")}/>,
    pl:         <PandL      {...commonProps} data={allData}/>,
    gst:        <GSTSummary {...commonProps} data={allData}/>,
    tds:        <TDSRegister fy={fy} user={user.name} onRefresh={refresh} data={D("tds")}/>,
    assets:     <FixedAssets fy={fy} user={user.name} onRefresh={refresh} data={D("assets")}/>,
    fd:         <FDTracker  {...commonProps} data={D("fds")}/>,
    vault:      <DocumentVault {...commonProps} data={D("vault")}/>,
    attendance: <Attendance {...commonProps} data={D("attendance")}/>,
    vehicles:   <VehicleLog {...commonProps} data={D("vehicles")}/>,
    settings:   <Settings   user={user} configData={configData} onConfigUpdated={loadConfig}/>,
  };

  return (
    <AuthCtx.Provider value={user}>
    <FYCtx.Provider value={fy}>
    <ErrorBoundary scope="KE Business Suite">
      <div style={{display:"flex",height:"100vh",fontFamily:"'Segoe UI',Arial,sans-serif",background:T.light,overflow:"hidden"}}>

        {/* Mobile-only backdrop behind the open drawer — tapping it closes the nav */}
        {isMobile && mobileNavOpen && (
          <div onClick={()=>setMobileNavOpen(false)} aria-hidden="true"
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:9}}/>
        )}

        {/* SIDEBAR */}
        <div className={`ke-sidebar${isMobile&&!mobileNavOpen?" collapsed-mobile":""}`}
          style={{width:isMobile?224:(open?224:58),background:T.sidebar,display:"flex",flexDirection:"column",transition:"width .2s, transform .2s",flexShrink:0,boxShadow:"2px 0 16px rgba(0,0,0,.2)",zIndex:10,overflow:"hidden"}}>
          <div style={{padding:"13px 12px 11px",borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:33,height:33,borderRadius:8,background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:14,color:T.navy,flexShrink:0}}>KE</div>
              {open&&<div><div style={{color:"#fff",fontWeight:800,fontSize:13,lineHeight:1.2}}>Keshav</div><div style={{color:T.gold,fontWeight:700,fontSize:9,letterSpacing:1}}>ENTERPRISES</div></div>}
            </div>
          </div>

          <nav aria-label="Main modules" style={{flex:1,padding:"5px 0",overflowY:"auto"}}>
            {groups.map(grp=>{
              const grpMods = allowed.filter(m=>m.group===grp);
              return (
                <div key={grp}>
                  {open&&<div style={{padding:"8px 12px 3px",fontSize:9,fontWeight:800,color:"rgba(255,255,255,.3)",letterSpacing:1.2,textTransform:"uppercase"}}>{grp}</div>}
                  {grpMods.map(m=>(
                    <button key={m.id} aria-current={active===m.id?"page":undefined}
                      onClick={()=>{ setActive(m.id); if(isMobile) setMobileNavOpen(false); }}
                      style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",border:"none",cursor:"pointer",textAlign:"left",background:active===m.id?"rgba(216,154,58,.22)":"transparent",borderLeft:active===m.id?`3px solid ${T.gold}`:"3px solid transparent",color:active===m.id?T.gold:"rgba(255,255,255,.72)",fontSize:12.5,fontWeight:active===m.id?700:400,transition:"all .12s",minHeight:40}}>
                      <span aria-hidden="true" style={{fontSize:14,flexShrink:0,width:20,textAlign:"center"}}>{m.icon}</span>
                      {open&&<span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.label}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          <div style={{padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,.08)",flexShrink:0}}>
            {!isMobile && (
              <button onClick={()=>setOpen(o=>!o)} aria-label={open?"Collapse sidebar":"Expand sidebar"} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.5)",borderRadius:8,padding:"6px 8px",cursor:"pointer",width:"100%",fontSize:11,marginBottom:open?8:0,minHeight:34}}>
                {open?"◀ Collapse":"▶"}
              </button>
            )}
            {isMobile && (
              <button onClick={()=>setMobileNavOpen(false)} style={{background:"rgba(255,255,255,.08)",border:"none",color:"rgba(255,255,255,.5)",borderRadius:8,padding:"6px 8px",cursor:"pointer",width:"100%",fontSize:11,marginBottom:8,minHeight:34}}>
                ✕ Close menu
              </button>
            )}
            {(open||isMobile)&&(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,color:T.navy,flexShrink:0}} aria-hidden="true">
                  {user.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:"#fff",fontSize:12,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div>
                  <div style={{color:"rgba(255,255,255,.4)",fontSize:10}}>{ROLES[user.role]?.label}</div>
                </div>
                <button onClick={logout} aria-label="Sign out" style={{background:"rgba(255,255,255,.1)",border:"none",color:"rgba(255,255,255,.4)",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:10,minHeight:30}}>Out</button>
              </div>
            )}
          </div>
        </div>

        {/* MAIN */}
        <div className="ke-main" style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",width:"100%"}}>
          <div className="ke-topbar" style={{background:"#fff",padding:"8px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 1px 4px rgba(0,0,0,.06)",flexShrink:0,gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
              {isMobile && (
                <button onClick={()=>setMobileNavOpen(true)} aria-label="Open menu" style={{background:T.light,border:"none",borderRadius:8,padding:"7px 10px",cursor:"pointer",fontSize:15,flexShrink:0,minHeight:36,minWidth:36}}>☰</button>
              )}
              <span aria-hidden="true" style={{fontSize:16}}>{activeM?.icon}</span>
              <span style={{fontWeight:800,color:T.navy,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeM?.label}</span>
            </div>
            <GlobalSearch D={D} onNavigate={id=>{ setActive(id); if(isMobile) setMobileNavOpen(false); }}/>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
              <FYSelector fy={fy} setFY={setFY} allFYs={ALL_FYS} currentFY={CURRENT_FY}/>
              <div style={{background:T.light,borderRadius:8,padding:"4px 11px",fontSize:11,color:T.slate,fontWeight:600}} className="ke-date-pill">
                {new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
              </div>
              {!IS_DEMO && (
                <SyncStatusBadge pendingCount={pendingCount} conflictCount={conflictQueue.length} syncing={syncing} online={isOnline}
                  onSyncNow={()=>{ setConflictsHidden(false); runSync(); }}/>
              )}
              {!IS_DEMO && (pendingCount>0 || conflictQueue.length>0) && (
                <button onClick={()=>setQueuePanelOpen(true)} title="View sync queue details" aria-label="View sync queue details"
                  style={{background:T.light,border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 9px",cursor:"pointer",fontSize:13,minHeight:34}}>
                  📋
                </button>
              )}
              {IS_DEMO ? (
                <div style={{background:"#FBEEDD",borderRadius:8,padding:"4px 11px",fontSize:11,color:T.amber,fontWeight:700,border:`1px solid ${T.amber}`}}>
                  ⚡ Demo Mode
                </div>
              ) : loading ? (
                <div role="status" style={{background:"#EEF2F7",borderRadius:8,padding:"4px 11px",fontSize:11,color:T.slate,fontWeight:700}}>
                  ↻ Syncing…
                </div>
              ) : !isOnline ? (
                <div role="status" title="Showing your last-synced data — new edits are saved locally until you're back online"
                  style={{background:"#EEF2F7",borderRadius:8,padding:"4px 11px",fontSize:11,color:T.slate,fontWeight:700}}>
                  📴 Offline — showing cached data
                </div>
              ) : syncError ? (
                <button onClick={loadLiveData} title={syncError}
                  style={{background:"#FDECEA",borderRadius:8,padding:"4px 11px",fontSize:11,color:T.red,fontWeight:700,border:`1px solid ${T.red}`,cursor:"pointer",minHeight:34}}>
                  ⚠ Sync failed — retry
                </button>
              ) : (
                <button onClick={loadLiveData}
                  style={{background:"#E8F5E9",borderRadius:8,padding:"4px 11px",fontSize:11,color:T.green,fontWeight:700,border:`1px solid ${T.green}`,cursor:"pointer",minHeight:34}}>
                  ● Live{lastSync?` — synced ${lastSync.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`:""}
                </button>
              )}
            </div>
          </div>

          <div className="ke-content" style={{flex:1,overflowY:"auto",padding:20}}>
            <ErrorBoundary key={active} scope={activeM?.label || "This module"} inline>
              {VIEWS[active] || <div style={{color:T.slate,textAlign:"center",padding:40,fontSize:14}}>Module not found</div>}
            </ErrorBoundary>
          </div>
        </div>

        {conflicts.length>0 && !conflictsHidden && <ConflictModal conflicts={conflicts} onResolve={resolveConflict} onClose={()=>setConflictsHidden(true)}/>}
        {queuePanelOpen && (
          <SyncQueuePanel
            items={queueItems}
            conflicts={conflicts}
            onClose={()=>setQueuePanelOpen(false)}
            onRetry={retryQueueItem}
            onDiscard={discardQueueItem}
            onResolve={resolveConflict}
          />
        )}
        <Toast/>
      </div>
    </ErrorBoundary>
    </FYCtx.Provider>
    </AuthCtx.Provider>
  );
}
