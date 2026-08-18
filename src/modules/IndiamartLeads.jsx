import { useState } from "react";
import { T, OPT } from "../shared/constants.js";
import { fmt, fmtD, today, isPast, validate, exportCSV, sheetsAPI, IS_DEMO, buildLeadRow, calcWinRate } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, FTxt, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, DetailGrid, SaveStatus, useToast, WA } from "../shared/ui.jsx";

const leadClr = s => s==="Won"?"green":s==="Lost"||s==="Not Interested"?"red":s==="Quoted"?"amber":s==="Contacted"?"blue":s==="Follow-up"?"amber":"default";
// Statuses that mean the deal is closed one way or the other — a follow-up
// date in the past no longer means anything once a lead has landed here, so
// the overdue-highlight in the table (see cols below) is suppressed for
// these, same reasoning as Invoices.jsx not flagging a Paid invoice's old
// due date red.
const CLOSED_STATUSES = ["Won","Lost","Not Interested"];

const BLANK = { dateReceived:today(),queryId:"",companyName:"",contactPerson:"",mobile:"",altMobile:"",whatsappOpted:"No",email:"",city:"",state:"Uttar Pradesh",productEnquired:"",requirementDetails:"",leadType:"Buy Lead",budget:0,priority:"Medium",status:"New",quotationRef:"",quotedValue:0,firstContactedAt:"",responseTimeHrs:"",followUpDate:"",wonDate:"",lostReason:"",competitorMentioned:"",assignedTo:"",remarks:"" };
const RULES = [
  { field:"companyName",      label:"Company Name",             required:true },
  { field:"contactPerson",    label:"Contact Person",           required:true },
  { field:"mobile",           label:"Mobile",                   required:true, pattern:"mobile" },
  { field:"altMobile",        label:"Alt Mobile",                pattern:"mobile" },
  { field:"email",            label:"Email",                     pattern:"email" },
  { field:"dateReceived",     label:"Date Received",            required:true },
  { field:"productEnquired",  label:"Product/Service Enquired", required:true },
];

