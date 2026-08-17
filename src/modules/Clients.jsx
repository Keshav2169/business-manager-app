import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, isPast, stars, validate, exportCSV, sheetsAPI, IS_DEMO, buildClientRow, waLink } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, DetailGrid, SaveStatus, useToast, WA } from "../shared/ui.jsx";

const BLANK = { name:"",sector:"",contact:"",designation:"",mobile:"",altMobile:"",whatsapp:"",email:"",altEmail:"",address:"",city:"",state:"Uttar Pradesh",pin:"",gstin:"",pan:"",creditLimit:0,paymentTerms:"30 days",annualPotential:0,tdsApplicable:"No",tdsRate:"",noOfTurbines:0,oemInstalled:"",seasonalDependency:"",source:"",status:"Active",nextFollowup:"",rating:3,remarks:"" };
const RULES = [
  { field:"name",      label:"Company Name", required:true },
  { field:"sector",    label:"Sector",       required:true },
  { field:"mobile",    label:"Mobile",       required:true, pattern:"mobile" },
  { field:"altMobile", label:"Alt. Mobile",  pattern:"mobile" },
  { field:"whatsapp",  label:"WhatsApp",     pattern:"mobile" },
  { field:"email",     label:"Email",        pattern:"email" },
  { field:"altEmail",  label:"Alt. Email",   pattern:"email" },
  { field:"gstin",     label:"GSTIN",        pattern:"gstin" },
  { field:"pan",       label:"PAN",          pattern:"pan" },
];

