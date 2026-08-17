import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, isPast, validate, exportCSV, sheetsAPI, IS_DEMO, buildQuotationRow, waLink } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, FTxt, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, SaveStatus, useToast, WA } from "../shared/ui.jsx";

const statusClr = s => s==="Accepted"?"green":s==="Rejected"?"red":s==="Negotiating"?"amber":"default";
const BLANK = { client:"",subject:"",date:today(),validTill:"",followUp:"",value:0,gstPct:18,discountPct:0,paymentTerms:"30 days",deliveryTerms:"At site",scopeNotes:"",preparedBy:"Keshav Sharma",revision:"R0",status:"Draft",remarks:"" };
const RULES = [{ field:"client",label:"Client",required:true },{ field:"subject",label:"Subject",required:true },{ field:"value",label:"Value",required:true,min:1 }];

export default function Quotations({ data=[], fy, user, onRefresh, clients=[] }) {
  const [modal,  setModal]  = useState(false);
  const [form,   setForm]   = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [editIdx,setEditIdx]= useState(null);
  const [del,    setDel]    = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const { show, Toast } = useToast();

  const hc = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };

  const fyData = data.filter(q=>q.fy===fy);
  const rows   = fyData.filter(q =>
    (filter==="All"||(q.status||"")=== filter) &&
    [q.client||"",q.subject||"",q.id||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  // id is fetched at SAVE time (see nextSerial's server-side lock) so a
  // quotation left open in the background can't collide with one saved
  // elsewhere in the meantime.
  const openAdd  = () => { setForm({...BLANK}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs=validate(form,RULES); if(Object.keys(errs).length){setErrors(errs);return;}
    setSaving(true); setStatus("saving");
    const id = editIdx!==null ? form.id : (form.id || await sheetsAPI.nextSerial("Quotations","QT",fy));
    const row=buildQuotationRow({...form, id},fy,user);
    const res=editIdx!==null?await sheetsAPI.update("Quotations",form.rowIndex,row):await sheetsAPI.append("Quotations",row);
    const _saveFailed = !!res?.error;
    setStatus(_saveFailed?"error":res?.status==="demo"?"demo":"saved"); setSaving(false);
    if (_saveFailed) {
      // Do NOT close the modal or fire onRefresh on failure — the previous
      // version of this always showed a green success toast and auto-closed
      // the form regardless of the API result, silently discarding the
      // person's entry on any dropped connection or backend error. Now the
      // form stays open with the data intact so they can retry without
      // retyping anything.
      show(`Save failed — ${res.error||"connection error"}. Your entry is still here — check your connection and try again.`,"red");
      return;
    }
    show(editIdx!==null?"Quote updated":"Quote saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };
  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("Quotations",r.rowIndex); show("Quote deleted","green"); onRefresh&&onRefresh(); };

  const accepted = fyData.filter(q=>q.status==="Accepted");
  const pipeline = fyData.filter(q=>["Pending","Sent","Negotiating","Draft"].includes(q.status));
  const convPct  = fyData.length?Math.round(accepted.length/fyData.length*100):0;

  const cols = [
    {key:"id",       label:"Quote No.",  bold:true},
    {key:"client",   label:"Client",     bold:true},
    {key:"subject",  label:"Subject"},
    {key:"date",     label:"Date",       render:r=>fmtD(r.date),            exportVal:r=>r.date||""},
    {key:"value",    label:"Ex-GST",     right:true, render:r=>fmt(+(r.value||r["Value Ex-GST (Rs)"]||0)), exportVal:r=>+(r.value||0)},
    {key:"withGST",  label:"With GST",   right:true, render:r=><span style={{fontWeight:800,color:T.navy}}>{fmt(Math.round((+(r.value||0))*(1+(+(r.gstPct||r["GST Rate %"]||18))/100)))}</span>},
    {key:"discountPct",label:"Disc%",    right:true, render:r=>r.discountPct?r.discountPct+"%":"—"},
    {key:"paymentTerms",label:"Pay Terms"},
    {key:"status",   label:"Status",     render:r=><Badge label={r.status||"Draft"} color={statusClr(r.status)}/>},
    {key:"validTill",label:"Valid Till",  render:r=><span style={{color:isPast(r.validTill||r["Valid Till"])?T.red:T.dark}}>{fmtD(r.validTill||r["Valid Till"])}</span>, exportVal:r=>r.validTill||""},
    {key:"followUp", label:"Follow-up",   render:r=><span style={{color:isPast(r.followUp||r["Follow-up Date"])?T.red:T.dark,fontWeight:isPast(r.followUp||r["Follow-up Date"])?700:400}}>{fmtD(r.followUp||r["Follow-up Date"])}</span>, exportVal:r=>r.followUp||""},
    {key:"wa",       label:"WA",          render:r=>{ const cl=clients.find(c=>c.name===r.client); return cl?<WA mobile={cl.whatsapp||cl.mobile} msg={`Dear ${cl.contact}, following up on Quotation ${r.id} for "${r.subject}" (Value: ${fmt(+(r.value||0))} + GST). Request your acceptance. — Keshav Enterprises`}/>:"—"; }},
  ];

  return (
    <div>
      <SHdr title="📋 Quotation Tracker" action="+ New Quotation" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Quotations_"+fy,cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="📋" label="Total Quotes"    value={fyData.length}  color={T.navy}/>
        <KPI icon="✅" label="Accepted Value"  value={fmt(accepted.reduce((s,q)=>s+(+(q.value||0)),0))} color={T.green}/>
        <KPI icon="⏳" label="Pipeline Value"  value={fmt(pipeline.reduce((s,q)=>s+(+(q.value||0)),0))} color={T.amber}/>
        <KPI icon="%" label="Conversion Rate"  value={convPct+"%"}    color={T.gold} sub={`${accepted.length} of ${fyData.length} accepted`}/>
      </div>
      {fyData.filter(q=>isPast(q.followUp||q["Follow-up Date"])&&["Sent","Pending","Negotiating"].includes(q.status)).length>0&&(
        <Alert type="amber" icon="📋" msg={`${fyData.filter(q=>isPast(q.followUp||q["Follow-up Date"])&&["Sent","Pending","Negotiating"].includes(q.status)).length} quotation follow-ups overdue!`}/>
      )}
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist."/>}
      <Pills options={["All","Draft","Sent","Pending","Negotiating","Accepted","Rejected"].map(s=>({label:s,value:s,count:s==="All"?fyData.length:fyData.filter(q=>q.status===s).length}))} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search client, subject, quote no..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No quotations for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete quote ${del.r.id} for ${del.r.client}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}
      {modal&&(
        <Modal title={editIdx!==null?"Edit Quotation":"New Quotation"} subtitle={form.id} onClose={()=>setModal(false)} full>
          <G3>
            <F label="Client *"   name="client"  value={form.client}  onChange={hc} options={clients.map(c=>c.name)} required error={errors.client}/>
            <F label="Subject *"  name="subject" value={form.subject} onChange={hc} required error={errors.subject}/>
            <F label="Status"     name="status"  value={form.status}  onChange={hc} options={["Draft","Sent","Pending","Negotiating","Accepted","Rejected"]}/>
          </G3>
          <G4>
            <F label="Quote Date" name="date"      type="date" value={form.date}      onChange={hc}/>
            <F label="Valid Till" name="validTill" type="date" value={form.validTill} onChange={hc}/>
            <F label="Follow-up"  name="followUp"  type="date" value={form.followUp}  onChange={hc}/>
            <F label="Revision"   name="revision"  value={form.revision}  onChange={hc} options={["R0","R1","R2","R3"]}/>
          </G4>
          <FTxt label="Scope of Work Notes" name="scopeNotes" value={form.scopeNotes} onChange={hc}/>
          <FSec label="Pricing"/>
          <G4>
            <F label="Value ex-GST (₹) *" name="value"       type="number" value={form.value}       onChange={hc} required error={errors.value}/>
            <F label="GST Rate %"          name="gstPct"      type="number" value={form.gstPct}      onChange={hc}/>
            <F label="Discount %"          name="discountPct" type="number" value={form.discountPct} onChange={hc}/>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:T.navy,marginBottom:4}}>Total with GST</label>
              <div style={{padding:"8px 10px",borderRadius:8,background:T.navy,fontSize:15,fontWeight:800,color:T.gold,fontFamily:"monospace"}}>{fmt(Math.round((+(form.value||0))*(1+(+(form.gstPct||18))/100)))}</div>
            </div>
          </G4>
          <FSec label="Terms"/>
          <G3>
            <F label="Payment Terms"  name="paymentTerms"  value={form.paymentTerms}  onChange={hc} options={["Advance","50% Adv + 50% completion","30 days","45 days","60 days"]}/>
            <F label="Delivery Terms" name="deliveryTerms" value={form.deliveryTerms} onChange={hc} options={["At client site","Ex-works Shamli","As per PO"]}/>
            <F label="Prepared By"    name="preparedBy"    value={form.preparedBy}    onChange={hc} options={["Keshav Sharma","Staff"]}/>
          </G3>
          <F label="Remarks" name="remarks" value={form.remarks} onChange={hc}/>
          <SaveStatus status={status}/>
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
