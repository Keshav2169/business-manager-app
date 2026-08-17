import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmtD, today, daysFromToday, validate, exportCSV, sheetsAPI, IS_DEMO, buildVaultRow } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, FTxt, G2, G3, Btns, Alert, Search, Pills, ConfirmModal, SaveStatus, useToast } from "../shared/ui.jsx";

const CATEGORIES = ["Registration","Insurance","AMC / Contracts","Client Documents","Calibration Certificate","Warranty Certificate","Vendor Agreement","Other"];
const BLANK = { name:"", category:"", docNo:"", issuingAuthority:"", driveLink:"", expiry:"", fileSize:"", addedBy:"", remarks:"" };
const RULES = [{ field:"name", label:"Document Name", required:true }, { field:"category", label:"Category", required:true }];

// Renewal urgency: red once past expiry, amber inside a 30-day window, plain
// otherwise. Same visual language as FixedAssets' insuranceExpiry column, so
// "a date is about to become a problem" reads consistently across the app.
const expiryTone = (expiry) => {
  if (!expiry || expiry === "—") return { color: T.dark, label: null };
  const d = daysFromToday(expiry);
  if (d < 0) return { color: T.red, label: `Expired ${Math.abs(d)}d ago` };
  if (d <= 30) return { color: T.amber, label: `Expires in ${d}d` };
  return { color: T.dark, label: null };
};

export default function DocumentVault({ data=[], fy, user, onRefresh }) {
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

  const rows = data.filter(v =>
    (filter==="All" || v.category===filter) &&
    [v.name, v.category||"", v.docNo||"", v.issuingAuthority||""].some(s=>s.toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd  = () => { setForm({...BLANK, addedBy:user}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES); if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    const row = buildVaultRow(form, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("Document Vault", form.rowIndex, row) : await sheetsAPI.append("Document Vault", row);
    const _saveFailed = !!res?.error;
    setStatus(_saveFailed?"error":res?.status==="demo"?"demo":"saved"); setSaving(false);
    if (_saveFailed) {
      show(`Save failed — ${res.error||"connection error"}. Your entry is still here — check your connection and try again.`,"red");
      return;
    }
    show(editIdx!==null?"Document updated":"Document saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };
  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("Document Vault", r.rowIndex); show("Document removed","green"); onRefresh&&onRefresh(); };

  const expiringSoon = data.filter(d => { const n=daysFromToday(d.expiry); return n!==null && n>=0 && n<=30; }).length;
  const expired      = data.filter(d => { const n=daysFromToday(d.expiry); return n!==null && n<0; }).length;

  const cols = [
    {key:"name", label:"Document", bold:true},
    {key:"category", label:"Category", render:r=><Badge label={r.category} color="blue"/>},
    {key:"docNo", label:"Doc No."},
    {key:"issuingAuthority", label:"Issued By"},
    {key:"expiry", label:"Expiry", sortValue:r=>r.expiry?new Date(r.expiry).getTime():null,
      render:r=>{ const t=expiryTone(r.expiry);
        return r.expiry ? <span style={{color:t.color,fontWeight:t.label?700:400}}>{fmtD(r.expiry)}{t.label?<div style={{fontSize:10}}>{t.label}</div>:null}</span> : "—"; }},
    {key:"driveLink", label:"File", render:r=>r.driveLink
      ? <a href={r.driveLink} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:T.navy,fontWeight:700,textDecoration:"none"}}>📎 Open</a>
      : <span style={{color:T.slate}}>—</span>},
  ];

  return (
    <div>
      <SHdr title="🗄️ Document Vault" action="+ Add Document" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Document Vault",cols,data)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="🗄️" label="Total Documents" value={data.length} color={T.navy}/>
        <KPI icon="⏳" label="Expiring ≤30 Days" value={expiringSoon} color={T.amber}/>
        <KPI icon="⚠️" label="Expired"           value={expired}      color={T.red}/>
      </div>
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist to Sheets."/>}
      {expiringSoon>0 && <Alert type="amber" icon="⏳" msg={`${expiringSoon} document${expiringSoon!==1?"s":""} expiring within 30 days — renew before they lapse.`}/>}
      <Pills options={[{label:"All",value:"All",count:data.length},...CATEGORIES.filter(c=>data.some(d=>d.category===c)).map(c=>({label:c,value:c,count:data.filter(d=>d.category===c).length}))]} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search document name, doc no., issuing authority..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg="No documents yet — add your first certificate, policy, or agreement."/>
      {del&&<ConfirmModal msg={`Remove document "${del.r.name}"?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}
      {modal&&(
        <Modal title={editIdx!==null?"Edit Document":"Add Document"} onClose={()=>setModal(false)}>
          <FSec label="Document Details"/>
          <G2>
            <F label="Document Name *" name="name"     value={form.name}     onChange={hc} required error={errors.name}/>
            <F label="Category *"      name="category" value={form.category} onChange={hc} options={CATEGORIES} required error={errors.category}/>
          </G2>
          <G2>
            <F label="Document No." name="docNo"            value={form.docNo}            onChange={hc}/>
            <F label="Issuing Authority" name="issuingAuthority" value={form.issuingAuthority} onChange={hc}/>
          </G2>
          <G2>
            <F label="Expiry Date" name="expiry" type="date" value={form.expiry} onChange={hc}/>
            <F label="Added By"    name="addedBy" value={form.addedBy}           onChange={hc}/>
          </G2>
          <F label="Google Drive Link" name="driveLink" value={form.driveLink} onChange={hc} placeholder="https://drive.google.com/..."/>
          <FTxt label="Remarks" name="remarks" value={form.remarks} onChange={hc} rows={2}/>
          <SaveStatus status={status}/>
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