export default function Clients({ data=[], fy, user, onRefresh }) {
  const [modal,   setModal]   = useState(false);
  const [viewCl,  setViewCl]  = useState(null);
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

  // Soft duplicate check — same mobile or GSTIN already on file (excluding
  // the record currently being edited). Non-blocking: sometimes a second
  // record legitimately shares a mobile (e.g. same contact, different site),
  // so this warns rather than refuses to save, which is how CRM data quietly
  // fragments into near-duplicate client cards over time.
  const dupMatch = (() => {
    if (!form.mobile && !form.gstin) return null;
    const other = data.find(c =>
      c.code !== form.code &&
      ((form.mobile && c.mobile === form.mobile) || (form.gstin && form.gstin.trim() && c.gstin === form.gstin))
    );
    if (!other) return null;
    return `${other.mobile===form.mobile ? "Mobile number" : "GSTIN"} already on file for "${other.name}" (${other.code}).`;
  })();

  const rows = data.filter(c =>
    (filter==="All"||c.status===filter||c.sector===filter) &&
    [c.name,c.contact||"",c.city||"",c.sector||"",c.mobile||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  // code fetched at SAVE time — see nextSerial's server-side lock.
  const openAdd  = () => {
    setForm({...BLANK}); setErrors({}); setEditIdx(null); setModal(true);
  };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    const code = editIdx!==null ? form.code : (form.code || await sheetsAPI.nextSerial("Clients","CL",fy));
    const row = buildClientRow({...form, code}, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("Clients",form.rowIndex,row) : await sheetsAPI.append("Clients",row);
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
    show(editIdx!==null?"Client updated":"Client saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleDelete = async ({r}) => {
    setDel(null);
    await sheetsAPI.softDelete("Clients",r.rowIndex);
    show("Client deleted","green"); onRefresh&&onRefresh();
  };

  const cols = [
    {key:"code",    label:"Code"},
    {key:"name",    label:"Company",    bold:true, render:r=><button onClick={()=>setViewCl(r)} style={{background:"none",border:"none",cursor:"pointer",fontWeight:700,color:T.navy,textDecoration:"underline",fontSize:12,textAlign:"left"}}>{r.name}</button>},
    {key:"sector",  label:"Sector",     render:r=><Badge label={r.sector} color="default"/>},
    {key:"contact", label:"Contact"},
    {key:"mobile",  label:"Mobile"},
    {key:"city",    label:"City"},
    {key:"noOfTurbines",label:"Turbines",right:true},
    {key:"oemInstalled",label:"OEM"},
    {key:"outstanding",label:"Outstanding",right:true,render:r=><span style={{fontWeight:700,color:(+(r.outstanding||r["Outstanding (Rs)"]||0))>0?T.red:T.green}}>{fmt(+(r.outstanding||r["Outstanding (Rs)"]||0))}</span>, exportVal:r=>+(r.outstanding||0)},
    {key:"nextFollowup",label:"Follow-up",render:r=><span style={{color:isPast(r.nextFollowup)?T.red:T.dark,fontWeight:isPast(r.nextFollowup)?700:400}}>{fmtD(r.nextFollowup||r["Next Follow-up"])}</span>, exportVal:r=>r.nextFollowup||""},
    {key:"status",  label:"Status",     render:r=><Badge label={r.status} color={r.status==="Active"?"green":r.status==="Prospect"?"amber":"default"}/>},
    {key:"rating",  label:"★",          render:r=><span style={{color:T.gold,fontSize:11}}>{stars(r.rating||3)}</span>},
    {key:"wa",      label:"WA",         render:r=><WA mobile={r.whatsapp||r.mobile} msg={`Dear ${r.contact}, this is Keshav Sharma from Keshav Enterprises, Shamli. Following up on our services for ${r.name}. — KE`}/>},
  ];

  const sectors = [...new Set(data.map(c=>c.sector).filter(Boolean))];

  return (
    <div>
      <SHdr title="👥 Client Database" action="+ Add Client" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Clients",cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="👥" label="Total"       value={data.length}                                      color={T.navy}/>
        <KPI icon="✅" label="Active"      value={data.filter(c=>c.status==="Active").length}       color={T.green}/>
        <KPI icon="🔭" label="Prospects"   value={data.filter(c=>c.status==="Prospect").length}     color={T.amber}/>
        <KPI icon="💰" label="Outstanding" value={fmt(data.reduce((s,c)=>s+(+(c.outstanding||c["Outstanding (Rs)"]||0)),0))} color={T.red}/>
        <KPI icon="📊" label="Annual Potential" value={fmt(data.reduce((s,c)=>s+(+(c.annualPotential||c["Annual Potential (Rs)"]||0)),0))} color={T.navy}/>
      </div>
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist to Google Sheets."/>}
      <Pills options={[{label:"All",value:"All",count:data.length},{label:"Active",value:"Active",count:data.filter(c=>c.status==="Active").length},{label:"Prospect",value:"Prospect",count:data.filter(c=>c.status==="Prospect").length},...sectors.map(s=>({label:s,value:s,count:data.filter(c=>c.sector===s).length}))]} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search by company, contact, city, mobile..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg="No clients found"/>

      {del&&<ConfirmModal msg={`Delete client ${del.r.name}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      {viewCl&&(
        <Modal title={viewCl.name} subtitle={viewCl.code} onClose={()=>setViewCl(null)} wide>
          <DetailGrid fields={[["Code",viewCl.code],["Sector",viewCl.sector],["Contact",viewCl.contact],["Designation",viewCl.designation],["Mobile",viewCl.mobile],["WhatsApp",viewCl.whatsapp||viewCl.mobile],["Email",viewCl.email],["Alt. Email",viewCl.altEmail],["Address",viewCl.address,2],["City",viewCl.city],["State / PIN",`${viewCl.state} — ${viewCl.pin}`],["GSTIN",viewCl.gstin],["PAN",viewCl.pan],["Credit Limit",fmt(viewCl.creditLimit||0)],["Payment Terms",viewCl.paymentTerms],["Annual Potential",fmt(viewCl.annualPotential||0)],["TDS",`${viewCl.tdsApplicable} ${viewCl.tdsRate?`@ ${viewCl.tdsRate}`:""}`],["No. of Turbines",viewCl.noOfTurbines],["OEM Installed",viewCl.oemInstalled],["Seasonal",viewCl.seasonalDependency||"—"],["Outstanding",fmt(+(viewCl.outstanding||0))],["Source",viewCl.source],["Status",viewCl.status],["Next Follow-up",fmtD(viewCl.nextFollowup)],["Remarks",viewCl.remarks||"—",2]]}/>
          <div style={{display:"flex",gap:10}}><WA mobile={viewCl.whatsapp||viewCl.mobile} msg={`Dear ${viewCl.contact}, this is Keshav Sharma from Keshav Enterprises, Shamli.`} label="WhatsApp"/><a href={`tel:+91${viewCl.mobile}`} style={{background:T.navy,color:"#fff",borderRadius:6,padding:"4px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>📞 Call</a></div>
        </Modal>
      )}

      {modal&&(
        <Modal title={editIdx!==null?"Edit Client":"Add Client"} onClose={()=>setModal(false)} full>
          {dupMatch && <Alert type="amber" icon="⚠️" msg={`Possible duplicate — ${dupMatch}`}/>}
          <FSec label="Company"/>
          <G3>
            <F label="Company Name *" name="name"   value={form.name}   onChange={hc} required error={errors.name}/>
            <F label="Sector *"       name="sector" value={form.sector} onChange={hc} options={["Sugar Mill","Paper Mill","Power Plant","Petrochemical","OEM / Referral","Oil and Gas","Cement","Fertilizer","Distillery","Other"]} required error={errors.sector}/>
            <F label="Status"         name="status" value={form.status} onChange={hc} options={["Active","Prospect","Inactive","On Hold"]}/>
          </G3>
          <FSec label="Contact Person"/>
          <G3>
            <F label="Contact Name *" name="contact"     value={form.contact}     onChange={hc} required error={errors.contact}/>
            <F label="Designation"    name="designation" value={form.designation} onChange={hc} options={["Maintenance Head","Plant Head","Chief Engineer","DGM Maintenance","Reliability Engineer","MD / Owner","Purchase Manager"]}/>
            <F label="Mobile *"       name="mobile"      value={form.mobile}      onChange={hc} type="tel" required error={errors.mobile}/>
          </G3>
          <G3>
            <F label="Alt. Mobile"    name="altMobile"   value={form.altMobile}   onChange={hc} type="tel" error={errors.altMobile}/>
            <F label="WhatsApp"       name="whatsapp"    value={form.whatsapp}    onChange={hc} type="tel" error={errors.whatsapp}/>
            <F label="Email"          name="email"       value={form.email}       onChange={hc} type="email" error={errors.email}/>
          </G3>
          <FSec label="Address"/>
          <F label="Full Address"     name="address"     value={form.address}     onChange={hc}/>
          <G3>
            <F label="City *"         name="city"        value={form.city}        onChange={hc} required error={errors.city}/>
            <F label="State"          name="state"       value={form.state}       onChange={hc} options={["Uttar Pradesh","Uttarakhand","Delhi","Haryana","Rajasthan","Punjab","Bihar","Maharashtra","Gujarat","Other"]}/>
            <F label="PIN Code"       name="pin"         value={form.pin}         onChange={hc}/>
          </G3>
          <FSec label="Commercial & Technical"/>
          <G4>
            <F label="GSTIN"          name="gstin"            value={form.gstin}           onChange={hc} error={errors.gstin} hint="15 characters, e.g. 09ABCDE1234F1Z5"/>
            <F label="PAN"            name="pan"              value={form.pan}             onChange={hc} error={errors.pan} hint="10 characters, e.g. ABCDE1234F"/>
            <F label="Credit Limit (₹)" name="creditLimit"    type="number" value={form.creditLimit}    onChange={hc}/>
            <F label="Payment Terms"  name="paymentTerms"     value={form.paymentTerms}    onChange={hc} options={["Advance","15 days","30 days","45 days","60 days","90 days"]}/>
          </G4>
          <G4>
            <F label="Annual Potential (₹)" name="annualPotential" type="number" value={form.annualPotential} onChange={hc}/>
            <F label="No. of Turbines"      name="noOfTurbines"    type="number" value={form.noOfTurbines}    onChange={hc}/>
            <F label="OEM Installed"        name="oemInstalled"    value={form.oemInstalled}    onChange={hc} options={["Triveni","BHEL","Siemens","KKK","ABB","Mixed","Other"]}/>
            <F label="Seasonal Dependency"  name="seasonalDependency" value={form.seasonalDependency} onChange={hc} options={["None","Oct-Mar (Crushing)","Monsoon-dependent","Continuous"]}/>
          </G4>
          <G4>
            <F label="TDS Applicable" name="tdsApplicable" value={form.tdsApplicable} onChange={hc} options={["Yes","No"]}/>
            <F label="TDS Rate"       name="tdsRate"       value={form.tdsRate}       onChange={hc} options={["","1%","2%","5%","10%"]}/>
            <F label="Source"         name="source"        value={form.source}        onChange={hc} options={["Reference","Cold Call","Trade Show","Tender","OEM Referral","LinkedIn","Walk-in"]}/>
            <F label="Next Follow-up" name="nextFollowup"  type="date" value={form.nextFollowup} onChange={hc}/>
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
