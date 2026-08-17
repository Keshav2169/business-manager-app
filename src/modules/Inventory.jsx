import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildInventoryRow, calcClosing } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, SaveStatus, useToast } from "../shared/ui.jsx";

const BLANK = { code:"",name:"",category:"",unit:"",hsnCode:"",opening:0,reorder:0,moq:1,leadTimeDays:0,purchasePrice:0,unitCost:0,supplier:"",altSupplier:"",rack:"",condition:"New",shelfLife:"",remarks:"" };
const RULES = [{ field:"code",label:"Item Code",required:true },{ field:"name",label:"Item Name",required:true },{ field:"category",label:"Category",required:true },{ field:"unit",label:"Unit",required:true }];

export default function Inventory({ data=[], fy, user, onRefresh, vendors=[] }) {
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

  // LIVE: calculate closing stock = opening + purchased - issued
  const withClosing = data.map(item => ({
    ...item,
    _closing: calcClosing(item.opening||item["Opening Stock"]||0, item.purchased||item["Purchased Qty"]||0, item.issued||item["Issued Qty"]||0),
  }));

  const lowStock = withClosing.filter(i => (+i._closing) <= (+(i.reorder||i["Reorder Level"]||0)));
  const cats     = [...new Set(data.map(i=>i.category).filter(Boolean))];
  const rows     = withClosing.filter(i =>
    (filter==="All"||(filter==="Low Stock"?i._closing<=+(i.reorder||0):i.category===filter)) &&
    [i.name,i.code||"",i.category||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd  = () => { setForm({...BLANK}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs=validate(form,RULES); if(Object.keys(errs).length){setErrors(errs);return;}
    setSaving(true); setStatus("saving");
    const row=buildInventoryRow(form,fy,user);
    const res=editIdx!==null?await sheetsAPI.update("Inventory",form.rowIndex,row):await sheetsAPI.append("Inventory",row);
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
    show(editIdx!==null?"Item updated":"Item saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };
  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("Inventory",r.rowIndex); show("Item deleted","green"); onRefresh&&onRefresh(); };

  const totalValue = withClosing.reduce((s,i)=>s+((+i._closing)*(+(i.unitCost||i["Selling Price (Rs)"]||0))),0);

  const cols = [
    {key:"code",     label:"Code"},
    {key:"name",     label:"Item",       bold:true},
    {key:"category", label:"Category",   render:r=><Badge label={r.category} color="default"/>},
    {key:"unit",     label:"Unit"},
    {key:"opening",  label:"Open",       right:true, render:r=>+(r.opening||r["Opening Stock"]||0)},
    {key:"purchased",label:"In",         right:true, render:r=><span style={{color:T.green,fontWeight:700}}>+{+(r.purchased||r["Purchased Qty"]||0)}</span>},
    {key:"issued",   label:"Out",        right:true, render:r=><span style={{color:T.red,fontWeight:700}}>-{+(r.issued||r["Issued Qty"]||0)}</span>},
    {key:"_closing", label:"Closing",    right:true, render:r=><span style={{fontWeight:800,color:r._closing<=(+(r.reorder||r["Reorder Level"]||0))?T.red:T.green}}>{r._closing}{r._closing<=(+(r.reorder||0))?" ⚠️":""}</span>, exportVal:r=>r._closing},
    {key:"reorder",  label:"Reorder",    right:true, render:r=>+(r.reorder||r["Reorder Level"]||0)},
    {key:"unitCost", label:"Price",      right:true, render:r=>fmt(+(r.unitCost||r["Selling Price (Rs)"]||0))},
    {key:"stockVal", label:"Stock Value",right:true, render:r=><span style={{fontWeight:700,color:T.navy}}>{fmt(r._closing*(+(r.unitCost||0)))}</span>, exportVal:r=>r._closing*(+(r.unitCost||0))},
    {key:"supplier", label:"Supplier"},
    {key:"rack",     label:"Location"},
  ];

  return (
    <div>
      <SHdr title="📦 Inventory Register" action="+ Add Item" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Inventory",cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <KPI icon="📦" label="Total Items"  value={data.length}       color={T.navy}/>
        <KPI icon="⚠️" label="Low Stock"   value={lowStock.length}   color={lowStock.length>0?T.red:T.green} sub={lowStock.length>0?lowStock.map(i=>i.name).slice(0,2).join(", "):"All ok"}/>
        <KPI icon="💰" label="Stock Value"  value={fmt(totalValue)}   color={T.navy}/>
      </div>
      {lowStock.length>0&&<Alert type="red" icon="⚠️" msg={`Low stock: ${lowStock.map(i=>i.name).join(", ")}`}/>}
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — closing stock auto-calculated from opening+purchased-issued."/>}
      <Pills options={[{label:"All",value:"All",count:data.length},{label:"⚠️ Low Stock",value:"Low Stock",count:lowStock.length},...cats.map(c=>({label:c,value:c,count:data.filter(i=>i.category===c).length}))]} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search item name, code, category..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg="No inventory items found"/>
      {del&&<ConfirmModal msg={`Delete item ${del.r.name}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}
      {modal&&(
        <Modal title={editIdx!==null?"Edit Item":"Add Inventory Item"} onClose={()=>setModal(false)} full>
          <FSec label="Item Details"/>
          <G3>
            <F label="Item Code *"    name="code"     value={form.code}     onChange={hc} required error={errors.code} placeholder="KE-SP-001"/>
            <F label="Category *"     name="category" value={form.category} onChange={hc} options={["Spares","Lubricants","Consumables","Tools","Safety Equipment","Electrical","Fasteners"]} required error={errors.category}/>
            <F label="HSN Code"       name="hsnCode"  value={form.hsnCode}  onChange={hc}/>
          </G3>
          <F label="Item Description *" name="name"   value={form.name}     onChange={hc} required error={errors.name}/>
          <G4>
            <F label="Unit *"          name="unit"         value={form.unit}         onChange={hc} options={["Pcs","Set","Can","Tin","Sheet","Kg","Ltr","Box","Mtr","Roll"]} required error={errors.unit}/>
            <F label="Opening Stock"   name="opening"      type="number" value={form.opening}    onChange={hc}/>
            <F label="Reorder Level"   name="reorder"      type="number" value={form.reorder}    onChange={hc}/>
            <F label="Min. Order Qty"  name="moq"          type="number" value={form.moq}        onChange={hc}/>
          </G4>
          <FSec label="Pricing & Supply"/>
          <G3>
            <F label="Purchase Price (₹)" name="purchasePrice" type="number" value={form.purchasePrice} onChange={hc}/>
            <F label="Selling Price (₹)"  name="unitCost"      type="number" value={form.unitCost}      onChange={hc}/>
            <F label="Lead Time (days)"   name="leadTimeDays"  type="number" value={form.leadTimeDays}  onChange={hc}/>
          </G3>
          <G3>
            <F label="Primary Supplier"   name="supplier"    value={form.supplier}    onChange={hc} options={["",  ...vendors.map(v=>v.name)].filter(Boolean)}/>
            <F label="Alt. Supplier"      name="altSupplier" value={form.altSupplier} onChange={hc}/>
            <F label="Storage Location"   name="rack"        value={form.rack}        onChange={hc} placeholder="e.g. Rack A1"/>
          </G3>
          <G2>
            <F label="Condition"          name="condition"   value={form.condition}   onChange={hc} options={["New","Refurbished","Used"]}/>
            <F label="Shelf Life (months)" name="shelfLife"  type="number" value={form.shelfLife} onChange={hc}/>
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
