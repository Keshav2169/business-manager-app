import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildJobRow, waLink } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, FTxt, G2, G3, G4, Btns, Alert, Search, Pills, ConfirmModal, SaveStatus, useToast, WA } from "../shared/ui.jsx";

const STAGES = ["Enquiry","Scheduled","In Progress","Completed","Invoiced","Paid"];
const stageClr = s => s==="Completed"||s==="Paid"?"green":s==="In Progress"?"amber":s==="Invoiced"?"blue":"default";
const invClr   = s => s==="Paid"?"green":s==="Partial Paid"?"amber":s==="Unpaid"?"red":"default";
const BLANK = { client:"",turbine:"",oemMake:"",capacity:"",type:"Enquiry",status:"Enquiry",startDate:"",completionDate:"",poNo:"",poDate:"",poValue:0,siteLocation:"",siteEngineer:"",assignedTo:"Keshav Sharma",labourCharges:0,materialCharges:0,travelCharges:0,otherCharges:0,estimatedValue:0,scopeOfWork:"",specialTools:"",safetyRequirements:"",workPermitNo:"",lastOverhaulDate:"",rpm:"",lubOilType:"",warrantyPeriod:6,invoiceStatus:"Pending",remarks:"" };
const RULES  = [{ field:"client",label:"Client",required:true },{ field:"turbine",label:"Turbine",required:true },{ field:"type",label:"Job Type",required:true }];

