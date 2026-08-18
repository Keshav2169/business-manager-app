import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, isPast, validate, exportCSV, sheetsAPI, IS_DEMO, buildInvoiceRow, buildInvoiceItemRow, calcInvoice, calcItemsTotal } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, FTxt, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, CalcStrip, AmtTable, DetailGrid, SaveStatus, useToast } from "../shared/ui.jsx";

const invClr = s => s==="Paid"?"green":s==="Partial Paid"?"amber":s==="Unpaid"?"red":"default";
const BLANK  = { invoiceNo:"",date:today(),client:"",jobRef:"",poNo:"",poDate:"",description:"",scopeDetails:"",labourCharges:0,materialCharges:0,travelCharges:0,otherCharges:0,discount:0,gstType:"IGST",gstPct:18,tdsApplicable:"Yes",tdsRate:1,paymentTerms:"30 days",dueDate:"",bankName:"State Bank of India",accountNo:"",ifsc:"",placeOfSupply:"",status:"Unpaid",amountReceived:0,remarks:"",ewayBillNo:"",vehicleNo:"",items:[] };
const RULES  = [{ field:"client",label:"Client",required:true },{ field:"date",label:"Date",required:true },{ field:"description",label:"Description",required:true },{ field:"invoiceNo",label:"Invoice No.",required:true }];
const BLANK_ITEM = { description:"", hsn:"", qty:1, unit:"Pcs", rate:0 };

// Per-row validation for the line-item table — same shape as validate()/
// RULES elsewhere in this file, just keyed by row index since items aren't
// a flat form. An invoice with ZERO item rows is valid (falls back to the
// legacy typed Material charge, see calcInvoice) — only rows that DO exist
// must have a description, qty > 0, and rate >= 0.
const validateItems = (items) => {
  const errs = {};
  (items||[]).forEach((it,i) => {
    const rowErr = {};
    if (!it.description || !String(it.description).trim()) rowErr.description = true;
    if (!(+it.qty > 0)) rowErr.qty = true;
    if (!(+it.rate >= 0)) rowErr.rate = true;
    if (Object.keys(rowErr).length) errs[i] = rowErr;
  });
  return errs;
};

// Editable line-item table shown inside the invoice modal, replacing the
// old flat "Material (₹)" field. Kept local to this file (not shared
// ui.jsx) since its shape — description/HSN/qty/unit/rate/amount columns —
// is specific to Sales Invoice line items.
function ItemsTable({ items, onChange, errors }) {
  const upd = (i,field,val) => { const next = items.slice(); next[i] = { ...next[i], [field]: val }; onChange(next); };
  const addRow    = () => onChange([...items, { ...BLANK_ITEM }]);
  const removeRow = (i) => onChange(items.filter((_,idx)=>idx!==i));
  const cols = "2.2fr 1fr .7fr .8fr .9fr .9fr 28px";

  return (
    <div style={{marginBottom:14}}>
      <div style={{border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:cols,gap:6,background:T.light,padding:"7px 10px",fontSize:10,fontWeight:700,color:T.slate}}>
          <div>Description</div><div>HSN/SAC</div><div>Qty</div><div>Unit</div><div>Rate (₹)</div><div>Amount (₹)</div><div/>
        </div>
        {items.length===0 && (
          <div style={{padding:"14px 10px",fontSize:12,color:T.slate,textAlign:"center"}}>
            No line items yet — click "+ Add Item" below, or leave empty to enter Material charges as a single amount elsewhere on this invoice.
          </div>
        )}
        {items.map((it,i)=>{
          const amt = (+it.qty||0)*(+it.rate||0);
          const err = errors?.[i] || {};
          return (
            <div key={i} style={{display:"grid",gridTemplateColumns:cols,gap:6,padding:"6px 10px",borderTop:`1px solid ${T.border}`,alignItems:"center"}}>
              <input value={it.description} onChange={e=>upd(i,"description",e.target.value)} placeholder="Item description"
                style={{padding:"6px 8px",borderRadius:6,border:`1.5px solid ${err.description?T.red:T.border}`,fontSize:12,width:"100%",boxSizing:"border-box"}}/>
              <input value={it.hsn} onChange={e=>upd(i,"hsn",e.target.value)} placeholder="HSN/SAC"
                style={{padding:"6px 8px",borderRadius:6,border:`1.5px solid ${T.border}`,fontSize:12,width:"100%",boxSizing:"border-box"}}/>
              <input type="number" value={it.qty} onChange={e=>upd(i,"qty",e.target.value)}
                style={{padding:"6px 8px",borderRadius:6,border:`1.5px solid ${err.qty?T.red:T.border}`,fontSize:12,width:"100%",boxSizing:"border-box"}}/>
              <input value={it.unit} onChange={e=>upd(i,"unit",e.target.value)} placeholder="Pcs"
                style={{padding:"6px 8px",borderRadius:6,border:`1.5px solid ${T.border}`,fontSize:12,width:"100%",boxSizing:"border-box"}}/>
              <input type="number" value={it.rate} onChange={e=>upd(i,"rate",e.target.value)}
                style={{padding:"6px 8px",borderRadius:6,border:`1.5px solid ${err.rate?T.red:T.border}`,fontSize:12,width:"100%",boxSizing:"border-box"}}/>
              <div style={{fontSize:12,fontWeight:700,fontFamily:"monospace",textAlign:"right"}}>{fmt(amt)}</div>
              <button type="button" onClick={()=>removeRow(i)} title="Remove row" aria-label="Remove row"
                style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:16,fontWeight:800,lineHeight:1}}>×</button>
            </div>
          );
        })}
        {items.length>0 && (
          <div style={{display:"flex",justifyContent:"flex-end",padding:"7px 10px",background:T.light,borderTop:`1px solid ${T.border}`,fontSize:12,fontWeight:800,color:T.navy}}>
            Material Total: {fmt(calcItemsTotal(items))}
          </div>
        )}
      </div>
      <button type="button" onClick={addRow} style={{marginTop:8,padding:"6px 14px",borderRadius:7,border:`1px dashed ${T.navy}`,background:"none",color:T.navy,cursor:"pointer",fontSize:12,fontWeight:700}}>+ Add Item</button>
    </div>
  );
}