export default function IndiamartLeads({ data=[], fy, user, onRefresh }) {
  const [modal,   setModal]   = useState(false);
  const [viewLd,  setViewLd]  = useState(null);
  const [form,    setForm]    = useState(BLANK);
  const [errors,  setErrors]  = useState({});
  const [saving,  setSaving]  = useState(false);
  const [status,  setStatus]  = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [del,     setDel]     = useState(null);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("All");
  const { show, Toast } = useToast();

  const hc = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };

  // Status is handled separately from hc() above: moving New → Contacted for
  // the first time auto-stamps First Contacted At and computes Response
  // Time (Hrs) — this is a COMPUTED field, never hand-typed (see Phase 4 of
  // indiamart-leads-prompt.md). "Date Received" is a date-only field (no
  // time-of-day captured), so the hours figure is measured from midnight of
  // that date to the moment Contacted is set — an approximation, not a
  // to-the-minute response SLA, but accurate enough to compare leads
  // against each other and spot slow follow-up.
  const hcStatus = e => {
    const newStatus = e.target.value;
    setForm(f => {
      if (newStatus === "Contacted" && f.status === "New" && !f.firstContactedAt) {
        const now = new Date();
        const receivedMs = f.dateReceived ? new Date(f.dateReceived).getTime() : now.getTime();
        const hrs = Math.max(0, Math.round(((now.getTime()-receivedMs)/36e5)*10)/10);
        return { ...f, status:newStatus, firstContactedAt:now.toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}), responseTimeHrs:hrs };
      }
      return { ...f, status:newStatus };
    });
    setErrors(er=>({...er,status:""}));
  };

  const fyData = data.filter(l=>l.fy===fy);
  const rows   = fyData.filter(l =>
    (filter==="All"||l.status===filter) &&
    [l.companyName,l.contactPerson||"",l.productEnquired||"",l.queryId||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  // leadId fetched at SAVE time, not open time — same stale-number lock
  // reasoning already documented in Invoices.jsx/Clients.jsx: holding a
  // "next" id in form state while the modal sits open risks two saves
  // colliding on the same id.
  const openAdd  = () => { setForm({...BLANK, dateReceived:today()}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    const leadId = editIdx!==null ? form.leadId : (form.leadId || await sheetsAPI.nextSerial("IndiaMART Leads","IM",fy));
    const row = buildLeadRow({...form, leadId}, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("IndiaMART Leads",form.rowIndex,row) : await sheetsAPI.append("IndiaMART Leads",row);
    const _saveFailed = !!res?.error;
    setStatus(_saveFailed?"error":res?.status==="demo"?"demo":"saved"); setSaving(false);
    if (_saveFailed) {
      // Do NOT close the modal or fire onRefresh on failure — form stays
      // open with the data intact so the person can retry without
      // retyping anything (same pattern as Invoices.jsx/Clients.jsx).
      show(`Save failed — ${res.error||"connection error"}. Your entry is still here — check your connection and try again.`,"red");
      return;
    }
    show(editIdx!==null?"Lead updated":"Lead saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleDelete = async ({r}) => {
    setDel(null);
    await sheetsAPI.softDelete("IndiaMART Leads",r.rowIndex);
    show("Lead deleted","green"); onRefresh&&onRefresh();
  };

  const cols = [
    {key:"leadId",  label:"Lead ID"},
    {key:"dateReceived",label:"Received", render:r=>fmtD(r.dateReceived), exportVal:r=>r.dateReceived||""},
    {key:"companyName",label:"Company",   bold:true, render:r=><button onClick={()=>setViewLd(r)} style={{background:"none",border:"none",cursor:"pointer",fontWeight:700,color:T.navy,textDecoration:"underline",fontSize:12,textAlign:"left"}}>{r.companyName}</button>},
    {key:"productEnquired",label:"Product Enquired"},
    {key:"status",  label:"Status",     render:r=><Badge label={r.status} color={leadClr(r.status)}/>},
    {key:"priority",label:"Priority",   render:r=><Badge label={r.priority} color={r.priority==="High"?"red":r.priority==="Medium"?"amber":"default"}/>},
    {key:"quotedValue",label:"Quoted Value",right:true,render:r=><span style={{fontWeight:700}}>{fmt(+r.quotedValue||0)}</span>, exportVal:r=>+r.quotedValue||0},
    {key:"followUpDate",label:"Follow-up",render:r=>{
      const overdue = isPast(r.followUpDate) && !CLOSED_STATUSES.includes(r.status);
      return <span style={{color:overdue?T.red:T.dark,fontWeight:overdue?700:400}}>{fmtD(r.followUpDate)}</span>;
    }, exportVal:r=>r.followUpDate||""},
    {key:"wa",      label:"WA",         render:r=><WA mobile={r.mobile} msg={`Dear ${r.contactPerson}, this is Keshav Sharma from Keshav Enterprises, Shamli. Following up on your enquiry for ${r.productEnquired}. — KE`}/>},
  ];

  const won  = fyData.filter(l=>l.status==="Won").length;
  const lost = fyData.filter(l=>l.status==="Lost").length;
  const winRate = calcWinRate(won,lost);
  const totalQuoted = fyData.reduce((s,l)=>s+(+l.quotedValue||0),0);

  return (
    <div>
      <SHdr title="🔎 IndiaMART Leads" action="+ New Lead" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("IndiaMART_Leads_"+fy,cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="🔎" label="Total Leads" value={fyData.length} color={T.navy}/>
        <KPI icon="✅" label="Won"         value={won}  color={T.green}/>
        <KPI icon="❌" label="Lost"        value={lost} color={T.red}/>
        <KPI icon="📊" label="Win Rate"    value={winRate} color={T.navy}/>
        <KPI icon="💰" label="Quoted Value" value={fmt(totalQuoted)} color={T.amber}/>
      </div>
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist leads to Google Sheets."/>}
      <Pills options={["All",...OPT.leadStatus].map(s=>({label:s,value:s,count:s==="All"?fyData.length:fyData.filter(l=>l.status===s).length}))} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search by company, contact, product, query ID..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No IndiaMART leads for FY ${fy}`}/>

      {del&&<ConfirmModal msg={`Delete lead from ${del.r.companyName}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      {viewLd&&(
        <Modal title={viewLd.companyName} subtitle={viewLd.leadId} onClose={()=>setViewLd(null)} wide>
          <DetailGrid fields={[["Lead ID",viewLd.leadId],["Query ID",viewLd.queryId||"—"],["Date Received",fmtD(viewLd.dateReceived)],["Contact",viewLd.contactPerson],["Mobile",viewLd.mobile],["Alt Mobile",viewLd.altMobile||"—"],["WhatsApp Opted",viewLd.whatsappOpted],["Email",viewLd.email||"—"],["City / State",`${viewLd.city||"—"} / ${viewLd.state||"—"}`],["Product/Service",viewLd.productEnquired],["Requirement Details",viewLd.requirementDetails||"—",2],["Lead Type",viewLd.leadType],["Budget Indicated",fmt(+viewLd.budget||0)],["Priority",viewLd.priority],["Status",viewLd.status],["Quotation Ref",viewLd.quotationRef||"—"],["Quoted Value",fmt(+viewLd.quotedValue||0)],["First Contacted At",viewLd.firstContactedAt||"—"],["Response Time (Hrs)",viewLd.responseTimeHrs||"—"],["Follow-up Date",fmtD(viewLd.followUpDate)],["Won Date",fmtD(viewLd.wonDate)],["Lost Reason",viewLd.lostReason||"—"],["Competitor Mentioned",viewLd.competitorMentioned||"—"],["Assigned To",viewLd.assignedTo||"—"],["Remarks",viewLd.remarks||"—",2]]}/>
          <div style={{display:"flex",gap:10}}><WA mobile={viewLd.mobile} msg={`Dear ${viewLd.contactPerson}, this is Keshav Sharma from Keshav Enterprises, Shamli.`} label="WhatsApp"/><a href={`tel:+91${viewLd.mobile}`} style={{background:T.navy,color:"#fff",borderRadius:6,padding:"4px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>📞 Call</a></div>
        </Modal>
      )}

      {modal&&(
        <Modal title={editIdx!==null?"Edit Lead":"New Lead"} onClose={()=>setModal(false)} full>
          <FSec label="Lead Details"/>
          <G3>
            <F label="IndiaMART Query ID" name="queryId"       value={form.queryId}       onChange={hc}/>
            <F label="Date Received *"    name="dateReceived"  type="date" value={form.dateReceived} onChange={hc} required error={errors.dateReceived}/>
            <F label="Company Name *"     name="companyName"   value={form.companyName}   onChange={hc} required error={errors.companyName}/>
          </G3>
          <G3>
            <F label="Contact Person *"   name="contactPerson" value={form.contactPerson} onChange={hc} required error={errors.contactPerson}/>
            <F label="Mobile *"           name="mobile"        value={form.mobile}        onChange={hc} type="tel" required error={errors.mobile}/>
            <F label="Alt Mobile"         name="altMobile"     value={form.altMobile}     onChange={hc} type="tel" error={errors.altMobile}/>
          </G3>
          <G3>
            <F label="WhatsApp Opted"     name="whatsappOpted" value={form.whatsappOpted} onChange={hc} options={["Yes","No"]}/>
            <F label="Email"              name="email"         value={form.email}         onChange={hc} type="email" error={errors.email}/>
            <F label="City"               name="city"          value={form.city}          onChange={hc}/>
          </G3>
          <F label="State" name="state" value={form.state} onChange={hc} options={OPT.states}/>

          <FSec label="Enquiry"/>
          <F label="Product/Service Enquired *" name="productEnquired" value={form.productEnquired} onChange={hc} required error={errors.productEnquired}/>
          <FTxt label="Requirement Details" name="requirementDetails" value={form.requirementDetails} onChange={hc}/>
          <G3>
            <F label="Lead Type"   name="leadType" value={form.leadType} onChange={hc} options={OPT.leadTypes}/>
            <F label="Budget Indicated (₹)" name="budget" type="number" value={form.budget} onChange={hc}/>
            <F label="Priority"    name="priority" value={form.priority} onChange={hc} options={OPT.priorities}/>
          </G3>

          <FSec label="Pipeline"/>
          <G3>
            <F label="Status"        name="status"        value={form.status} onChange={hcStatus} options={OPT.leadStatus}/>
            <F label="Quotation Ref" name="quotationRef"  value={form.quotationRef} onChange={hc}/>
            <F label="Quoted Value (₹)" name="quotedValue" type="number" value={form.quotedValue} onChange={hc}/>
          </G3>
          <G3>
            <F label="First Contacted At" name="firstContactedAt" value={form.firstContactedAt} onChange={hc} readOnly hint="Auto-filled the first time Status moves to Contacted"/>
            <F label="Response Time (Hrs)" name="responseTimeHrs" value={form.responseTimeHrs} onChange={hc} readOnly hint="Computed automatically, not typed"/>
            <F label="Follow-up Date"     name="followUpDate"     type="date" value={form.followUpDate} onChange={hc}/>
          </G3>
          <G3>
            <F label="Won Date"    name="wonDate"    type="date" value={form.wonDate}    onChange={hc}/>
            <F label="Lost Reason" name="lostReason" value={form.lostReason} onChange={hc}/>
            <F label="Competitor Mentioned" name="competitorMentioned" value={form.competitorMentioned} onChange={hc}/>
          </G3>

          <FSec label="Assignment"/>
          <G2>
            <F label="Assigned To" name="assignedTo" value={form.assignedTo} onChange={hc}/>
            <F label="Remarks"     name="remarks"     value={form.remarks}     onChange={hc}/>
          </G2>
          <SaveStatus status={status}/>
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
