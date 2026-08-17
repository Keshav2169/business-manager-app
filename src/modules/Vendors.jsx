import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, stars, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildVendorRow } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, FTxt, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, SaveStatus, useToast, WA } from "../shared/ui.jsx";

const BLANK = { name:"",category:"",contact:"",designation:"",mobile:"",altMobile:"",email:"",city:"",state:"",gstin:"",pan:"",bankName:"",accountNo:"",ifsc:"",accountType:"Current",paymentTerms:"30 days",creditLimitGiven:0,mseStatus:"No",productList:"",rating:3,status:"Active",remarks:"" };
const RULES = [
  { field:"name",      label:"Vendor Name", required:true },
  { field:"category",  label:"Category",    required:true },
  { field:"mobile",    label:"Mobile",      required:true, pattern:"mobile" },
  { field:"altMobile", label:"Alt. Mobile", pattern:"mobile" },
  { field:"email",     label:"Email",       pattern:"email" },
  { field:"gstin",     label:"GSTIN",       pattern:"gstin" },
  { field:"pan",       label:"PAN",         pattern:"pan" },
  { field:"ifsc",      label:"IFSC",        pattern:"ifsc" },
];

export default function Vendors({ data=[], fy, user, onRefresh }) {
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

  // Soft duplicate check, same reasoning as Clients — warns, doesn't block.
  const dupMatch = (() => {
    if (!form.mobile && !form.gstin) return null;
    const other = data.find(v =>
      v.code !== form.code &&
      ((form.mobile && v.mobile === form.mobile) || (form.gstin && form.gstin.trim() && v.gstin === form.gstin))
    );
    if (!other) return null;
    return `${other.mobile===form.mobile ? "Mobile number" : "GSTIN"} already on file for "${other.name}" (${other.code}).`;
  })();

  const rows = data.filter(v =>
    (filter==="All"||v.status===filter||v.category===v) &&
    [v.name,v.category||"",v.city||"",v.contact||""].some(s=>s.toLowerCase().includes(search.toLowerCase()))
  );

  // code fetched at SAVE time — see nextSerial's server-side lock.
  const openAdd  = () => { setForm({...BLANK}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs=validate(form,RULES); if(Object.keys(errs).length){setErrors(errs);return;}
    setSaving(true); setStatus("saving");
    const code = editIdx!==null ? form.code : (form.code || await sheetsAPI.nextSerial("Vendors","VN",fy));
    const row=buildVendorRow({...form, code},fy,user);
    const res=editIdx!==null?await sheetsAPI.update("Vendors",form.rowIndex,row):await sheetsAPI.append("Vendors",row);
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
    show(editIdx!==null?"Vendor updated":"Vendor saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };
  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("Vendors",r.rowIndex); show("Vendor deleted","green"); onRefresh&&onRefresh(); };

  const cats = [...new Set(data.map(v=>v.category).filter(Boolean))];
  const cols = [
    {key:"code",label:"Code"},{key:"name",label:"Vendor",bold:true},
    {key:"category",label:"Category",render:r=><Badge label={r.category} color="default"/>},
    {key:"contact",label:"Contact"},{key:"mobile",label:"Mobile"},{key:"city",label:"City"},
    {key:"paymentTerms",label:"Pay Terms"},
    {key:"mseStatus",label:"MSE",render:r=><Badge label={r.mseStatus} color={r.mseStatus==="Yes"?"green":"default"}/>},
    {key:"rating",label:"★",render:r=><span style={{color:T.gold,fontSize:11}}>{stars(r.rating||3)}</span>},
    {key:"status",label:"Status",render:r=><Badge label={r.status} color={r.status==="Active"?"green":"red"}/>},
    {key:"wa",label:"WA",render:r=><WA mobile={r.mobile} msg={`Dear ${r.contact}, this is Keshav Sharma from Keshav Enterprises, Shamli. Please share your latest price list.`}/>},
  ];

  return (
    <div>
      <SHdr title="🏭 Vendor Register" action="+ Add Vendor" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Vendors",cols,data)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="🏭" label="Total"   value={data.length}                               color={T.navy}/>
        <KPI icon="✅" label="Active"  value={data.filter(v=>v.status==="Active").length} color={T.green}/>
        <KPI icon="🏅" label="MSE"     value={data.filter(v=>v.mseStatus==="Yes").length} color={T.amber}/>
      </div>
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist to Sheets."/>}
      <Pills options={[{label:"All",value:"All",count:data.length},...cats.map(c=>({label:c,value:c,count:data.filter(v=>v.category===c).length}))]} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search vendor, category, city..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg="No vendors found"/>
      {del&&<ConfirmModal msg={`Delete vendor ${del.r.name}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}
      {modal&&(
        <Modal title={editIdx!==null?"Edit Vendor":"Add Vendor"} onClose={()=>setModal(false)} full>
          {dupMatch && <Alert type="amber" icon="⚠️" msg={`Possible duplicate — ${dupMatch}`}/>}
          <FSec label="Vendor Details"/>
          <G3>
            <F label="Vendor Name *" name="name"     value={form.name}     onChange={hc} required error={errors.name}/>
            <F label="Category *"    name="category" value={form.category} onChange={hc} options={["Bearings","Lubricants","Seals & Gaskets","Precision Tools","Balancing Equipment","Electrical","Consumables","Fasteners","Services","Transport","Other"]} required error={errors.category}/>
            <F label="Status"        name="status"   value={form.status}   onChange={hc} options={["Active","Inactive","Blacklisted","On Trial"]}/>
          </G3>
          <FTxt label="Products / Services" name="productList" value={form.productList} onChange={hc} rows={2}/>
          <FSec label="Contact"/>
          <G3>
            <F label="Contact Person *" name="contact"     value={form.contact}     onChange={hc} required error={errors.contact}/>
            <F label="Designation"      name="designation" value={form.designation} onChange={hc} options={["Area Sales Manager","Sales Executive","MD / Owner","Regional Manager","Technical Support"]}/>
            <F label="Mobile *"         name="mobile"      value={form.mobile}      onChange={hc} type="tel" required error={errors.mobile}/>
          </G3>
          <G3>
            <F label="Alt. Mobile" name="altMobile" value={form.altMobile} onChange={hc} type="tel" error={errors.altMobile}/>
            <F label="Email"       name="email"     value={form.email}     onChange={hc} type="email" error={errors.email}/>
            <F label="City"        name="city"      value={form.city}      onChange={hc}/>
          </G3>
          <G2>
            <F label="State" name="state" value={form.state} onChange={hc} options={["Uttar Pradesh","Delhi","Maharashtra","Gujarat","Tamil Nadu","Karnataka","Other"]}/>
            <F label="MSE / MSME" name="mseStatus" value={form.mseStatus} onChange={hc} options={["Yes","No"]}/>
          </G2>
          <FSec label="Tax & Bank"/>
          <G2>
            <F label="GSTIN" name="gstin" value={form.gstin} onChange={hc} error={errors.gstin} hint="15 characters, e.g. 09ABCDE1234F1Z5"/>
            <F label="PAN"   name="pan"   value={form.pan}   onChange={hc} error={errors.pan} hint="10 characters, e.g. ABCDE1234F"/>
          </G2>
          <G4>
            <F label="Bank Name"   name="bankName"   value={form.bankName}   onChange={hc}/>
            <F label="Account No." name="accountNo"  value={form.accountNo}  onChange={hc}/>
            <F label="IFSC"        name="ifsc"       value={form.ifsc}       onChange={hc} error={errors.ifsc} hint="11 characters, e.g. SBIN0001234"/>
            <F label="Account Type" name="accountType" value={form.accountType} onChange={hc} options={["Current","Savings","CC"]}/>
          </G4>
          <G3>
            <F label="Payment Terms"      name="paymentTerms"    value={form.paymentTerms}    onChange={hc} options={["Advance","7 days","15 days","30 days","45 days","60 days"]}/>
            <F label="Credit Given (₹)"   name="creditLimitGiven" type="number" value={form.creditLimitGiven} onChange={hc}/>
            <F label="Rating"             name="rating"           value={form.rating}          onChange={hc} options={["5","4","3","2","1"]}/>
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
