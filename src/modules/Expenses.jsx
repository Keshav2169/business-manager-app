import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildExpenseRow } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, SaveStatus, useToast } from "../shared/ui.jsx";

const BLANK = { date:today(),category:"",subCategory:"",description:"",vendor:"",mode:"Cash",amount:0,gst:0,gstType:"CGST+SGST",billNo:"",approvedBy:"Keshav Sharma",jobRef:"",remarks:"" };
const RULES = [{ field:"date",label:"Date",required:true },{ field:"category",label:"Category",required:true },{ field:"amount",label:"Amount",required:true,min:1 },{ field:"description",label:"Description",required:true }];
const CATS  = ["Labour","Travel","Material","Office","Utilities","Maintenance","Communication","Professional","Fuel","Freight","Miscellaneous"];
const SUBCATS = { Labour:["Site Wages","Contract Labour"], Travel:["Diesel","Petrol","Lodging","Meals","Toll"], Material:["Bearings","Seals","Lubricants","Gaskets"], Office:["Stationery","Printing","Courier"], Utilities:["Electricity","Mobile","Internet"], Professional:["CA Fees","Legal","Consulting"], Maintenance:["AMC","Repair","Calibration"] };

export default function Expenses({ data=[], fy, user, onRefresh, jobs=[] }) {
  const [modal,  setModal]  = useState(false);
  const [form,   setForm]   = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [editIdx,setEditIdx]= useState(null);
  const [del,    setDel]    = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,  setDateTo]  =useState("");
  const { show, Toast } = useToast();

  const hc = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };

  const fyData = data.filter(e=>e.fy===fy);
  const rows   = fyData.filter(e =>
    (filter==="All"||e.category===filter) &&
    (!dateFrom || (e.date||"")>=dateFrom) &&
    (!dateTo   || (e.date||"")<=dateTo) &&
    [e.description||"",e.vendor||"",e.category||"",e.jobRef||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  // voucher fetched at SAVE time — see nextSerial's server-side lock in
  // apps-script-backend.js (same fix applied to Invoices/POs/Quotations/
  // Ledger/Vendors/Clients earlier).
  const openAdd  = () => {
    setForm({...BLANK,date:today()}); setErrors({}); setEditIdx(null); setModal(true);
  };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs=validate(form,RULES); if(Object.keys(errs).length){setErrors(errs);return;}
    setSaving(true); setStatus("saving");
    const voucherNo = editIdx!==null ? form.voucherNo : (form.voucherNo || await sheetsAPI.nextSerial("Expenses","EXP",fy));
    const row=buildExpenseRow({...form, voucherNo},fy,user);
    const res=editIdx!==null?await sheetsAPI.update("Expenses",form.rowIndex,row):await sheetsAPI.append("Expenses",row);
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
    show(editIdx!==null?"Expense updated":"Expense saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };
  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("Expenses",r.rowIndex); show("Expense deleted","green"); onRefresh&&onRefresh(); };

  const total    = rows.reduce((s,e)=>s+(+(e.amount||e["Amount (Rs)"]||0)),0);
  const totalGST = rows.reduce((s,e)=>s+(+(e.gst||e["GST (Rs)"]||0)),0);

  const cols = [
    {key:"date",       label:"Date",      render:r=>fmtD(r.date), exportVal:r=>r.date},
    {key:"voucherNo",  label:"Voucher",   render:r=>r.voucherNo||r["Voucher No."]||"—"},
    {key:"category",   label:"Category",  render:r=><Badge label={r.category} color="default"/>},
    {key:"subCategory",label:"Sub-Cat",   render:r=>r.subCategory||r["Sub-Category"]||"—"},
    {key:"description",label:"Description",bold:true},
    {key:"vendor",     label:"Vendor",    render:r=>r.vendor||r["Vendor / Paid To"]||"—"},
    {key:"mode",       label:"Mode",      render:r=>r.mode||r["Payment Mode"]||"—"},
    {key:"billNo",     label:"Bill No.",  render:r=>r.billNo||r["Bill No."]||"—"},
    {key:"amount",     label:"Amount",    right:true, render:r=>fmt(+(r.amount||r["Amount (Rs)"]||0)), exportVal:r=>+(r.amount||0)},
    {key:"gst",        label:"GST",       right:true, render:r=>r.gst&&+r.gst>0?fmt(+(r.gst)):"-"},
    {key:"total",      label:"Total",     right:true, render:r=><span style={{fontWeight:700}}>{fmt((+(r.amount||0))+(+(r.gst||0)))}</span>},
    {key:"jobRef",     label:"Job"},
    {key:"approvedBy", label:"Approved By",render:r=>r.approvedBy||r["Approved By"]||"—"},
  ];

  return (
    <div>
      <SHdr title="💸 Expense Tracker" action="+ Log Expense" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Expenses_"+fy,cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="💸" label="Total Expenses" value={fmt(total)}    color={T.red}/>
        <KPI icon="🧾" label="GST (ITC)"      value={fmt(totalGST)} color={T.amber}/>
        <KPI icon="🔢" label="Entries"         value={rows.length}   color={T.navy}/>
      </div>
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist to Sheets."/>}
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
        <Pills options={[{label:"All",value:"All",count:fyData.length},...CATS.map(c=>({label:c,value:c,count:fyData.filter(e=>e.category===c).length}))]} active={filter} onChange={setFilter}/>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{padding:"5px 9px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:12,outline:"none"}}/>
        <span style={{fontSize:11,color:T.slate}}>to</span>
        <input type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   style={{padding:"5px 9px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:12,outline:"none"}}/>
      </div>
      <Search value={search} onChange={setSearch} placeholder="Search description, vendor, category, job..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No expenses for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete expense: ${del.r.description}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}
      {modal&&(
        <Modal title={editIdx!==null?"Edit Expense":"Log Expense"} onClose={()=>setModal(false)} full>
          <G3>
            <F label="Date *"      name="date"     type="date" value={form.date}     onChange={hc} required error={errors.date}/>
            <F label="Category *"  name="category" value={form.category} onChange={hc} options={CATS} required error={errors.category}/>
            <F label="Sub-Category" name="subCategory" value={form.subCategory} onChange={hc} options={form.category&&SUBCATS[form.category]?SUBCATS[form.category]:[]}/>
          </G3>
          <F label="Description *" name="description" value={form.description} onChange={hc} required error={errors.description}/>
          <G2>
            <F label="Vendor / Paid To" name="vendor" value={form.vendor} onChange={hc}/>
            <F label="Payment Mode"     name="mode"   value={form.mode}   onChange={hc} options={["Cash","NEFT","RTGS","Cheque","UPI","Online"]}/>
          </G2>
          <G4>
            <F label="Amount (₹) *" name="amount"  type="number" value={form.amount}  onChange={hc} required error={errors.amount}/>
            <F label="GST (₹)"      name="gst"     type="number" value={form.gst}     onChange={hc}/>
            <F label="GST Type"     name="gstType" value={form.gstType}    onChange={hc} options={["CGST+SGST","IGST","Exempt","Nil"]}/>
            <F label="Bill No."     name="billNo"  value={form.billNo}     onChange={hc}/>
          </G4>
          <G2>
            <F label="Job Reference" name="jobRef"     value={form.jobRef}     onChange={hc} options={["",  ...jobs.map(j=>j.id||j["Job ID"]||"")].filter(Boolean)}/>
            <F label="Approved By"   name="approvedBy" value={form.approvedBy} onChange={hc} options={["Keshav Sharma","Staff (self)"]}/>
          </G2>
          <F label="Remarks" name="remarks" value={form.remarks} onChange={hc}/>
          <SaveStatus status={status}/>
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
