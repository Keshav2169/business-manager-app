import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, isPast, validate, exportCSV, sheetsAPI, IS_DEMO, buildLedgerRow } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, SaveStatus, useToast } from "../shared/ui.jsx";

const BLANK = { date:today(),party:"",type:"Receipt",narration:"",invoiceRef:"",chequeUtr:"",bankName:"",debit:0,credit:0,tds:0,gst:0,dueDate:"",remarks:"" };
const RULES = [{ field:"date",label:"Date",required:true },{ field:"party",label:"Party Name",required:true },{ field:"type",label:"Type",required:true },{ field:"narration",label:"Narration",required:true }];
const TYPES = ["Receipt","Sales Invoice","Purchase","Expense","Journal","Credit Note","Debit Note","Bank Transfer","Contra"];

export default function Ledger({ data=[], fy, user, onRefresh }) {
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

  // FY filter applied here
  const fyData = data.filter(r => r.fy===fy || r["FY"]===fy);
  const rows   = fyData.filter(r =>
    (filter==="All"||(r.type||r["Transaction Type"]||"")=== filter) &&
    [r.party||r["Party Name"]||"", r.narration||r["Narration"]||"", r.invoiceRef||r["Invoice Ref."]||"", r.chequeUtr||r["Cheque / UTR No."]||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  // Running balance from opening balance in Sheets; fallback to 0
  let runBal = 0;

  // voucherNo fetched at SAVE time — see nextSerial's server-side lock.
  const openAdd  = () => { setForm({...BLANK}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs=validate(form,RULES); if(Object.keys(errs).length){setErrors(errs);return;}
    setSaving(true); setStatus("saving");
    const voucherNo = editIdx!==null ? form.voucherNo : (form.voucherNo || await sheetsAPI.nextSerial("Ledger","LGR",fy));
    const row=buildLedgerRow({...form, voucherNo},fy,user);
    const res=editIdx!==null?await sheetsAPI.update("Ledger",form.rowIndex,row):await sheetsAPI.append("Ledger",row);
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
    show(editIdx!==null?"Entry updated":"Entry saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };
  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("Ledger",r.rowIndex); show("Entry deleted","green"); onRefresh&&onRefresh(); };

  const totalDebit  = fyData.reduce((s,r)=>s+(+(r.debit||r["Debit (Rs)"]||0)),0);
  const totalCredit = fyData.reduce((s,r)=>s+(+(r.credit||r["Credit (Rs)"]||0)),0);

  const tClr = t => t==="Receipt"||t==="Sales Invoice"?"green":t==="Purchase"||t==="Expense"?"red":"default";
  const cols = [
    {key:"date",      label:"Date",       render:r=>fmtD(r.date||r["Date"]),                                                  exportVal:r=>r.date||""},
    {key:"voucher",   label:"Voucher",    render:r=>r.voucherNo||r["Voucher No."]||"—"},
    {key:"party",     label:"Party",      bold:true, render:r=>r.party||r["Party Name"]||"—"},
    {key:"type",      label:"Type",       render:r=><Badge label={r.type||r["Transaction Type"]||"—"} color={tClr(r.type||r["Transaction Type"])}/>},
    {key:"narration", label:"Narration",  render:r=>r.narration||r["Narration"]||"—"},
    {key:"invoiceRef",label:"Ref.",       render:r=>r.invoiceRef||r["Invoice Ref."]||"—"},
    {key:"chequeUtr", label:"UTR/Cheque", render:r=>r.chequeUtr||r["Cheque / UTR No."]||"—"},
    {key:"debit",     label:"Debit (₹)",  right:true, render:r=>{ const v=+(r.debit||r["Debit (Rs)"]||0); return v?<span style={{color:T.red,fontWeight:700}}>{fmt(v)}</span>:"—"; }, exportVal:r=>+(r.debit||0)},
    {key:"credit",    label:"Credit (₹)", right:true, render:r=>{ const v=+(r.credit||r["Credit (Rs)"]||0); return v?<span style={{color:T.green,fontWeight:700}}>{fmt(v)}</span>:"—"; }, exportVal:r=>+(r.credit||0)},
    {key:"tds",       label:"TDS",        right:true, render:r=>{ const v=+(r.tds||r["TDS (Rs)"]||0); return v?fmt(v):"—"; }},
    {key:"dueDate",   label:"Due",        render:r=>{ const d=r.dueDate||r["Due Date"]; return d?<span style={{color:isPast(d)&&+(r.debit||0)>0?T.red:T.dark}}>{fmtD(d)}</span>:"—"; }, exportVal:r=>r.dueDate||""},
    {key:"balance",   label:"Balance",    right:true, render:r=>{ runBal+=(+(r.credit||r["Credit (Rs)"]||0))-(+(r.debit||r["Debit (Rs)"]||0)); return <span style={{fontWeight:800,color:runBal>=0?T.navy:T.red,fontFamily:"monospace"}}>{fmt(Math.abs(runBal))}{runBal<0?" Dr":""}</span>; }},
  ];

  return (
    <div>
      <SHdr title="📒 Accounts Ledger" action="+ Add Entry" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Ledger_"+fy,cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="📥" label="Total Credits" value={fmt(totalCredit)} color={T.green}/>
        <KPI icon="📤" label="Total Debits"  value={fmt(totalDebit)}  color={T.red}/>
        <KPI icon="📊" label="Net Balance"   value={fmt(Math.abs(totalCredit-totalDebit))} color={totalCredit>=totalDebit?T.navy:T.red} sub={totalCredit>=totalDebit?"Cr":"Dr"}/>
        <KPI icon="🔢" label="Entries (FY)"  value={fyData.length}   color={T.navy}/>
      </div>
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — ledger filtered by FY. Set VITE_API_URL to persist."/>}
      <Pills options={["All",...TYPES].map(t=>({label:t,value:t,count:t==="All"?fyData.length:fyData.filter(r=>(r.type||r["Transaction Type"]||"")===t).length}))} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search party, narration, invoice ref, UTR..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No ledger entries for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete entry: ${del.r.narration||del.r["Narration"]}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}
      {modal&&(
        <Modal title={editIdx!==null?"Edit Entry":"Add Ledger Entry"} onClose={()=>setModal(false)} full>
          <G3>
            <F label="Date *"       name="date"    type="date" value={form.date}    onChange={hc} required error={errors.date}/>
            <F label="Type *"       name="type"    value={form.type}    onChange={hc} options={TYPES} required error={errors.type}/>
            <F label="Party Name *" name="party"   value={form.party}   onChange={hc} required error={errors.party}/>
          </G3>
          <G2>
            <F label="Narration *"  name="narration"  value={form.narration}  onChange={hc} required error={errors.narration}/>
            <F label="Invoice / Bill Ref." name="invoiceRef" value={form.invoiceRef} onChange={hc}/>
          </G2>
          <G4>
            <F label="Debit (₹)"    name="debit"   type="number" value={form.debit}   onChange={hc}/>
            <F label="Credit (₹)"   name="credit"  type="number" value={form.credit}  onChange={hc}/>
            <F label="TDS (₹)"      name="tds"     type="number" value={form.tds}     onChange={hc}/>
            <F label="GST (₹)"      name="gst"     type="number" value={form.gst}     onChange={hc}/>
          </G4>
          <G3>
            <F label="Cheque / UTR" name="chequeUtr" value={form.chequeUtr} onChange={hc}/>
            <F label="Bank Name"    name="bankName"  value={form.bankName}  onChange={hc} options={["","State Bank of India","HDFC Bank","ICICI Bank","Punjab National Bank","Axis Bank"]}/>
            <F label="Due Date"     name="dueDate"   type="date" value={form.dueDate} onChange={hc}/>
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
