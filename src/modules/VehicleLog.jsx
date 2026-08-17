import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildVehicleRow } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Search, Pills, ProgressBar, StatCard, ConfirmModal, SaveStatus, useToast } from "../shared/ui.jsx";

const VEHICLES = ["Tata Pickup — UP-11 AX XXXX", "Workshop Van (if any)", "Own Car"];
const DRIVERS   = ["Keshav Sharma","Ramesh Kumar","Suresh Yadav","Contract Driver"];
const PURPOSES  = ["Site Visit","Material Pickup","Client Meeting","Office Work","Bank/Govt Work","Personal","Other"];
const BLANK = { date:today(), vehicle:VEHICLES[0], driver:"", purpose:"Site Visit", jobRef:"", destination:"", odometerStart:0, odometerEnd:0, fuelL:0, fuelCost:0, toll:0, remarks:"" };
const RULES = [{ field:"destination",label:"Destination",required:true },{ field:"date",label:"Date",required:true }];

export default function VehicleLog({ fy, user, onRefresh, data=[] }) {
  const [modal,  setModal]  = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [form,   setForm]   = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [editIdx,setEditIdx]= useState(null);
  const [del,    setDel]    = useState(null);
  const { show, Toast }     = useToast();

  const hc = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };

  const km         = Math.max(0, (+form.odometerEnd)-(+form.odometerStart));
  const totalCost  = (+form.fuelCost||0)+(+form.toll||0);
  const costPerKm  = km > 0 ? (totalCost/km).toFixed(1) : 0;
  const efficiency = (+form.fuelL>0&&km>0) ? (km/+form.fuelL).toFixed(1) : 0;

  const fyData = data.filter(r=>r.fy===fy);
  const filtered = fyData.filter(r=>
    (filter==="All" || r.purpose===filter) &&
    ((r.destination||"").toLowerCase().includes(search.toLowerCase()) ||
     (r.driver||"").toLowerCase().includes(search.toLowerCase()) ||
     (r.jobRef||"").toLowerCase().includes(search.toLowerCase()))
  );

  const totalKm      = fyData.reduce((s,r)=>s+(+r.km||0),0);
  const totalFuelCost= fyData.reduce((s,r)=>s+(+r.fuelCost||0),0);
  const totalToll    = fyData.reduce((s,r)=>s+(+r.toll||0),0);
  const totalFuelL   = fyData.reduce((s,r)=>s+(+r.fuelL||0),0);
  const avgEfficiency= totalFuelL>0?(totalKm/totalFuelL).toFixed(1):0;
  const avgCostPerKm = totalKm>0?((totalFuelCost+totalToll)/totalKm).toFixed(1):0;

  const currentOdo = fyData.length > 0 ? Math.max(...fyData.map(r=>+r.odometerEnd||0)) : 0;

  const purposeBreak = fyData.reduce((acc,r)=>{
    acc[r.purpose] = (acc[r.purpose]||0) + (+r.km||0);
    return acc;
  },{});

  const jobBreak = fyData.filter(r=>r.jobRef).reduce((acc,r)=>{
    if (!acc[r.jobRef]) acc[r.jobRef] = { km:0, cost:0 };
    acc[r.jobRef].km   += (+r.km||0);
    acc[r.jobRef].cost += (+r.fuelCost||0) + (+r.toll||0);
    return acc;
  },{});

  const monthlyFuel = fyData.reduce((acc,r)=>{
    const m = new Date(r.date).toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
    acc[m] = (acc[m]||0) + (+r.fuelCost||0) + (+r.toll||0);
    return acc;
  },{});

  const filterOptions = ["All",...new Set(fyData.map(r=>r.purpose))];

  const openAdd  = () => { setForm({...BLANK,date:today()}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    let logId = form.logId || await sheetsAPI.nextSerial("Vehicles","VL",fy);
    const row = buildVehicleRow({...form,logId}, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("Vehicles",form.rowIndex,row) : await sheetsAPI.append("Vehicles",row);
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
    show(editIdx!==null?"Trip updated":"Trip logged","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleDelete = async ({r}) => {
    setDel(null);
    const res = await sheetsAPI.softDelete("Vehicles",r.rowIndex);
    show(res?.error?"Delete failed":"Trip deleted",res?.error?"red":"green");
    onRefresh&&onRefresh();
  };

  const cols = [
    { key:"id",           label:"Log ID",        render:r=><span style={{ fontSize:11 }}>{r.logId}</span> },
    { key:"date",         label:"Date",           render:r=>fmtD(r.date), exportVal:r=>r.date },
    { key:"vehicle",      label:"Vehicle",        render:r=><span style={{ fontSize:11 }}>{(r.vehicle||"").split("—")[0]}</span> },
    { key:"driver",       label:"Driver" },
    { key:"purpose",      label:"Purpose",        render:r=><Badge label={r.purpose} color={r.purpose==="Site Visit"?"blue":r.purpose==="Material Pickup"?"amber":"default"} /> },
    { key:"jobRef",       label:"Job",            render:r=><span style={{ fontSize:11, color:T.slate }}>{r.jobRef||"—"}</span> },
    { key:"destination",  label:"Destination" },
    { key:"odometerStart",label:"Odom. Start",    right:true, render:r=>(+r.odometerStart||0).toLocaleString("en-IN") },
    { key:"odometerEnd",  label:"Odom. End",      right:true, render:r=>(+r.odometerEnd||0).toLocaleString("en-IN") },
    { key:"km",           label:"Km",             right:true, render:r=><span style={{ fontWeight:700 }}>{r.km}</span> },
    { key:"fuelL",        label:"Fuel (L)",       right:true, render:r=>(+r.fuelL||0).toFixed(1) },
    { key:"fuelCost",     label:"Fuel (₹)",       right:true, render:r=>fmt(r.fuelCost) },
    { key:"toll",         label:"Toll (₹)",       right:true, render:r=>r.toll?fmt(r.toll):"—" },
    { key:"total",        label:"Total Cost",     right:true, render:r=><span style={{ fontWeight:800, color:T.red }}>{fmt((+r.fuelCost||0)+(+r.toll||0))}</span>, exportVal:r=>(+r.fuelCost||0)+(+r.toll||0) },
    { key:"eff",          label:"km/L",           right:true, render:r=><span style={{ color:T.green }}>{r.fuelL>0?(r.km/r.fuelL).toFixed(1):"—"}</span> },
  ];

  return (
    <div>
      <SHdr title="🚗 Vehicle & Travel Log" action="+ Log Trip" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("VehicleLog_"+fy,cols,filtered)} />

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        <KPI icon="🚗" label="Total Trips"      value={fyData.length} color={T.navy} />
        <KPI icon="📍" label="Total Km"         value={`${totalKm.toLocaleString("en-IN")} km`} color={T.navy} />
        <KPI icon="⛽" label="Fuel Cost"        value={fmt(totalFuelCost)}  color={T.red} />
        <KPI icon="🛣️" label="Toll / Parking"  value={fmt(totalToll)}      color={T.amber} />
        <KPI icon="💰" label="Total Travel Cost" value={fmt(totalFuelCost+totalToll)} color={T.red} />
        <KPI icon="📊" label="Fuel Efficiency"  value={`${avgEfficiency} km/L`} color={T.green} />
        <KPI icon="💸" label="Cost per Km"      value={`₹${avgCostPerKm}/km`}  color={T.amber} />
      </div>

      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — saves logged to console. Set VITE_API_URL to persist data."/>}

      <div style={{ background:T.navy, borderRadius:12, padding:"12px 18px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:11, fontWeight:600 }}>CURRENT ODOMETER — Tata Pickup</div>
          <div style={{ color:T.white, fontWeight:900, fontSize:22, fontFamily:"monospace" }}>{currentOdo.toLocaleString("en-IN")} km</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:11 }}>This FY ({fy})</div>
          <div style={{ color:T.gold, fontWeight:700, fontSize:16 }}>{totalKm.toLocaleString("en-IN")} km driven</div>
          <div style={{ color:"rgba(255,255,255,.5)", fontSize:11 }}>{totalFuelL.toFixed(1)} L fuel consumed</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {filterOptions.map(p=>(
          <button key={p} onClick={()=>setFilter(p)} style={{ padding:"5px 12px", borderRadius:20, border:"none", cursor:"pointer", background:filter===p?T.navy:"#E8ECF2", color:filter===p?T.white:T.slate, fontWeight:700, fontSize:11 }}>
            {p} ({p==="All"?fyData.length:fyData.filter(r=>r.purpose===p).length})
          </button>
        ))}
      </div>

      <Search value={search} onChange={setSearch} placeholder="Search by destination, driver, or job..." />

      <Tbl cols={cols} rows={filtered} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No trips logged for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete trip to ${del.r.destination} on ${fmtD(del.r.date)}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginTop:20 }}>
        <div>
          <h3 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:T.navy }}>Purpose-wise Km</h3>
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:14 }}>
            {Object.entries(purposeBreak).sort((a,b)=>b[1]-a[1]).map(([purpose,km])=>(
              <div key={purpose} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:11, color:T.dark }}>{purpose}</span>
                  <span style={{ fontSize:11, fontWeight:700 }}>{km} km</span>
                </div>
                <ProgressBar value={km} max={totalKm||1} color={T.navy} showPct={true} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:T.navy }}>Job-wise Travel Cost</h3>
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, overflow:"hidden" }}>
            {Object.entries(jobBreak).map(([job,d],i)=>(
              <div key={job} style={{ padding:"9px 14px", borderBottom:`1px solid ${T.border}`, background:i%2===0?T.white:T.light }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:12, fontWeight:600, color:T.navy }}>{job}</span>
                  <span style={{ fontSize:12, fontWeight:800, color:T.red, fontFamily:"monospace" }}>{fmt(d.cost)}</span>
                </div>
                <div style={{ fontSize:10, color:T.slate, marginTop:2 }}>{d.km} km covered</div>
              </div>
            ))}
            <div style={{ padding:"9px 14px", background:"#F0F4FB", display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, fontWeight:700 }}>General / Office</span>
              <span style={{ fontSize:12, fontWeight:700, color:T.slate, fontFamily:"monospace" }}>
                {fmt(fyData.filter(r=>!r.jobRef).reduce((s,r)=>s+(+r.fuelCost||0)+(+r.toll||0),0))}
              </span>
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:T.navy }}>Monthly Fuel Spend</h3>
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:14 }}>
            {Object.entries(monthlyFuel).map(([mon,cost])=>(
              <div key={mon} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:11 }}>{mon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:T.amber }}>{fmt(cost)}</span>
                </div>
                <ProgressBar value={cost} max={Math.max(...Object.values(monthlyFuel))||1} color={T.amber} showPct={false} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal && (
        <Modal title={editIdx!==null?"Edit Trip":"Log Vehicle Trip"} onClose={()=>setModal(false)} wide>
          <FSec label="Trip Details" />
          <G3>
            <F label="Date *"     name="date"    type="date" value={form.date}    onChange={hc} required error={errors.date} />
            <F label="Vehicle *"  name="vehicle" value={form.vehicle} onChange={hc} options={VEHICLES} />
            <F label="Driver"     name="driver"  value={form.driver}  onChange={hc} options={DRIVERS} />
          </G3>
          <G3>
            <F label="Purpose"      name="purpose"     value={form.purpose}     onChange={hc} options={PURPOSES} />
            <F label="Job Reference" name="jobRef"     value={form.jobRef}      onChange={hc}
               options={["","KE-JOB-2026-041","KE-JOB-2026-042","KE-JOB-2026-043","KE-JOB-2026-044","KE-JOB-2026-045"]} />
            <F label="Destination"  name="destination" value={form.destination} onChange={hc} placeholder="Where was the trip to?" required error={errors.destination} />
          </G3>

          <FSec label="Odometer & Fuel" />
          <G4>
            <F label="Odometer Start (km)" name="odometerStart" type="number" value={form.odometerStart} onChange={hc} />
            <F label="Odometer End (km)"   name="odometerEnd"   type="number" value={form.odometerEnd}   onChange={hc} />
            <F label="Fuel Filled (L)"     name="fuelL"     type="number" value={form.fuelL}     onChange={hc} />
            <F label="Fuel Cost (₹)"       name="fuelCost"  type="number" value={form.fuelCost}  onChange={hc} />
          </G4>
          <G2>
            <F label="Toll / Parking (₹)" name="toll"    type="number" value={form.toll}    onChange={hc} />
            <F label="Remarks"             name="remarks" value={form.remarks} onChange={hc} />
          </G2>

          <div style={{ background:T.navy, borderRadius:10, padding:"11px 14px", marginBottom:14 }}>
            <div style={{ color:T.gold, fontWeight:700, fontSize:11, marginBottom:6 }}>TRIP SUMMARY</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {[
                ["Km Covered", `${km} km`],
                ["Fuel Efficiency", `${efficiency} km/L`],
                ["Total Cost", fmt(totalCost)],
                ["Cost / Km", `₹${costPerKm}/km`],
              ].map(([l,v])=>(
                <div key={l} style={{ background:"rgba(255,255,255,.1)", borderRadius:8, padding:"7px 10px", textAlign:"center" }}>
                  <div style={{ color:"rgba(255,255,255,.6)", fontSize:9, marginBottom:2 }}>{l}</div>
                  <div style={{ color:T.white, fontWeight:800, fontFamily:"monospace", fontSize:12 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {status&&<SaveStatus status={status}/>}
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
