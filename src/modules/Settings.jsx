import { useState, useEffect } from "react";
import { T, OPT } from "../shared/constants.js";
import { fmt, waLink, sheetsAPI, IS_DEMO } from "../shared/utils.js";
import { SHdr, F, G2, G3, FSec, Alert, Badge, useToast } from "../shared/ui.jsx";

const WA_TEMPLATE_LIST = [
  { id:"payReminder", label:"Payment Reminder", icon:"💰", fields:["clientName","amount","invoiceNo"],
    preview:"Dear Sir/Madam, this is Keshav Sharma from Keshav Enterprises. Gentle reminder regarding payment of ₹[amount] against Invoice [invoiceNo]..." },
  { id:"jobUpdate",   label:"Job Status Update", icon:"⚙️", fields:["clientName","jobId","status","site"],
    preview:"Dear [clientName], Job Update — [jobId]. Status: [status]. Site: [site]..." },
  { id:"quotFollowup",label:"Quotation Follow-up",icon:"📋",fields:["clientName","quoteNo","subject","value"],
    preview:"Dear [clientName], following up on our Quotation [quoteNo] for [subject] (Value: ₹[value])..." },
  { id:"greeting",    label:"Festival Greeting", icon:"🎉", fields:["clientName","occasion"],
    preview:"Dear [clientName], Wishing you and your team a very Happy [occasion]! — Keshav Enterprises..." },
  { id:"dsr",         label:"Daily Site Report",  icon:"📋", fields:["clientName","jobId","workDone","nextPlan"],
    preview:"Dear [clientName], DSR for Job [jobId]: Work done today — [workDone]. Tomorrow's plan — [nextPlan]..." },
  { id:"quotSubmit",  label:"Quotation Submitted", icon:"📄", fields:["clientName","quoteNo","value"],
    preview:"Dear [clientName], please find enclosed our quotation [quoteNo] for your requirement. Value: ₹[value]..." },
];

const FILING_DATES = [
  { name:"GSTR-1",   due:"11th of next month",  freq:"Monthly",   note:"Sales invoices (outward supplies)" },
  { name:"GSTR-3B",  due:"20th of next month",  freq:"Monthly",   note:"Summary return + GST payment" },
  { name:"TDS 26Q",  due:"31 Jul/Oct/Jan/May",  freq:"Quarterly", note:"TDS deducted from contractors/professionals" },
  { name:"Advance Tax",due:"15 Jun/Sep/Dec/Mar", freq:"Quarterly", note:"If tax liability > ₹10,000" },
  { name:"ITR",       due:"31 July",             freq:"Annual",    note:"Income tax return filing" },
  { name:"Form 16A",  due:"15 days after TDS due",freq:"Quarterly",note:"Issue to vendors after TDS deduction" },
];

