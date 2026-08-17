import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildAttendanceRow } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Search, Pills, StatCard, ProgressBar, ConfirmModal, SaveStatus, useToast } from "../shared/ui.jsx";

const WORKER_TYPES = ["All","Regular","Overtime","Contract","Absent"];
const DESIGNATIONS = ["Supervisor","Engineer/Owner","Fitter","Welder","Turner","Helper","Contract Labour","Electrician"];
const BLANK = { workerName:"",designation:"Fitter",type:"Regular",date:today(),jobRef:"",siteLocation:"",hoursWorked:8,dailyRate:0,advanceDeducted:0,remarks:"" };
const RULES = [{ field:"workerName",label:"Worker Name",required:true },{ field:"date",label:"Date",required:true }];

export default function Attendance({ fy, user, onRefresh, data=[] }) {
  const [modal,   setModal]   = useState(false);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("All");
  const [dateFrom,setDateFrom]= useState("");
  const [dateTo,  setDateTo]  = useState("");
  const [form,    setForm]    = useState(BLANK);
  const [errors,  setErrors]  = useState({});
  const [saving,  setSaving]  = useState(false);
  const [status,  setStatus]  = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [del,     setDel]     = useState(null);
  const { show, Toast }       = useToast();

  const hc = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };

  const wages     = Math.round((+form.hoursWorked/8)*(+form.dailyRate));
  const netWages  = wages - (+form.advanceDeducted||0);

  const fyData = data.filter(r=>r.fy===fy);
  const filtered = fyData.filter(r=>
    (filter==="All" || r.type===filter) &&
    ((r.workerName||"").toLowerCase().includes(search.toLowerCase()) ||
     (r.jobRef||"").toLowerCase().includes(search.toLowerCase()) ||
     (r.siteLocation||"").toLowerCase().includes(search.toLowerCase())) &&
    (!dateFrom || r.date>=dateFrom) &&
    (!dateTo   || r.date<=dateTo)
  );

  const totalWages   = fyData.reduce((s,r)=>s+(+r.wages||0),0);
  const totalNet     = fyData.reduce((s,r)=>s+(+r.netWages||0),0);
  const totalAdvance = fyData.reduce((s,r)=>s+(+r.advanceDeducted||0),0);
  const uniqueWorkers= [...new Set(fyData.map(r=>r.workerName))].length;

  const workerSummary = fyData.reduce((acc,r)=>{
    if (!acc[r.workerName]) acc[r.workerName] = { days:0, hours:0, wages:0, advance:0, net:0 };
    acc[r.workerName].days += 1;
    acc[r.workerName].hours += (+r.hoursWorked||0);
    acc[r.workerName].wages += (+r.wages||0);
    acc[r.workerName].advance += (+r.advanceDeducted||0);
    acc[r.workerName].net += (+r.netWages||0);
    return acc;
  },{});

  const jobLabour = fyData.reduce((acc,r)=>{
    if (!r.jobRef) return acc;
    acc[r.jobRef] = (acc[r.jobRef]||0) + (+r.wages||0);
    return acc;
  },{});

  const openAdd  = () => { setForm({...BLANK,date:today()}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    let id = form.id || await sheetsAPI.nextSerial("Attendance","ATT",fy);
    const row = buildAttendanceRow({...form,id}, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("Attendance",form.rowIndex,row) : await sheetsAPI.append("Attendance",row);
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
    show(editIdx!==null?"Entry updated":"Attendance logged","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleDelete = async ({r}) => {
    setDel(null);
    const res = await sheetsAPI.softDelete("Attendance",r.rowIndex);
    show(res?.error?"Delete failed":"Entry deleted",res?.error?"red":"green");
    onRefresh&&onRefresh();
  };

  const cols = [
    { key:"id",           label:"Entry ID",    render:r=><span style={{ fontSize:11 }}>{r.id}</span> },
    { key:"date",         label:"Date",        render:r=>fmtD(r.date),   exportVal:r=>r.date },
    { key:"workerName",   label:"Worker",      bold:true },
    { key:"designation",  label:"Designation", render:r=><Badge label={r.designation} color="default" /> },
    { key:"type",         label:"Type",        render:r=><Badge label={r.type} color={r.type==="Regular"?"green":r.type==="Overtime"?"amber":r.type==="Contract"?"blue":"default"} /> },
    { key:"jobRef",       label:"Job Ref.",    render:r=><span style={{ fontSize:11, color:T.slate }}>{r.jobRef||"Workshop"}</span> },
    { key:"siteLocation", label:"Site" },
    { key:"hoursWorked",  label:"Hours",       right:true },
    { key:"dailyRate",    label:"Daily Rate",  right:true, render:r=>r.dailyRate?fmt(r.dailyRate):"—", exportVal:r=>r.dailyRate||0 },
    { key:"wages",        label:"Wages (₹)",   right:true, render:r=><span style={{ fontWeight:700, color:T.red }}>{fmt(r.wages)}</span>, exportVal:r=>r.wages||0 },
    { key:"advanceDeducted", label:"Advance (₹)", right:true, render:r=>r.advanceDeducted?<span style={{ color:T.amber, fontWeight:600 }}>{fmt(r.advanceDeducted)}</span>:"—", exportVal:r=>r.advanceDeducted||0 },
    { key:"netWages",     label:"Net (₹)",     right:true, render:r=><span style={{ fontWeight:800, color:T.navy }}>{fmt(r.netWages)}</span>, exportVal:r=>r.netWages||0 },
    { key:"remarks",      label:"Remarks",     render:r=><span style={{ fontSize:11, color:T.slate }}>{r.remarks||"—"}</span> },
  ];

  return (
    <div>
      <SHdr title="👷 Attendance & Labour Register" action="+ Log Attendance" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("Attendance_"+fy,cols,filtered)} />

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        <KPI icon="👷" label="Unique Workers"    value={uniqueWorkers}     color={T.navy} />
        <KPI icon="📋" label="Total Entries"     value={fyData.length}     color={T.navy} />
        <KPI icon="💰" label="Total Wages"       value={fmt(totalWages)}   color={T.red} />
        <KPI icon="💸" label="Advances Given"    value={fmt(totalAdvance)} color={T.amber} />
        <KPI icon="✅" label="Net Wages Paid"    value={fmt(totalNet)}     color={T.green} />
      </div>

      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — saves logged to console. Set VITE_API_URL to persist data."/>}

      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <Pills
          options={WORKER_TYPES.map(t=>({ label:t, value:t, count:t==="All"?fyData.length:fyData.filter(r=>r.type===t).length }))}
          active={filter} onChange={setFilter}
        />
        <div style={{ display:"flex", gap:6, marginLeft:"auto", alignItems:"center" }}>
          <span style={{ fontSize:11, color:T.slate, fontWeight:600 }}>From:</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ padding:"5px 9px", borderRadius:8, border:`1.5px solid ${T.border}`, fontSize:12, outline:"none" }} />
          <span style={{ fontSize:11, color:T.slate, fontWeight:600 }}>To:</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ padding:"5px 9px", borderRadius:8, border:`1.5px solid ${T.border}`, fontSize:12, outline:"none" }} />
        </div>
      </div>

      <Search value={search} onChange={setSearch} placeholder="Search by worker, job, or site..." />

      <Tbl cols={cols} rows={filtered} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No attendance entries for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete attendance entry for ${del.r.workerName} on ${fmtD(del.r.date)}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:20 }}>
        <div>
          <h3 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:T.navy }}>👷 Worker-wise Summary</h3>
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:T.navy }}>
                {["Worker","Days","Hours","Wages","Advance","Net"].map(h=>(
                  <th key={h} style={{ padding:"8px 10px", color:T.white, fontWeight:700, fontSize:11, textAlign:h==="Worker"?"left":"right" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {Object.entries(workerSummary).map(([name,s],i)=>(
                  <tr key={name} style={{ background:i%2===0?T.white:T.light }}>
                    <td style={{ padding:"7px 10px", fontWeight:600 }}>{name}</td>
                    <td style={{ padding:"7px 10px", textAlign:"right" }}>{s.days}</td>
                    <td style={{ padding:"7px 10px", textAlign:"right" }}>{s.hours}</td>
                    <td style={{ padding:"7px 10px", textAlign:"right", color:T.red, fontWeight:700, fontFamily:"monospace" }}>{fmt(s.wages)}</td>
                    <td style={{ padding:"7px 10px", textAlign:"right", color:T.amber, fontFamily:"monospace" }}>{s.advance?fmt(s.advance):"—"}</td>
                    <td style={{ padding:"7px 10px", textAlign:"right", fontWeight:800, color:T.navy, fontFamily:"monospace" }}>{fmt(s.net)}</td>
                  </tr>
                ))}
                <tr style={{ background:T.navy }}>
                  <td colSpan={3} style={{ padding:"8px 10px", fontWeight:700, color:T.white }}>TOTAL</td>
                  <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:800, color:T.gold, fontFamily:"monospace" }}>{fmt(totalWages)}</td>
                  <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:800, color:T.gold, fontFamily:"monospace" }}>{fmt(totalAdvance)}</td>
                  <td style={{ padding:"8px 10px", textAlign:"right", fontWeight:800, color:T.gold, fontFamily:"monospace" }}>{fmt(totalNet)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:T.navy }}>⚙️ Job-wise Labour Cost</h3>
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, overflow:"hidden" }}>
            {Object.entries(jobLabour).sort((a,b)=>b[1]-a[1]).map(([job,amt],i)=>(
              <div key={job} style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}`, background:i%2===0?T.white:T.light }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:T.navy }}>{job}</span>
                  <span style={{ fontSize:12, fontWeight:800, color:T.red, fontFamily:"monospace" }}>{fmt(amt)}</span>
                </div>
                <ProgressBar value={amt} max={totalWages||1} color={T.red} showPct={true} />
              </div>
            ))}
            <div style={{ padding:"10px 14px", background:"#F0F4FB", display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, fontWeight:700 }}>Workshop / General</span>
              <span style={{ fontSize:12, fontWeight:800, color:T.slate, fontFamily:"monospace" }}>
                {fmt(fyData.filter(r=>!r.jobRef).reduce((s,r)=>s+(+r.wages||0),0))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <Modal title={editIdx!==null?"Edit Attendance":"Log Attendance / Labour"} onClose={()=>setModal(false)} wide>
          <FSec label="Worker Details" />
          <G3>
            <F label="Worker Name *"  name="workerName"   value={form.workerName}   onChange={hc} placeholder="Full name" required error={errors.workerName} />
            <F label="Designation"    name="designation"  value={form.designation}  onChange={hc} options={DESIGNATIONS} />
            <F label="Type"           name="type"         value={form.type}         onChange={hc} options={["Regular","Overtime","Contract","Absent"]} />
          </G3>

          <FSec label="Date & Assignment" />
          <G3>
            <F label="Date *"         name="date"         type="date" value={form.date}    onChange={hc} required error={errors.date} />
            <F label="Job Reference"  name="jobRef"       value={form.jobRef}       onChange={hc}
               options={["","KE-JOB-2026-041","KE-JOB-2026-042","KE-JOB-2026-043","KE-JOB-2026-044","KE-JOB-2026-045"]} />
            <F label="Site Location"  name="siteLocation" value={form.siteLocation} onChange={hc} placeholder="Plant name / Workshop" />
          </G3>

          <FSec label="Hours & Wages" />
          <G4>
            <F label="Hours Worked"      name="hoursWorked"      type="number" value={form.hoursWorked}      onChange={hc} />
            <F label="Daily Rate (₹)"    name="dailyRate"         type="number" value={form.dailyRate}         onChange={hc} />
            <F label="Advance Deducted (₹)" name="advanceDeducted" type="number" value={form.advanceDeducted} onChange={hc} />
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:T.navy, marginBottom:4 }}>Net Wages (auto)</label>
              <div style={{ padding:"8px 10px", borderRadius:8, background:"#D5F5E3", fontWeight:800, color:T.green, fontFamily:"monospace", fontSize:13 }}>{fmt(netWages)}</div>
            </div>
          </G4>

          <div style={{ background:T.navy, borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
            <div style={{ color:T.gold, fontSize:11, fontWeight:700, marginBottom:6 }}>WAGE CALCULATION</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {[["Hours",form.hoursWorked],[`Daily Rate`,fmt(form.dailyRate||0)],[`Gross Wages`,fmt(wages)],[`Net (after advance)`,fmt(netWages)]].map(([l,v])=>(
                <div key={l} style={{ background:"rgba(255,255,255,.1)", borderRadius:8, padding:"7px 10px", textAlign:"center" }}>
                  <div style={{ color:"rgba(255,255,255,.6)", fontSize:9, marginBottom:2 }}>{l}</div>
                  <div style={{ color:T.white, fontWeight:800, fontFamily:"monospace", fontSize:12 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <F label="Remarks" name="remarks" value={form.remarks} onChange={hc} />
          {status&&<SaveStatus status={status}/>}
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