export default function Jobs({ data=[], fy, user, onRefresh, clients=[] }) {
  const [modal,  setModal]  = useState(false);
  const [form,   setForm]   = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [editIdx,setEditIdx]= useState(null);
  const [del,    setDel]    = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const { show, Toast }     = useToast();

  const hc = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };
  const fyData = data.filter(j=>j.fy===fy);
  const rows   = fyData.filter(j =>
    (filter==="All"||j.status===filter) &&
    [j.client,j.id||"",j.siteLocation||"",j.turbine||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd  = () => { setForm({...BLANK}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    let id = form.id || await sheetsAPI.nextSerial("Jobs","JOB",fy);
    const row = buildJobRow({...form,id}, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("Jobs",form.rowIndex,row) : await sheetsAPI.append("Jobs",row);
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
    show(editIdx!==null?"Job updated":"Job saved to Sheets","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleDelete = async ({r}) => {
    setDel(null);
    const res = await sheetsAPI.softDelete("Jobs",r.rowIndex);
    show(res?.error?"Delete failed":"Job deleted",res?.error?"red":"green");
    onRefresh&&onRefresh();
  };

  const cols = [
    {key:"id",           label:"Job ID",      bold:true},
    {key:"client",       label:"Client",      bold:true},
    {key:"oemMake",      label:"OEM"},
    {key:"type",         label:"Type"},
    {key:"status",       label:"Status",      render:r=><Badge label={r.status} color={stageClr(r.status)}/>},
    {key:"poNo",         label:"PO No."},
    {key:"poValue",      label:"PO Value",    right:true, render:r=>r.poValue?fmt(r.poValue):"—", exportVal:r=>r.poValue||0},
    {key:"startDate",    label:"Start",       render:r=>fmtD(r.startDate),                        exportVal:r=>r.startDate},
    {key:"siteLocation", label:"Site"},
    {key:"estimatedValue",label:"Est. Value", right:true, render:r=>fmt(r.estimatedValue),         exportVal:r=>r.estimatedValue},
    {key:"invoiceStatus",label:"Invoice",     render:r=><Badge label={r.invoiceStatus||"—"} color={invClr(r.invoiceStatus)}/>},
    {key:"wa",           label:"WA",          render:r=>{ const cl=clients.find(c=>c.name===r.client); return cl?<WA mobile={cl.whatsapp||cl.mobile} msg={`Dear ${cl.contact}, Job ${r.id} — ${r.type} at ${r.siteLocation}. Status: ${r.status}. — Keshav Enterprises`}/>:"—"; }},
  ];

  return (
    <div>
      <SHdr title="⚙️ Job Register" action="+ New Job" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Jobs_"+fy,cols,rows)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        {STAGES.map(s=>{
          const col={Enquiry:T.slate,Scheduled:T.amber,"In Progress":T.gold,Completed:T.green,Invoiced:T.teal,Paid:"#1A7A4A"}[s];
          return <KPI key={s} icon="" label={s} value={fyData.filter(j=>j.status===s).length} color={col}/>;
        })}
      </div>
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — saves logged to console. Set VITE_API_URL to persist data."/>}
      <Pills options={["All",...STAGES].map(s=>({label:s,value:s,count:s==="All"?fyData.length:fyData.filter(j=>j.status===s).length}))} active={filter} onChange={setFilter}/>
      <Search value={search} onChange={setSearch} placeholder="Search by job ID, client, turbine or site..."/>
      <Tbl cols={cols} rows={rows} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No jobs for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete job ${del.r.id} (${del.r.client})?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}
      {modal&&(
        <Modal title={editIdx!==null?"Edit Job":"New Job"} subtitle={form.id} onClose={()=>setModal(false)} full>
          <FSec label="Client & Equipment"/>
          <G3>
            <F label="Client *"    name="client"  value={form.client}  onChange={hc} options={clients.map(c=>c.name)} required error={errors.client}/>
            <F label="Turbine *"   name="turbine" value={form.turbine} onChange={hc} required error={errors.turbine} placeholder="e.g. BHEL 500kW Steam Turbine"/>
            <F label="OEM Make"    name="oemMake" value={form.oemMake} onChange={hc} options={["Triveni","BHEL","Siemens","KKK","ABB","Man Turbo","Kirloskar","Elliott","Other"]}/>
          </G3>
          <G3>
            <F label="Capacity"    name="capacity" value={form.capacity} onChange={hc} placeholder="e.g. 3.5 MW"/>
            <F label="Job Type *"  name="type"     value={form.type}     onChange={hc} options={["Overhaul","Erection & Commissioning","Dynamic Balancing","Lube Oil Flushing","Alignment","Emergency Troubleshooting","Annual Maintenance","Inspection","Repair","Retrofitting"]} required error={errors.type}/>
            <F label="Status"      name="status"   value={form.status}   onChange={hc} options={STAGES}/>
          </G3>
          <FSec label="PO & Schedule"/>
          <G4>
            <F label="PO No."        name="poNo"          value={form.poNo}          onChange={hc}/>
            <F label="PO Date"       name="poDate"        type="date" value={form.poDate}        onChange={hc}/>
            <F label="PO Value (₹)"  name="poValue"       type="number" value={form.poValue}    onChange={hc}/>
            <F label="Est. Value (₹)" name="estimatedValue" type="number" value={form.estimatedValue} onChange={hc}/>
          </G4>
          <G3>
            <F label="Start Date"    name="startDate"      type="date" value={form.startDate}     onChange={hc}/>
            <F label="Completion"    name="completionDate" type="date" value={form.completionDate} onChange={hc}/>
            <F label="Site Location" name="siteLocation"  value={form.siteLocation}  onChange={hc}/>
          </G3>
          <G2>
            <F label="Site Engineer" name="siteEngineer" value={form.siteEngineer} onChange={hc}/>
            <F label="Assigned To"   name="assignedTo"   value={form.assignedTo}   onChange={hc} options={["Keshav Sharma","Site Team","Contractor"]}/>
          </G2>
          <FSec label="Technical"/>
          <G4>
            <F label="RPM"             name="rpm"              value={form.rpm}            onChange={hc}/>
            <F label="Lube Oil"        name="lubOilType"       value={form.lubOilType}     onChange={hc} options={["Mobil DTE 32","Mobil DTE 46","Shell Turbo T 32","Turbine Oil 46","Other"]}/>
            <F label="Last Overhaul"   name="lastOverhaulDate" type="date" value={form.lastOverhaulDate} onChange={hc}/>
            <F label="Warranty (mo.)"  name="warrantyPeriod"   type="number" value={form.warrantyPeriod}  onChange={hc}/>
          </G4>
          <FTxt label="Scope of Work" name="scopeOfWork" value={form.scopeOfWork} onChange={hc}/>
          <G2>
            <F label="Special Tools"   name="specialTools"      value={form.specialTools}      onChange={hc}/>
            <F label="Work Permit No." name="workPermitNo"      value={form.workPermitNo}      onChange={hc}/>
          </G2>
          <F label="Safety Requirements" name="safetyRequirements" value={form.safetyRequirements} onChange={hc}/>
          <FSec label="Charges"/>
          <G4>
            <F label="Labour (₹)"  name="labourCharges"   type="number" value={form.labourCharges}   onChange={hc}/>
            <F label="Material (₹)" name="materialCharges" type="number" value={form.materialCharges} onChange={hc}/>
            <F label="Travel (₹)"  name="travelCharges"   type="number" value={form.travelCharges}   onChange={hc}/>
            <F label="Other (₹)"   name="otherCharges"    type="number" value={form.otherCharges}    onChange={hc}/>
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
