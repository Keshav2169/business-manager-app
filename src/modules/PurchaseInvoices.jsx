import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildPurchaseRow, calcPurchase } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, CalcStrip, AmtTable, DetailGrid, SaveStatus, useToast } from "../shared/ui.jsx";

const invClr = s => s==="Paid"?"green":s==="Partial Paid"?"amber":s==="Unpaid"?"red":"default";
const BLANK  = { vendorInvNo:"",date:today(),vendorName:"",description:"",jobRef:"",poRef:"",category:"Material",basicAmount:0,discount:0,gstType:"CGST+SGST",cgstPct:9,sgstPct:9,igstPct:18,tdsApplicable:"No",tdsSection:"194C",tdsRate:2,paymentStatus:"Unpaid",paymentMode:"NEFT",itcEligible:"Yes",amountPaid:0,paymentDate:"",utrRef:"",remarks:"" };
const RULES  = [{ field:"vendorName",label:"Vendor",required:true },{ field:"vendorInvNo",label:"Vendor Invoice No.",required:true },{ field:"date",label:"Date",required:true },{ field:"basicAmount",label:"Basic Amount",required:true,min:1 },{ field:"description",label:"Description",required:true }];

export default function PurchaseInvoices({ data=[], fy, user, onRefresh, vendors=[], jobs=[] }) {
  const [modal,  setModal]  = useState(false);
  const [viewInv,setViewInv]= useState(null);
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
  const calc = calcPurchase(form);

  const fyData = data.filter(i=>i.fy===fy);
  const rows   = fyData.filter(i =>
    (filter==="All"||(i.paymentStatus||i["Payment Status"]||"Unpaid")===filter||(i.category||"")=== filter) &&
    [i.vendorName||i["Vendor Name"]||"", i.vendorInvNo||i["Vendor Invoice No."]||"", i.description||"", i.jobRef||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  // Our internal reference (ourRef) is fetched at SAVE time, not here at open
  // time — a number grabbed when the modal opens can go stale if the form
  // sits open while another purchase invoice is saved elsewhere, producing a
  // duplicate reference. See nextSerial()'s server-side lock in
  // apps-script-backend.js for the other half of this fix.
  const openAdd  = () => { setForm({...BLANK}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs=validate(form,RULES); if(Object.keys(errs).length){setErrors(errs);return;}
    setSaving(true); setStatus("saving");
    const ourRef = editIdx!==null ? form.ourRef : (form.ourRef || await sheetsAPI.nextSerial("Purchase Invoices","PINV",fy));
    const row=buildPurchaseRow({...form, ourRef},calc,fy,user);
    const res=editIdx!==null?await sheetsAPI.update("Purchase Invoices",form.rowIndex,row):await sheetsAPI.append("Purchase Invoices",row);
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
    show(editIdx!==null?"Bill updated":"Bill saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };
  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("Purchase Invoices",r.rowIndex); show("Bill deleted","green"); onRefresh&&onRefresh(); };

  const totalPur = fyData.reduce((s,i)=>s+(+(i.totalAmount||i["Total Amount (Rs)"]||0)),0);
  const totalITC = fyData.filter(i=>(i.itcEligible||i["ITC Eligible"])==="Yes").reduce((s,i)=>s+(+(i.totalGST||i["Total GST (Rs)"]||0)),0);
  const unpaid   = fyData.filter(i=>(i.paymentStatus||i["Payment Status"]||"Unpaid")==="Unpaid").reduce((s,i)=>s+(+(i.netPayable||i["Net Payable (Rs)"]||0)),0);

  const cols = [
    {key:"ourRef",       label:"Our Ref.",    bold:true, render:r=>r.ourRef||r["Our Reference"]||"—"},
    {key:"vendorInvNo",  label:"Vendor Inv.", render:r=>r.vendorInvNo||r["Vendor Invoice No."]||"—"},
    {key:"date",         label:"Date",        render:r=>fmtD(r.date||r["Invoice Date"]),        exportVal:r=>r.date||""},
    {key:"vendorName",   label:"Vendor",      bold:true, render:r=>r.vendorName||r["Vendor Name"]||"—"},
    {key:"category",     label:"Category",    render:r=><Badge label={r.category||"—"} color="default"/>},
    {key:"jobRef",       label:"Job"},
    {key:"taxableAmount",label:"Taxable",     right:true, render:r=>fmt(+(r.taxableAmount||r["Taxable Amount (Rs)"]||0)), exportVal:r=>+(r.taxableAmount||0)},
    {key:"totalGST",     label:"GST",         right:true, render:r=><span style={{color:T.green,fontWeight:700}}>{fmt(+(r.totalGST||r["Total GST (Rs)"]||0))}</span>, exportVal:r=>+(r.totalGST||0)},
    {key:"totalAmount",  label:"Total",       right:true, render:r=><span style={{fontWeight:800}}>{fmt(+(r.totalAmount||r["Total Amount (Rs)"]||0))}</span>, exportVal:r=>+(r.totalAmount||0)},
    {key:"tdsDeducted",  label:"TDS",         right:true, render:r=>{ const v=+(r.tdsDeducted||r["TDS Amount (Rs)"]||0); return v?<span style={{color:T.amber}}>{fmt(v)}</span>:"—"; }},
    {key:"netPayable",   label:"Net Payable", right:true, render:r=><span style={{fontWeight:800}}>{fmt(+(r.netPayable||r["Net Payable (Rs)"]||0))}</span>},
    {key:"itcEligible",  label:"ITC",         render:r=>{ const v=r.itcEligible||r["ITC Eligible"]; return <span style={{fontSize:11,fontWeight:700,color:v==="Yes"?T.green:T.slate}}>{v==="Yes"?"✅ Yes":"❌ No"}</span>; }},
    {key:"paymentStatus",label:"Status",      render:r=><Badge label={r.paymentStatus||r["Payment Status"]||"Unpaid"} color={invClr(r.paymentStatus||r["Payment Status"])}/>},
    {key:"view",         label:"View",        render:r=><button onClick={e=>{e.stopPropagation();setViewInv(r);}} style={{background:T.navy,color:"#fff",border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>View</button>},
  ];

  return (
    <div>
      <SHdr title="🛒 Purchase Invoice Register" action="+ Add Bill" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Purchases_"+fy,cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="🛒" label="Total Purchases" value={fmt(totalPur)} color={T.navy}/>
        <KPI icon="📥" label="ITC Available"   value={fmt(totalITC)} color={T.green} sub="Claim in GSTR-3B"/>
        <KPI icon="⏳" label="Unpaid Bills"    value={fmt(unpaid)}   color={T.red}/>
        <KPI icon="🔢" label="Bills"           value={fyData.length} color={T.navy}/>
      </div>
      {totalITC>0&&<Alert type="green" icon="📥" msg={`ITC available FY ${fy}: ${fmt(totalITC)} — claim in GSTR-3B. Verify with CA against GSTR-2B.`}/>}
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist."/>}
      <Pills options={["All","Unpaid","Paid","Partial Paid"].map(s=>({label:s,value:s,count:s==="All"?fyData.length:fyData.filter(i=>(i.paymentStatus||i["Payment Status"]||"Unpaid")===s).length}))} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search vendor, invoice no., job, description..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No purchase bills for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete bill ${del.r.vendorInvNo||del.r["Vendor Invoice No."]}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      {viewInv&&(
        <Modal title={`Purchase Invoice — ${viewInv.ourRef||viewInv["Our Reference"]}`} onClose={()=>setViewInv(null)} wide>
          <DetailGrid fields={[["Our Ref.",viewInv.ourRef],["Vendor Inv.",viewInv.vendorInvNo||viewInv["Vendor Invoice No."]],["Date",fmtD(viewInv.date||viewInv["Invoice Date"])],["Vendor",viewInv.vendorName||viewInv["Vendor Name"]],["Category",viewInv.category],["Job Ref.",viewInv.jobRef||"—"],["Description",viewInv.description||viewInv["Description"],2]]}/>
          <AmtTable rows={[["Taxable Amount",+(viewInv.taxableAmount||viewInv["Taxable Amount (Rs)"]||0)],+(viewInv.cgst||0)>0?["CGST",+(viewInv.cgst||0)]:null,+(viewInv.sgst||0)>0?["SGST",+(viewInv.sgst||0)]:null,+(viewInv.igst||0)>0?["IGST",+(viewInv.igst||0)]:null,["Total GST",+(viewInv.totalGST||viewInv["Total GST (Rs)"]||0)],["Invoice Total",+(viewInv.totalAmount||viewInv["Total Amount (Rs)"]||0)],+(viewInv.tdsDeducted||0)>0?["TDS Deducted",-(+(viewInv.tdsDeducted||0))]:null,["NET PAYABLE",+(viewInv.netPayable||viewInv["Net Payable (Rs)"]||0)]]}/>
          <div style={{background:(viewInv.itcEligible||viewInv["ITC Eligible"])==="Yes"?"#D5F5E3":"#EEF2F7",borderRadius:8,padding:"9px 13px",fontSize:12}}>
            <strong>ITC Status:</strong> {(viewInv.itcEligible||viewInv["ITC Eligible"])==="Yes"?`✅ Eligible — ${fmt(+(viewInv.totalGST||0))}`:"❌ Not eligible"} · Payment: {viewInv.paymentStatus||viewInv["Payment Status"]||"Unpaid"}
          </div>
        </Modal>
      )}

      {modal&&(
        <Modal title={editIdx!==null?"Edit Bill":"Add Purchase Invoice"} onClose={()=>setModal(false)} full>
          <FSec label="Vendor & Invoice"/>
          <G3>
            <F label="Vendor Invoice No. *" name="vendorInvNo" value={form.vendorInvNo} onChange={hc} required error={errors.vendorInvNo}/>
            <F label="Invoice Date *"       name="date"        type="date" value={form.date}       onChange={hc} required error={errors.date}/>
            <F label="Vendor *"             name="vendorName"  value={form.vendorName}  onChange={hc} options={vendors.map(v=>v.name)} required error={errors.vendorName}/>
          </G3>
          <G3>
            <F label="Category"    name="category" value={form.category} onChange={hc} options={["Material","Utilities","Professional","Maintenance","Courier","Travel","Office","Other"]}/>
            <F label="Job Reference" name="jobRef" value={form.jobRef}   onChange={hc} options={["",  ...jobs.map(j=>j.id||j["Job ID"]||"")].filter(Boolean)}/>
            <F label="PO Reference"  name="poRef"  value={form.poRef}    onChange={hc}/>
          </G3>
          <F label="Description *" name="description" value={form.description} onChange={hc} required error={errors.description}/>
          <FSec label="Amounts & Tax"/>
          <G4>
            <F label="Basic Amount (₹) *" name="basicAmount"  type="number" value={form.basicAmount}  onChange={hc} required error={errors.basicAmount}/>
            <F label="Discount (₹)"       name="discount"     type="number" value={form.discount}     onChange={hc}/>
            <F label="GST Type"           name="gstType"      value={form.gstType}      onChange={hc} options={["CGST+SGST","IGST","Exempt","Nil"]}/>
            <F label="GST Rate %"         name="cgstPct"      type="number" value={form.cgstPct}      onChange={hc} hint="CGST % (each side)"/>
          </G4>
          <CalcStrip items={[["Taxable",fmt(calc.taxable)],["CGST",fmt(calc.cgst)],["SGST",fmt(calc.sgst)],["IGST",fmt(calc.igst)],["TDS",fmt(calc.tdsAmt)],["Net Payable",fmt(calc.netPay),true]]}/>
          <FSec label="TDS & ITC"/>
          <G4>
            <F label="TDS Applicable" name="tdsApplicable" value={form.tdsApplicable} onChange={hc} options={["No","Yes"]}/>
            <F label="TDS Section"    name="tdsSection"    value={form.tdsSection}    onChange={hc} options={["194C","194J","194I","194H","194A"]}/>
            <F label="TDS Rate %"     name="tdsRate"        type="number" value={form.tdsRate}       onChange={hc}/>
            <F label="ITC Eligible"   name="itcEligible"   value={form.itcEligible}   onChange={hc} options={["Yes","No"]}/>
          </G4>
          <FSec label="Payment"/>
          <G4>
            <F label="Payment Status" name="paymentStatus" value={form.paymentStatus} onChange={hc} options={["Unpaid","Paid","Partial Paid"]}/>
            <F label="Payment Mode"   name="paymentMode"   value={form.paymentMode}   onChange={hc} options={["NEFT","Cheque","Cash","UPI","RTGS"]}/>
            <F label="Amount Paid (₹)" name="amountPaid"   type="number" value={form.amountPaid}   onChange={hc}/>
            <F label="UTR / Ref."     name="utrRef"        value={form.utrRef}        onChange={hc}/>
          </G4>
          <F label="Remarks" name="remarks" value={form.remarks} onChange={hc}/>
          <SaveStatus status={status}/>
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