// Read-only line-item table for the View modal. Only rendered when the
// invoice actually has items (see the fallback comment at its call site) —
// a legacy invoice saved before this feature shipped just shows its
// existing single-line Description field, exactly as before.
function ViewItemsTable({ items }) {
  const cols = "40px 2.2fr 1fr .7fr .9fr .9fr";
  return (
    <div style={{border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:cols,gap:6,background:T.navy,padding:"8px 12px",fontSize:10,fontWeight:700,color:T.gold}}>
        <div>SR</div><div>Description</div><div>HSN/SAC</div><div>Qty</div><div>Rate</div><div>Amount</div>
      </div>
      {items.map((it,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:cols,gap:6,padding:"7px 12px",borderTop:`1px solid ${T.border}`,fontSize:12,background:i%2===0?T.white:"#FAFBFC"}}>
          <div>{it.srNo}</div><div>{it.description}</div><div>{it.hsn||"—"}</div><div>{it.qty}</div>
          <div style={{fontFamily:"monospace"}}>{fmt(+it.rate||0)}</div>
          <div style={{fontFamily:"monospace",fontWeight:700}}>{fmt(+it.amount||0)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Invoices({ data=[], fy, user, onRefresh, clients=[], jobs=[] }) {
  const [modal,   setModal]   = useState(false);
  const [viewInv, setViewInv] = useState(null);
  const [viewItems,setViewItems] = useState([]);
  const [form,    setForm]    = useState(BLANK);
  const [errors,  setErrors]  = useState({});
  const [itemErrors, setItemErrors] = useState({});
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
    setForm({...BLANK, invoiceNo:"", date:today(), items:[]});
    setErrors({}); setItemErrors({}); setEditIdx(null); setModal(true);
  };
  // Pre-populates the item table from sheetsAPI.getInvoiceItems when
  // opening an existing invoice for edit (Phase 4). Opens the modal
  // immediately with an empty item table rather than waiting on the fetch,
  // then fills it in once it resolves — a slow/offline fetch shouldn't
  // block the rest of the form from being usable.
  const openEdit = async (row,ri) => {
    setForm({...row, items:[]}); setErrors({}); setItemErrors({}); setEditIdx(ri); setModal(true);
    const items = await sheetsAPI.getInvoiceItems(row.invoiceNo);
    setForm(f => ({...f, items: items.map(it=>({description:it.description,hsn:it.hsn,qty:it.qty,unit:it.unit,rate:it.rate}))}));
  };

  const openView = async (r) => {
    setViewInv(r); setViewItems([]);
    const items = await sheetsAPI.getInvoiceItems(r.invoiceNo);
    setViewItems(items);
  };
  const closeView = () => { setViewInv(null); setViewItems([]); };

  const handleSave = async () => {
    const errs     = validate(form, RULES.filter(r=>r.field!=="invoiceNo"));
    const itemErrs = validateItems(form.items);
    if (Object.keys(errs).length || Object.keys(itemErrs).length) { setErrors(errs); setItemErrors(itemErrs); return; }
    setItemErrors({});
    setSaving(true); setStatus("saving");
    const invoiceNo = editIdx!==null ? form.invoiceNo : (form.invoiceNo || await sheetsAPI.nextSerial("Sales Invoices","INV",fy));

    // Line items are written BEFORE the invoice header row, on purpose. If
    // the header write then fails, the result is a few harmless orphaned
    // item rows with no matching invoice — annoying but invisible and
    // cleanable. The other order round would let the header show a wrong
    // Material Charges total with no line items to explain it — a real
    // accounting discrepancy. See Phase 2 of multi-item-invoice-prompt.md.
    const itemRows = (form.items||[]).map((it,i)=>buildInvoiceItemRow(it,invoiceNo,fy,i+1));
    const itemsRes = await sheetsAPI.saveInvoiceItems(invoiceNo, fy, itemRows);
    if (itemsRes?.error) {
      setStatus("error"); setSaving(false);
      show(`Save failed — ${itemsRes.error}. Your entry is still here — check your connection and try again.`,"red");
      return; // stop here — the header row is never written on an items failure
    }

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
    {key:"view",         label:"View",       render:r=><button onClick={e=>{e.stopPropagation();openView(r);}} style={{background:T.navy,color:"#fff",border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>View</button>},
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
        <Modal title={`Invoice — ${viewInv.invoiceNo}`} onClose={closeView} wide>
          <div style={{background:T.navy,borderRadius:10,padding:"14px 18px",marginBottom:14,display:"flex",justifyContent:"space-between"}}>
            <div><div style={{color:T.gold,fontWeight:900,fontSize:15}}>KESHAV ENTERPRISES</div><div style={{color:"rgba(255,255,255,.7)",fontSize:11}}>Shamli, UP · MSME · IEC Registered</div></div>
            <div style={{textAlign:"right"}}><div style={{color:T.gold,fontWeight:800}}>{viewInv.invoiceNo}</div><div style={{color:"rgba(255,255,255,.7)",fontSize:11}}>Date: {fmtD(viewInv.date)} · Due: {fmtD(viewInv.dueDate)}</div></div>
          </div>
          <DetailGrid fields={[["Client",viewInv.client],["Job Ref.",viewInv.jobRef||"—"],["PO No.",viewInv.poNo||"—"],["Description",viewInv.description],["Scope",viewInv.scopeDetails||"—",2],["Eway Bill No.",viewInv.ewayBillNo||"—"],["Vehicle No.",viewInv.vehicleNo||"—"]]}/>
          {/* Fallback for legacy invoices: only render the item table when
              the invoice actually has saved items. An invoice saved before
              this feature shipped has none, and just keeps showing its
              existing single-line Description field above — never an
              empty item table with no explanation. */}
          {viewItems.length>0 && <ViewItemsTable items={viewItems}/>}
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
          <G3>
            <F label="Labour (₹)"   name="labourCharges"   type="number" value={form.labourCharges}   onChange={hc}/>
            <F label="Travel (₹)"   name="travelCharges"   type="number" value={form.travelCharges}   onChange={hc}/>
            <F label="Other (₹)"    name="otherCharges"    type="number" value={form.otherCharges}    onChange={hc}/>
          </G3>
          <FSec label="Material — Line Items" sub="Add each item, or leave empty and it defaults to ₹0 material charges"/>
          <ItemsTable items={form.items||[]} errors={itemErrors} onChange={items=>setForm(f=>({...f,items}))}/>
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
