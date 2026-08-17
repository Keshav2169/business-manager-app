import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, isPast, validate, exportCSV, sheetsAPI, IS_DEMO, buildInvoiceRow, calcInvoice } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, FTxt, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, CalcStrip, AmtTable, DetailGrid, SaveStatus, useToast } from "../shared/ui.jsx";

const invClr = s => s==="Paid"?"green":s==="Partial Paid"?"amber":s==="Unpaid"?"red":"default";
const BLANK  = { invoiceNo:"",date:today(),client:"",jobRef:"",poNo:"",poDate:"",description:"",scopeDetails:"",labourCharges:0,materialCharges:0,travelCharges:0,otherCharges:0,discount:0,gstType:"IGST",gstPct:18,tdsApplicable:"Yes",tdsRate:1,paymentTerms:"30 days",dueDate:"",bankName:"State Bank of India",accountNo:"",ifsc:"",placeOfSupply:"",status:"Unpaid",amountReceived:0,remarks:"",ewayBillNo:"",vehicleNo:"" };
const RULES  = [{ field:"client",label:"Client",required:true },{ field:"date",label:"Date",required:true },{ field:"description",label:"Description",required:true },{ field:"invoiceNo",label:"Invoice No.",required:true }];

export default function Invoices({ data=[], fy, user, onRefresh, clients=[], jobs=[] }) {
  const [modal,   setModal]   = useState(false);
  const [viewInv, setViewInv] = useState(null);
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
  const calc = calcInvoice(form);

  const fyData = data.filter(i=>i.fy===fy);
  const rows   = fyData.filter(i =>
    (filter==="All"||i.status===filter) &&
    [i.client,i.invoiceNo||"",i.jobRef||"",i.description||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  // Invoice numbers are NOT fetched here anymore. Fetching at open-time and
  // holding it in form state let a number go stale if the modal sat open for
  // even a minute while another invoice was created — two people (or one
  // person, two tabs) could end up saving the same "next" number, which is a
  // real GST compliance problem, not a cosmetic clash. The number is now
  // requested in handleSave, immediately before the write.
  const openAdd  = () => {
    setForm({...BLANK, invoiceNo:"", date:today()});
    setErrors({}); setEditIdx(null); setModal(true);
  };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES.filter(r=>r.field!=="invoiceNo"));
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    const invoiceNo = editIdx!==null ? form.invoiceNo : (form.invoiceNo || await sheetsAPI.nextSerial("Sales Invoices","INV",fy));
    const row = buildInvoiceRow({...form, invoiceNo}, calc, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("Sales Invoices",form.rowIndex,row) : await sheetsAPI.append("Sales Invoices",row);
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
    show(editIdx!==null?"Invoice updated":"Invoice saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleDelete = async ({r}) => {
    setDel(null);
    await sheetsAPI.softDelete("Sales Invoices",r.rowIndex);
    show("Invoice deleted","green"); onRefresh&&onRefresh();
  };

  const cols = [
    {key:"invoiceNo",    label:"Invoice No.",bold:true},
    {key:"date",         label:"Date",       render:r=>fmtD(r.date),               exportVal:r=>r.date},
    {key:"client",       label:"Client",     bold:true},
    {key:"jobRef",       label:"Job Ref."},
    {key:"description",  label:"Description"},
    {key:"grandTotal",   label:"Grand Total",right:true,render:r=><span style={{fontWeight:800,color:T.navy}}>{fmt(r.grandTotal||r["Grand Total (Rs)"]||0)}</span>, exportVal:r=>r.grandTotal||0},
    {key:"totalGST",     label:"GST",        right:true,render:r=>fmt(r.totalGST||r["Total GST (Rs)"]||0),    exportVal:r=>r.totalGST||0},
    {key:"netPayable",   label:"Net Payable",right:true,render:r=>fmt(r.netPayable||r["Net Payable (Rs)"]||0), exportVal:r=>r.netPayable||0},
    {key:"amountReceived",label:"Received",  right:true,render:r=><span style={{color:T.green,fontWeight:700}}>{fmt(r.amountReceived||r["Amount Received (Rs)"]||0)}</span>, exportVal:r=>r.amountReceived||0},
    {key:"balance",      label:"Balance",    right:true,render:r=>{ const bal=(r.grandTotal||0)-(r.amountReceived||0); return <span style={{color:bal>0?T.red:T.green,fontWeight:800}}>{fmt(bal)}</span>; }, exportVal:r=>(r.grandTotal||0)-(r.amountReceived||0)},
    {key:"dueDate",      label:"Due Date",   render:r=><span style={{color:isPast(r.dueDate)&&(r.grandTotal||0)>(r.amountReceived||0)?T.red:T.dark}}>{fmtD(r.dueDate)}</span>, exportVal:r=>r.dueDate},
    {key:"status",       label:"Status",     render:r=><Badge label={r.status||r["Payment Status"]||"Unpaid"} color={invClr(r.status||r["Payment Status"])}/>},
    {key:"view",         label:"View",       render:r=><button onClick={e=>{e.stopPropagation();setViewInv(r);}} style={{background:T.navy,color:"#fff",border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>View</button>},
  ];

  const totalRev  = fyData.reduce((s,i)=>s+(+(i.grandTotal||i["Grand Total (Rs)"])||0),0);
  const totalRec  = fyData.reduce((s,i)=>s+(+(i.amountReceived||i["Amount Received (Rs)"])||0),0);
  const totalBal  = totalRev - totalRec;

  return (
    <div>
      <SHdr title="📄 Sales Invoice Register" action="+ New Invoice" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Invoices_"+fy,cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="📄" label="Total Invoiced" value={fmt(totalRev)} color={T.navy}/>
        <KPI icon="✅" label="Received"        value={fmt(totalRec)} color={T.green}/>
        <KPI icon="⏳" label="Balance Due"    value={fmt(totalBal)} color={T.red}/>
        <KPI icon="🔢" label="Invoices"       value={fyData.length} color={T.navy}/>
      </div>
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist invoices to Google Sheets."/>}
      <Pills options={["All","Unpaid","Partial Paid","Paid"].map(s=>({label:s,value:s,count:s==="All"?fyData.length:fyData.filter(i=>(i.status||i["Payment Status"]||"Unpaid")===s).length}))} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search invoice no., client, job, description..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No invoices for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete invoice ${del.r.invoiceNo}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      {viewInv&&(
        <Modal title={`Invoice — ${viewInv.invoiceNo}`} onClose={()=>setViewInv(null)} wide>
          <div style={{background:T.navy,borderRadius:10,padding:"14px 18px",marginBottom:14,display:"flex",justifyContent:"space-between"}}>
            <div><div style={{color:T.gold,fontWeight:900,fontSize:15}}>KESHAV ENTERPRISES</div><div style={{color:"rgba(255,255,255,.7)",fontSize:11}}>Shamli, UP · MSME · IEC Registered</div></div>
            <div style={{textAlign:"right"}}><div style={{color:T.gold,fontWeight:800}}>{viewInv.invoiceNo}</div><div style={{color:"rgba(255,255,255,.7)",fontSize:11}}>Date: {fmtD(viewInv.date)} · Due: {fmtD(viewInv.dueDate)}</div></div>
          </div>
          <DetailGrid fields={[["Client",viewInv.client],["Job Ref.",viewInv.jobRef||"—"],["PO No.",viewInv.poNo||"—"],["Description",viewInv.description],["Scope",viewInv.scopeDetails||"—",2],["Eway Bill No.",viewInv.ewayBillNo||"—"],["Vehicle No.",viewInv.vehicleNo||"—"]]}/>
          <AmtTable rows={[["Labour",+(viewInv.labourCharges||0)],["Material",+(viewInv.materialCharges||0)],["Travel",+(viewInv.travelCharges||0)],["Other",+(viewInv.otherCharges||0)],viewInv.discount?["Discount",-(+(viewInv.discount||0))]:null,["Taxable Amount",+(viewInv.taxableAmount||viewInv["Taxable Amount (Rs)"]||0)],viewInv.igst>0?["IGST",+(viewInv.igst||0)]:null,viewInv.cgst>0?["CGST",+(viewInv.cgst||0)]:null,viewInv.sgst>0?["SGST",+(viewInv.sgst||0)]:null,viewInv.tdsAmt>0?["TDS Deducted",-(+(viewInv.tdsAmt||0))]:null,["NET PAYABLE",+(viewInv.netPayable||viewInv["Net Payable (Rs)"]||0)]]}/>
          <div style={{display:"flex",gap:8,alignItems:"center"}}><Badge label={viewInv.status||"Unpaid"} color={invClr(viewInv.status)}/><span style={{fontSize:12,color:T.slate}}>Received: {fmt(viewInv.amountReceived||0)} · Balance: {fmt((viewInv.grandTotal||0)-(viewInv.amountReceived||0))}</span></div>
        </Modal>
      )}

      {modal&&(
        <Modal title={editIdx!==null?"Edit Invoice":"New Invoice"} subtitle={form.invoiceNo} onClose={()=>setModal(false)} full>
          <FSec label="Invoice Details"/>
          <G3>
            <F label="Invoice No." name="invoiceNo" value={form.invoiceNo} onChange={hc}
               placeholder={editIdx===null?"Assigned automatically on save":""} readOnly={editIdx===null}/>
            <F label="Date *"        name="date"      type="date" value={form.date}      onChange={hc} required error={errors.date}/>
            <F label="Client *"      name="client"    value={form.client}    onChange={hc} options={clients.map(c=>c.name)} required error={errors.client}/>
          </G3>
          <G3>
            <F label="Job Ref."      name="jobRef"    value={form.jobRef}    onChange={hc} options={["",  ...jobs.map(j=>j.id||j["Job ID"]||"")].filter(Boolean)}/>
            <F label="Client PO No." name="poNo"      value={form.poNo}      onChange={hc}/>
            <F label="PO Date"       name="poDate"    type="date" value={form.poDate}    onChange={hc}/>
          </G3>
          <F label="Description *" name="description" value={form.description} onChange={hc} required error={errors.description}/>
          <FTxt label="Scope of Work" name="scopeDetails" value={form.scopeDetails} onChange={hc}/>
          <FSec label="Charges"/>
          <G4>
            <F label="Labour (₹)"   name="labourCharges"   type="number" value={form.labourCharges}   onChange={hc}/>
            <F label="Material (₹)" name="materialCharges" type="number" value={form.materialCharges} onChange={hc}/>
            <F label="Travel (₹)"   name="travelCharges"   type="number" value={form.travelCharges}   onChange={hc}/>
            <F label="Other (₹)"    name="otherCharges"    type="number" value={form.otherCharges}    onChange={hc}/>
          </G4>
          <G2>
            <F label="Discount (₹)" name="discount"   type="number" value={form.discount}   onChange={hc}/>
            <F label="GST Type"     name="gstType"    value={form.gstType}    onChange={hc} options={["IGST","CGST+SGST","Exempt","Nil"]}/>
          </G2>
          <CalcStrip items={[["Subtotal",fmt(calc.sub)],["Taxable",fmt(calc.taxable)],["GST",fmt(calc.gstAmt)],["TDS",fmt(calc.tdsAmt)],["Net Payable",fmt(calc.netPay),true]]}/>
          <FSec label="Tax & TDS"/>
          <G4>
            <F label="GST Rate %"    name="gstPct"    type="number" value={form.gstPct}    onChange={hc}/>
            <F label="TDS Applicable" name="tdsApplicable" value={form.tdsApplicable} onChange={hc} options={["Yes","No"]}/>
            <F label="TDS Rate %"    name="tdsRate"   type="number" value={form.tdsRate}   onChange={hc}/>
            <F label="Place of Supply" name="placeOfSupply" value={form.placeOfSupply} onChange={hc}/>
          </G4>
          <FSec label="Dispatch (optional)"/>
          <G2>
            <F label="Eway Bill No." name="ewayBillNo" value={form.ewayBillNo} onChange={hc}/>
            <F label="Vehicle No."   name="vehicleNo"   value={form.vehicleNo}   onChange={hc}/>
          </G2>
          <FSec label="Payment"/>
          <G3>
            <F label="Payment Terms" name="paymentTerms" value={form.paymentTerms} onChange={hc} options={["Advance","15 days","30 days","45 days","60 days"]}/>
            <F label="Due Date"      name="dueDate"      type="date" value={form.dueDate}  onChange={hc}/>
            <F label="Status"        name="status"       value={form.status}       onChange={hc} options={["Unpaid","Partial Paid","Paid"]}/>
          </G3>
          <G3>
            <F label="Amount Received (₹)" name="amountReceived" type="number" value={form.amountReceived} onChange={hc}/>
            <F label="Bank Name"     name="bankName"   value={form.bankName}   onChange={hc} options={["State Bank of India","HDFC Bank","ICICI Bank","Axis Bank","Punjab National Bank"]}/>
            <F label="IFSC Code"     name="ifsc"       value={form.ifsc}       onChange={hc}/>
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