const WA_TEMPLATES = [
  { id:"payReminder",  label:"Payment Reminder",    icon:"💰", preview:"Dear Sir/Madam, this is Keshav Sharma from Keshav Enterprises. Gentle reminder regarding payment of ₹[amount] against Invoice [invoiceNo]. Request you to please arrange payment." },
  { id:"jobUpdate",    label:"Job Status Update",   icon:"⚙️", preview:"Dear [clientName], Job Update — [jobId]. Status: [status]. Site: [site]. Please revert for any queries. — Keshav Enterprises" },
  { id:"quotFollowup", label:"Quotation Follow-up", icon:"📋", preview:"Dear [clientName], following up on our Quotation [quoteNo] for [subject] (Value: ₹[value]+GST). Request your acceptance. — Keshav Enterprises" },
  { id:"greeting",     label:"Festival Greeting",   icon:"🎉", preview:"Dear [clientName], Wishing you and your team a very Happy [occasion]! Thank you for your continued association. — Keshav Sharma, Keshav Enterprises" },
  { id:"dsr",          label:"Daily Site Report",   icon:"📋", preview:"Dear [clientName], DSR for Job [jobId]: Work done today — [workDone]. Tomorrow's plan — [nextPlan]. Please revert for queries." },
  { id:"quotSubmit",   label:"Quotation Submitted", icon:"📄", preview:"Dear [clientName], please find enclosed our quotation [quoteNo] for your requirement. Value: ₹[value]+GST. Valid till [validTill]. — KE" },
];
// Maps each local form field to the Config sheet key it round-trips through.
// Company fields beyond the handful CONFIG originally seeded (name/gstin)
// get new Config rows created on first save — setConfig() upserts, so that's
// safe; initAllSheets() doesn't need to know about them in advance.
const COMPANY_KEYS = {
  name:"COMPANY_NAME", mobile:"COMPANY_MOBILE", address:"COMPANY_ADDRESS",
  email:"COMPANY_EMAIL", website:"COMPANY_WEBSITE", gstin:"COMPANY_GSTIN",
  pan:"COMPANY_PAN", iec:"COMPANY_IEC", msme:"COMPANY_MSME",
  bankName:"COMPANY_BANK_NAME", branch:"COMPANY_BRANCH",
  accountNo:"COMPANY_ACCOUNT_NO", ifsc:"COMPANY_IFSC",
};
const ALERT_KEYS = {
  alertEmail:"ALERT_EMAIL", pettyCashFloat:"PETTY_CASH_FLOAT",
  arAlertDays:"AR_ALERT_DAYS", fdAlertDays:"FD_ALERT_DAYS",
  lowStockAlert:"LOW_STOCK_ALERT", docExpiryAlert:"DOC_EXPIRY_ALERT",
  monthlyReport:"MONTHLY_REPORT_ALERT", dailyAlert:"DAILY_ALERT",
};
const PASSCODE_KEYS = { admin:"ADMIN_PASSCODE", staff:"STAFF_PASSCODE", ca:"CA_PASSCODE" };

// Reads a raw Config value back into the shape the form state expects
// (Config stores everything as text/number cells; checkboxes need boolean).
const asBool = v => v===true || v==="TRUE" || v==="true" || v===1 || v==="1";

export default function Settings({ user, configData={}, onConfigUpdated }) {
  const [section, setSection]   = useState("company");
  const [testWA,  setTestWA]    = useState(null);
  const { show, Toast } = useToast();

  const [company, setCompany] = useState({
    name:"Keshav Enterprises", address:"Shamli, Uttar Pradesh — 247776",
    gstin:"09XXXXXXXXXXXXX", pan:"XXXXXPXXXXXX", iec:"XXXXXXXXXX",
    msme:"UP/MSME/2018/XXXXX", mobile:"+91-XXXXXXXXXX",
    email:"info@keshaventerprises.com", website:"",
    bankName:"State Bank of India", accountNo:"XXXX XXXX XXXX",
    ifsc:"SBIN0001234", branch:"Shamli Main Branch",
  });

  const [alertCfg, setAlertCfg] = useState({
    alertEmail:"your@gmail.com", pettyCashFloat:10000,
    arAlertDays:60, fdAlertDays:30,
    lowStockAlert:true, docExpiryAlert:true,
    monthlyReport:true, dailyAlert:true,
  });

  const [passcodes, setPasscodes] = useState({
    admin:"ADMIN2024", staff:"STAFF001", ca:"CA1234",
  });

  // Prefill every section from whatever's actually in Config once it loads —
  // any key Config doesn't have yet just keeps the hardcoded default above.
  useEffect(() => {
    if (!configData || Object.keys(configData).length===0) return;
    setCompany(f => { const n={...f}; Object.entries(COMPANY_KEYS).forEach(([field,key])=>{ if(configData[key]!==undefined) n[field]=configData[key]; }); return n; });
    setAlertCfg(f => { const n={...f}; Object.entries(ALERT_KEYS).forEach(([field,key])=>{ if(configData[key]!==undefined) n[field]= typeof f[field]==="boolean" ? asBool(configData[key]) : configData[key]; }); return n; });
    setPasscodes(f => { const n={...f}; Object.entries(PASSCODE_KEYS).forEach(([field,key])=>{ if(configData[key]) n[field]=configData[key]; }); return n; });
  }, [configData]);

  const [savingSection, setSavingSection] = useState(null); // 'company' | 'alerts' | 'passcodes' | null
  const [savedSection,  setSavedSection]  = useState(null);

  const hcC = e => setCompany(f=>({...f,[e.target.name]:e.target.value}));
  const hcA = e => setAlertCfg(f=>({...f,[e.target.name]:e.target.type==="checkbox"?e.target.checked:e.target.value}));
  const hcP = e => setPasscodes(f=>({...f,[e.target.name]:e.target.value}));

  // Actually persists a section to the Config sheet — replaces the old
  // handleSave, which only flipped a local "saved" flag for 2.5s and wrote
  // nothing anywhere. Every field here now round-trips through setConfig().
  const saveSection = async (sectionId, state, keyMap) => {
    if (IS_DEMO) { show("Demo mode — settings aren't persisted. Connect a live Sheet to save for real.","amber"); return; }
    setSavingSection(sectionId);
    const entries = Object.entries(keyMap);
    const results = await Promise.all(entries.map(([field,key]) => sheetsAPI.setConfig(key, state[field])));
    const failed = results.filter(r=>r?.error);
    setSavingSection(null);
    if (failed.length) {
      show(`${failed.length} of ${entries.length} settings failed to save — check your connection and try again.`,"red");
      return;
    }
    setSavedSection(sectionId);
    setTimeout(()=>setSavedSection(null), 2500);
    show("Settings saved to Google Sheets","green");
    onConfigUpdated && onConfigUpdated(); // refresh App's live Config (passcodeMap etc.)
  };

  const [pcErrors, setPcErrors] = useState({});
  const savePasscodes = () => {
    const errs = {};
    Object.entries(passcodes).forEach(([k,v]) => { if (!v || String(v).trim().length < 6) errs[k] = "Minimum 6 characters"; });
    if (Object.keys(errs).length) { setPcErrors(errs); return; }
    setPcErrors({});
    saveSection("passcodes", passcodes, PASSCODE_KEYS);
  };

  const SECTIONS = [
    { id:"company",    label:"🏢 Company Info" },
    { id:"alerts",     label:"🔔 Alert Settings" },
    { id:"passcodes",  label:"🔐 Passcodes" },
    { id:"templates",  label:"💬 WA Templates" },
    { id:"compliance", label:"📅 Compliance Calendar" },
    { id:"backup",     label:"💾 Data & Backup" },
  ];

  return (
    <div>
      <SHdr title="⚙️ Settings" />

      <div style={{ display:"flex", gap:16 }}>
        {/* Sidebar nav */}
        <div style={{ width:190, flexShrink:0 }}>
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, overflow:"hidden" }}>
            {SECTIONS.map(s=>(
              <button key={s.id} onClick={()=>setSection(s.id)} style={{
                display:"block", width:"100%", padding:"11px 16px", border:"none",
                textAlign:"left", cursor:"pointer", fontSize:12.5, fontWeight:section===s.id?700:400,
                background:section===s.id?T.navy:"transparent",
                color:section===s.id?T.white:T.dark,
                borderLeft:section===s.id?`3px solid ${T.gold}`:"3px solid transparent",
              }}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1 }}>

          {/* COMPANY INFO */}
          {section==="company" && (
            <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:24 }}>
              <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:800, color:T.navy }}>🏢 Company Information</h3>
              <FSec label="Basic Details" />
              <G2>
                <F label="Company Name"    name="name"    value={company.name}    onChange={hcC} />
                <F label="Mobile / Phone"  name="mobile"  value={company.mobile}  onChange={hcC} />
              </G2>
              <F label="Address"           name="address" value={company.address} onChange={hcC} />
              <G2>
                <F label="Email"   name="email"   value={company.email}   onChange={hcC} />
                <F label="Website" name="website" value={company.website} onChange={hcC} placeholder="https://..." />
              </G2>

              <FSec label="Registration Numbers" />
              <G2>
                <F label="GSTIN"         name="gstin" value={company.gstin} onChange={hcC} hint="15-digit GST number" />
                <F label="PAN"           name="pan"   value={company.pan}   onChange={hcC} hint="10-character PAN" />
              </G2>
              <G2>
                <F label="IEC (Import Export Code)" name="iec"  value={company.iec}  onChange={hcC} />
                <F label="MSME Registration No."    name="msme" value={company.msme} onChange={hcC} />
              </G2>

              <FSec label="Bank Details (for invoices)" />
              <G2>
                <F label="Bank Name"     name="bankName"  value={company.bankName}  onChange={hcC} options={OPT.banks} />
                <F label="Branch"        name="branch"    value={company.branch}    onChange={hcC} />
              </G2>
              <G2>
                <F label="Account No."  name="accountNo" value={company.accountNo} onChange={hcC} />
                <F label="IFSC Code"    name="ifsc"      value={company.ifsc}      onChange={hcC} />
              </G2>

              <button onClick={()=>saveSection("company", company, COMPANY_KEYS)} disabled={savingSection==="company"}
                style={{ background:savedSection==="company"?T.green:T.navy, color:T.white, border:"none", borderRadius:8, padding:"10px 24px", fontSize:13, fontWeight:700, cursor:savingSection?"default":"pointer", marginTop:8, opacity:savingSection&&savingSection!=="company"?0.6:1 }}>
                {savingSection==="company" ? "Saving…" : savedSection==="company" ? "✅ Saved!" : "💾 Save to Google Sheets"}
              </button>
            </div>
          )}

          {/* ALERT SETTINGS */}
          {section==="alerts" && (
            <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:24 }}>
              <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:800, color:T.navy }}>🔔 Alert & Notification Settings</h3>
              <Alert type="blue" icon="ℹ️" msg="Alerts are sent via Gmail using your Apps Script backend. All alerts are free — uses GmailApp (100 emails/day limit)." />

              <FSec label="Alert Destination" />
              <F label="Alert Email Address" name="alertEmail" type="email" value={alertCfg.alertEmail} onChange={hcA} hint="Daily alert email is sent to this address every morning at 8 AM" />

              <FSec label="Alert Thresholds" />
              <G2>
                <F label="AR Overdue Alert (days)"    name="arAlertDays"       type="number" value={alertCfg.arAlertDays}       onChange={hcA} hint="Alert when invoice unpaid for this many days" />
                <F label="FD Maturity Alert (days)"   name="fdAlertDays"       type="number" value={alertCfg.fdAlertDays}       onChange={hcA} hint="Alert when FD matures within this many days" />
              </G2>
              <F label="Petty Cash Low Balance Alert (₹)" name="pettyCashFloat" type="number" value={alertCfg.pettyCashFloat} onChange={hcA} hint="Alert when petty cash falls below this amount" />

              <FSec label="Enable / Disable Alerts" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  { name:"dailyAlert",      label:"Daily Morning Alert (8 AM)",     hint:"FDs, AR, low stock, docs in one email" },
                  { name:"monthlyReport",   label:"Monthly P&L Report",              hint:"1st of every month — revenue, expenses, GST" },
                  { name:"lowStockAlert",   label:"Low Stock Alerts",                hint:"When inventory falls below reorder level" },
                  { name:"docExpiryAlert",  label:"Document Expiry Alerts",          hint:"Insurance, AMC, licenses expiring soon" },
                ].map(a=>(
                  <label key={a.name} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"12px 14px", borderRadius:10, border:`1px solid ${T.border}`, background:alertCfg[a.name]?"#D5F5E3":T.white, cursor:"pointer" }}>
                    <input type="checkbox" name={a.name} checked={!!alertCfg[a.name]} onChange={hcA} style={{ marginTop:2 }} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{a.label}</div>
                      <div style={{ fontSize:11, color:T.slate, marginTop:2 }}>{a.hint}</div>
                    </div>
                  </label>
                ))}
              </div>

              <button onClick={()=>saveSection("alerts", alertCfg, ALERT_KEYS)} disabled={savingSection==="alerts"}
                style={{ background:savedSection==="alerts"?T.green:T.navy, color:T.white, border:"none", borderRadius:8, padding:"10px 24px", fontSize:13, fontWeight:700, cursor:savingSection?"default":"pointer", marginTop:16, opacity:savingSection&&savingSection!=="alerts"?0.6:1 }}>
                {savingSection==="alerts" ? "Saving…" : savedSection==="alerts" ? "✅ Saved!" : "💾 Save Settings"}
              </button>
            </div>
          )}

          {/* PASSCODES */}
          {section==="passcodes" && (
            <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:24 }}>
              <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:800, color:T.navy }}>🔐 Access Passcodes</h3>
              <Alert type="amber" icon="⚠️" msg="Change default passcodes immediately after go-live. Saving here updates the Config sheet directly — the new passcode works for login right away, no redeploy needed." />

              <FSec label="Role-based Passcodes" sub="Minimum 6 characters" />
              {[
                { name:"admin", label:"Admin Passcode (Keshav — Full Access)",  hint:"All 21 modules including financials and FD tracker" },
                { name:"staff", label:"Staff Passcode (Operations Only)",        hint:"Jobs, Clients, Inventory, Expenses, Petty Cash" },
                { name:"ca",    label:"CA / Accountant Passcode (Read-only)",   hint:"Ledger, P&L, GST, TDS, Assets — read only" },
              ].map(p=>(
                <div key={p.name} style={{ marginBottom:16, padding:"14px 16px", borderRadius:10, border:`1px solid ${T.border}`, background:T.light }}>
                  <F label={p.label} name={p.name} value={passcodes[p.name]} onChange={hcP} type="text" hint={p.hint} error={pcErrors[p.name]} />
                  <div style={{ display:"flex", gap:8, marginTop:4 }}>
                    <Badge label={p.name==="admin"?"Admin":p.name==="staff"?"Staff":"CA"} color={p.name==="admin"?"amber":p.name==="staff"?"green":"blue"} />
                    <span style={{ fontSize:11, color:T.slate }}>{p.hint}</span>
                  </div>
                </div>
              ))}

              <div style={{ background:"#FADBD8", borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:12 }}>
                <strong style={{ color:T.red }}>Security Note:</strong> This app uses simple passcode auth for your small trusted team. For higher security in future, consider adding Google OAuth (still free via Apps Script). Never share passcodes over WhatsApp.
              </div>

              <button onClick={savePasscodes} disabled={savingSection==="passcodes"}
                style={{ background:savedSection==="passcodes"?T.green:T.navy, color:T.white, border:"none", borderRadius:8, padding:"10px 24px", fontSize:13, fontWeight:700, cursor:savingSection?"default":"pointer", opacity:savingSection&&savingSection!=="passcodes"?0.6:1 }}>
                {savingSection==="passcodes" ? "Saving…" : savedSection==="passcodes" ? "✅ Saved!" : "💾 Update Passcodes"}
              </button>
            </div>
          )}

          {/* WA TEMPLATES */}
          {section==="templates" && (
            <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:24 }}>
              <h3 style={{ margin:"0 0 6px", fontSize:14, fontWeight:800, color:T.navy }}>💬 WhatsApp Message Templates</h3>
              <p style={{ margin:"0 0 16px", fontSize:12, color:T.slate }}>Pre-filled professional messages. Click "Test WA" to open WhatsApp with the template. Zero API cost — uses wa.me links.</p>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {WA_TEMPLATE_LIST.map(t=>(
                  <div key={t.id} style={{ background:T.light, borderRadius:12, padding:"14px 16px", border:`1px solid ${T.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{t.icon}</span>
                      <span style={{ fontWeight:700, fontSize:13, color:T.navy }}>{t.label}</span>
                    </div>
                    <div style={{ fontSize:11, color:T.slate, lineHeight:1.6, marginBottom:10, background:T.white, borderRadius:8, padding:"8px 10px" }}>
                      {t.preview}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                      {t.fields.map(f=>(
                        <span key={f} style={{ background:"#E8ECF2", color:T.slate, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:600 }}>[{f}]</span>
                      ))}
                    </div>
                    <a href={waLink("9812345678", t.preview.replace(/\[.*?\]/g,"___"))} target="_blank" rel="noreferrer"
                      style={{ display:"inline-block", background:"#25D366", color:T.white, borderRadius:8, padding:"5px 14px", fontSize:11, fontWeight:700, textDecoration:"none" }}>
                      Test WA →
                    </a>
                  </div>
                ))}
              </div>

              <div style={{ marginTop:16, background:"#EEF2F7", borderRadius:10, padding:"12px 16px", fontSize:12, color:T.slate }}>
                <strong>How templates work:</strong> When you click WA button on any Client, AR Aging, or Quotation row, the message auto-fills with that client's data and opens WhatsApp Web / App. No API required. No monthly cost.
              </div>
            </div>
          )}

          {/* COMPLIANCE CALENDAR */}
          {section==="compliance" && (
            <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:24 }}>
              <h3 style={{ margin:"0 0 6px", fontSize:14, fontWeight:800, color:T.navy }}>📅 Compliance & Filing Calendar</h3>
              <p style={{ margin:"0 0 16px", fontSize:12, color:T.slate }}>Key filing deadlines for Keshav Enterprises. Share with your CA.</p>

              <div style={{ overflowX:"auto", borderRadius:10, border:`1px solid ${T.border}` }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead><tr style={{ background:T.navy }}>
                    {["Return / Form","Due Date","Frequency","What to file","Status"].map(h=>(
                      <th key={h} style={{ padding:"10px 14px", color:T.white, fontWeight:700, fontSize:11, textAlign:"left" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {FILING_DATES.map((f,i)=>(
                      <tr key={f.name} style={{ background:i%2===0?T.white:T.light }}>
                        <td style={{ padding:"10px 14px", fontWeight:700, color:T.navy }}>{f.name}</td>
                        <td style={{ padding:"10px 14px", fontWeight:600, color:T.amber }}>{f.due}</td>
                        <td style={{ padding:"10px 14px" }}><Badge label={f.freq} color={f.freq==="Monthly"?"red":f.freq==="Quarterly"?"amber":"blue"} /></td>
                        <td style={{ padding:"10px 14px", fontSize:12, color:T.slate }}>{f.note}</td>
                        <td style={{ padding:"10px 14px" }}><Badge label="Check with CA" color="default" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop:16, background:"#D5F5E3", borderRadius:10, padding:"12px 16px", fontSize:12 }}>
                <strong style={{ color:T.green }}>Tip:</strong> Your GST Summary module auto-calculates Output GST, Input ITC, and Net Payable for GSTR-3B. Share that screen with your CA monthly. TDS Register tracks all deductions and deposits for quarterly TDS returns.
              </div>
            </div>
          )}

          {/* BACKUP */}
          {section==="backup" && (
            <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:24 }}>
              <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:800, color:T.navy }}>💾 Data & Backup</h3>

              <Alert type="green" icon="✅" msg="Your data is stored in Google Sheets — which Google backs up automatically. You have unlimited version history." />

              <FSec label="Google Sheets Backup" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                {[
                  { icon:"📊", title:"View Google Sheet", desc:"Open your KE Business Suite Google Sheet directly", link:"https://sheets.google.com", action:"Open Sheet" },
                  { icon:"⬇️", title:"Download as Excel", desc:"File → Download → Excel (.xlsx) from Google Sheets", link:"https://sheets.google.com", action:"Open Sheet" },
                  { icon:"📋", title:"Version History", desc:"File → Version History → See version history", link:"https://sheets.google.com", action:"Open Sheet" },
                  { icon:"🔗", title:"Share with CA", desc:"Share view-only link to specific sheets with your CA", link:"https://sheets.google.com", action:"Share" },
                ].map(b=>(
                  <div key={b.title} style={{ background:T.light, borderRadius:10, padding:"14px 16px", border:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:20, marginBottom:6 }}>{b.icon}</div>
                    <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{b.title}</div>
                    <div style={{ fontSize:11, color:T.slate, marginBottom:10 }}>{b.desc}</div>
                    <a href={b.link} target="_blank" rel="noreferrer" style={{ display:"inline-block", background:T.navy, color:T.white, borderRadius:8, padding:"5px 14px", fontSize:11, fontWeight:700, textDecoration:"none" }}>
                      {b.action} →
                    </a>
                  </div>
                ))}
              </div>

              <FSec label="App Version" />
              <div style={{ background:T.light, borderRadius:10, padding:"12px 16px", fontSize:12 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[
                    ["App Version","v5.0 — Full Suite"],
                    ["Architecture","React + Vite + Google Sheets + Apps Script"],
                    ["Monthly Cost","₹0 (completely free)"],
                    ["Modules","17 modules, 250+ form fields"],
                    ["Hosting","Vercel (free forever)"],
                    ["Database","Google Sheets (15GB free)"],
                    ["Alerts","Gmail via Apps Script (100/day free)"],
                    ["WhatsApp","wa.me click-to-chat (no API)"],
                  ].map(([l,v])=>(
                    <div key={l} style={{ display:"flex", gap:6 }}>
                      <span style={{ fontSize:11, color:T.slate, minWidth:120 }}>{l}:</span>
                      <span style={{ fontSize:11, fontWeight:600, color:T.dark }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      <Toast/>
    </div>
  );
}
