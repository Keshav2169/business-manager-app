import { useState } from "react";
import { T, OPT } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildAssetRow } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Search, Pills, StatCard, ProgressBar, ConfirmModal, SaveStatus, useToast } from "../shared/ui.jsx";

const DEP_SCHEDULE_YEARS = 5;
const BLANK = { name:"", category:"", location:"", vendor:"", purchaseDate:"", invoiceNo:"", cost:0, installCost:0, usefulLife:10, depRate:15, status:"Active", insuranceExpiry:"", amc:"No", serialNo:"", remarks:"" };
const RULES = [{ field:"name",label:"Asset Name",required:true },{ field:"category",label:"Category",required:true },{ field:"purchaseDate",label:"Purchase Date",required:true },{ field:"cost",label:"Asset Cost",required:true }];

export default function FixedAssets({ fy, user, onRefresh, data=[] }) {
  const [modal,  setModal]  = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [viewAsset, setViewAsset] = useState(null);
  const [form, setForm]     = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [editIdx,setEditIdx]= useState(null);
  const [del,    setDel]    = useState(null);
  const { show, Toast }     = useToast();

  const hc = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };

  // Fixed Assets are typically bought once and tracked across FYs (not re-filed
  // every year like Jobs/Invoices), so unlike other modules this register shows
  // ALL assets regardless of `fy`, not just the ones added in the selected FY.
  const totalCost    = data.reduce((s,a)=>s+(+a.totalCost||0),0);
  const totalAccumDep= data.reduce((s,a)=>s+(+a.accumDep||0),0);
  const totalBookVal = data.reduce((s,a)=>s+(+a.bookValue||0),0);
  const totalAnnDep  = data.reduce((s,a)=>s+(+a.annualDep||0),0);
  const activeAssets = data.filter(a=>a.status==="Active");

  const filtered = data.filter(a=>
    (filter==="All" || a.category===filter || a.status===filter) &&
    ((a.name||"").toLowerCase().includes(search.toLowerCase()) ||
     (a.code||"").toLowerCase().includes(search.toLowerCase()))
  );

  const catSummary = data.reduce((acc,a)=>{
    if (!acc[a.category]) acc[a.category] = { count:0, cost:0, bookVal:0 };
    acc[a.category].count++;
    acc[a.category].cost    += (+a.totalCost||0);
    acc[a.category].bookVal += (+a.bookValue||0);
    return acc;
  },{});

  const totalCostForm = (+form.cost||0)+(+form.installCost||0);
  const annDepForm    = Math.round(totalCostForm*(+form.depRate||0)/100);

  const filterOptions = [
    { label:"All",         value:"All",          count:data.length },
    { label:"Active",      value:"Active",        count:data.filter(a=>a.status==="Active").length },
    { label:"Written Off", value:"Written Off",   count:data.filter(a=>a.status==="Written Off").length },
    ...Object.keys(catSummary).map(c=>({ label:c, value:c, count:catSummary[c].count })),
  ];

  const openAdd  = () => { setForm({...BLANK,purchaseDate:today()}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    let code = form.code || await sheetsAPI.nextSerial("Fixed Assets","FA",fy);
    const row = buildAssetRow({...form,code}, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("Fixed Assets",form.rowIndex,row) : await sheetsAPI.append("Fixed Assets",row);
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
    show(editIdx!==null?"Asset updated":"Asset added","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleDelete = async ({r}) => {
    setDel(null);
    const res = await sheetsAPI.softDelete("Fixed Assets",r.rowIndex);
    show(res?.error?"Delete failed":"Asset deleted",res?.error?"red":"green");
    onRefresh&&onRefresh();
  };

  const cols = [
    { key:"code",          label:"Code",           bold:true, render:r=><span style={{ fontSize:11,color:T.navy,fontWeight:700 }}>{r.code}</span> },
    { key:"name",          label:"Asset Name",     bold:true, render:r=>(
      <button onClick={()=>setViewAsset(r)} style={{ background:"none",border:"none",cursor:"pointer",fontWeight:700,color:T.navy,textDecoration:"underline",fontSize:12,textAlign:"left" }}>{r.name}</button>
    )},
    { key:"category",      label:"Category",       render:r=><Badge label={r.category} color="default" /> },
    { key:"location",      label:"Location" },
    { key:"purchaseDate",  label:"Purchased",      render:r=>fmtD(r.purchaseDate), exportVal:r=>r.purchaseDate },
    { key:"totalCost",     label:"Total Cost",     right:true, render:r=>fmt(r.totalCost) },
    { key:"depRate",       label:"Dep.%",          right:true, render:r=><span style={{ color:T.amber }}>{r.depRate}%</span> },
    { key:"annualDep",     label:"Annual Dep.",    right:true, render:r=>fmt(r.annualDep) },
    { key:"accumDep",      label:"Accum. Dep.",    right:true, render:r=><span style={{ color:T.red }}>{fmt(r.accumDep)}</span> },
    { key:"bookValue",     label:"Book Value",     right:true, render:r=><span style={{ fontWeight:800,color:r.bookValue<=0?T.red:T.green }}>{fmt(r.bookValue)}</span> },
    { key:"status",        label:"Status",         render:r=><Badge label={r.status} color={r.status==="Active"?"green":r.status==="Written Off"?"red":"amber"} /> },
    { key:"insuranceExpiry",label:"Insurance Exp.", render:r=>r.insuranceExpiry?<span style={{ color:new Date(r.insuranceExpiry)<new Date()?T.red:T.dark }}>{fmtD(r.insuranceExpiry)}</span>:"—" },
    { key:"amc",           label:"AMC",            render:r=><Badge label={r.amc} color={r.amc==="No"?"default":"green"} /> },
  ];

  return (
    <div>
      <SHdr title="🏗️ Fixed Asset Register" action="+ Add Asset" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("FixedAssets",cols,filtered)} />

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        <KPI icon="🏗️" label="Total Assets"       value={data.length}  color={T.navy} />
        <KPI icon="✅" label="Active"              value={activeAssets.length} color={T.green} />
        <KPI icon="💰" label="Gross Block"         value={fmt(totalCost)}      color={T.navy} sub="Total cost incl. installation" />
        <KPI icon="📉" label="Accum. Depreciation" value={fmt(totalAccumDep)}  color={T.red} />
        <KPI icon="📊" label="Net Book Value"       value={fmt(totalBookVal)}   color={T.green} />
        <KPI icon="🗓️" label="Annual Dep. (FY)"    value={fmt(totalAnnDep)}    color={T.amber} sub="Charges this financial year" />
      </div>

      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — saves logged to console. Set VITE_API_URL to persist data."/>}
      <Alert type="amber" icon="ℹ️"
        msg="Depreciation as per Companies Act 2013 Schedule II (SLM method). Consult CA for WDV method under Income Tax Act."
        sub="Assets with zero book value should be written off from the register. Note: editing an asset recalculates this year's depreciation but does not carry forward prior years' accumulated depreciation automatically — update Accum. Dep. manually if editing an existing asset." />

      <Pills options={filterOptions} active={filter} onChange={setFilter} />
      <Search value={search} onChange={setSearch} placeholder="Search by asset name or code..." />

      <Tbl cols={cols} rows={filtered} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg="No fixed assets recorded yet"/>
      {del&&<ConfirmModal msg={`Delete asset ${del.r.name} (${del.r.code})?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      <div style={{ marginTop:20 }}>
        <h3 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:T.navy }}>Category-wise Asset Summary</h3>
        <div style={{ overflowX:"auto", borderRadius:10, border:`1px solid ${T.border}` }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr style={{ background:T.navy }}>
              {["Category","Assets","Gross Cost","Net Book Value","% of Total"].map(h=>(
                <th key={h} style={{ padding:"9px 12px", color:T.white, fontWeight:700, fontSize:11, textAlign:h==="Category"?"left":"right" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {Object.entries(catSummary).map(([cat,d],i)=>(
                <tr key={cat} style={{ background:i%2===0?T.white:T.light }}>
                  <td style={{ padding:"8px 12px", fontWeight:600 }}>{cat}</td>
                  <td style={{ padding:"8px 12px", textAlign:"right" }}>{d.count}</td>
                  <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"monospace" }}>{fmt(d.cost)}</td>
                  <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:T.green }}>{fmt(d.bookVal)}</td>
                  <td style={{ padding:"8px 12px", textAlign:"right" }}>{totalCost?Math.round(d.cost/totalCost*100):0}%</td>
                </tr>
              ))}
              <tr style={{ background:T.navy }}>
                <td style={{ padding:"9px 12px", fontWeight:700, color:T.white }}>TOTAL</td>
                <td style={{ padding:"9px 12px", textAlign:"right", color:T.white, fontWeight:700 }}>{data.length}</td>
                <td style={{ padding:"9px 12px", textAlign:"right", color:T.gold, fontWeight:800, fontFamily:"monospace" }}>{fmt(totalCost)}</td>
                <td style={{ padding:"9px 12px", textAlign:"right", color:T.gold, fontWeight:800, fontFamily:"monospace" }}>{fmt(totalBookVal)}</td>
                <td style={{ padding:"9px 12px", textAlign:"right", color:T.white }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {viewAsset && (
        <Modal title={viewAsset.name} subtitle={viewAsset.code} onClose={()=>setViewAsset(null)} wide>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
            {[
              ["Asset Code",     viewAsset.code],
              ["Category",       viewAsset.category],
              ["Location",       viewAsset.location],
              ["Vendor / Source",viewAsset.vendor],
              ["Purchase Date",  fmtD(viewAsset.purchaseDate)],
              ["Invoice No.",    viewAsset.invoiceNo],
              ["Asset Cost",     fmt(viewAsset.cost)],
              ["Install Cost",   fmt(viewAsset.installCost)],
              ["Total Cost",     fmt(viewAsset.totalCost)],
              ["Useful Life",    viewAsset.usefulLife+" years"],
              ["Dep. Rate (SLM)",viewAsset.depRate+"%"],
              ["Annual Dep.",    fmt(viewAsset.annualDep)],
              ["Accum. Dep.",    fmt(viewAsset.accumDep)],
              ["Net Book Value", fmt(viewAsset.bookValue)],
              ["Serial No.",     viewAsset.serialNo||"—"],
              ["Status",         viewAsset.status],
              ["Insurance Exp.", viewAsset.insuranceExpiry?fmtD(viewAsset.insuranceExpiry):"—"],
              ["AMC / Warranty", viewAsset.amc],
            ].map(([l,v])=>(
              <div key={l} style={{ background:T.light, borderRadius:8, padding:"7px 11px" }}>
                <div style={{ fontSize:10, color:T.slate, fontWeight:700, marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:600, color:T.dark }}>{v}</div>
              </div>
            ))}
          </div>
          <h4 style={{ margin:"0 0 8px", fontSize:13, color:T.navy }}>Depreciation Schedule (next {DEP_SCHEDULE_YEARS} years)</h4>
          <div style={{ overflowX:"auto", borderRadius:10, border:`1px solid ${T.border}` }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:T.navy }}>
                {["Year","Opening Value","Dep. Charge","Closing Value"].map(h=>(
                  <th key={h} style={{ padding:"8px 12px", color:T.white, fontWeight:700, textAlign:"right" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {Array.from({length:DEP_SCHEDULE_YEARS}).map((_,i)=>{
                  const open  = Math.max(0, (+viewAsset.bookValue||0) - i*(+viewAsset.annualDep||0));
                  const dep   = Math.min(open, (+viewAsset.annualDep||0));
                  const close = Math.max(0, open-dep);
                  const yr    = new Date().getFullYear()+i;
                  return (
                    <tr key={i} style={{ background:i%2===0?T.white:T.light }}>
                      <td style={{ padding:"7px 12px", textAlign:"right", fontWeight:600 }}>FY {yr}-{String(yr+1).slice(2)}</td>
                      <td style={{ padding:"7px 12px", textAlign:"right", fontFamily:"monospace" }}>{fmt(open)}</td>
                      <td style={{ padding:"7px 12px", textAlign:"right", fontFamily:"monospace", color:T.red }}>{fmt(dep)}</td>
                      <td style={{ padding:"7px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:close===0?T.red:T.green }}>{fmt(close)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {viewAsset.remarks && (
            <div style={{ background:T.light, borderRadius:8, padding:"9px 13px", marginTop:10, fontSize:12, color:T.slate }}>📝 {viewAsset.remarks}</div>
          )}
        </Modal>
      )}

      {modal && (
        <Modal title={editIdx!==null?"Edit Fixed Asset":"Add Fixed Asset"} onClose={()=>setModal(false)} full>
          <FSec label="Asset Details" />
          <G3>
            <F label="Asset Name *"    name="name"     value={form.name}     onChange={hc} required error={errors.name} />
            <F label="Category *"      name="category" value={form.category} onChange={hc} options={OPT.assetCats} required error={errors.category} />
            <F label="Location"        name="location" value={form.location} onChange={hc} placeholder="Workshop / Office / Site" />
          </G3>
          <G3>
            <F label="Vendor / Source" name="vendor"      value={form.vendor}      onChange={hc} />
            <F label="Purchase Date *" name="purchaseDate" type="date" value={form.purchaseDate} onChange={hc} required error={errors.purchaseDate} />
            <F label="Invoice / Bill No." name="invoiceNo" value={form.invoiceNo}  onChange={hc} />
          </G3>
          <G2>
            <F label="Serial No."      name="serialNo" value={form.serialNo} onChange={hc} />
            <F label="Status"          name="status"   value={form.status}   onChange={hc} options={["Active","Under Repair","Disposed","Written Off"]} />
          </G2>

          <FSec label="Cost & Depreciation" sub="As per Companies Act 2013 Schedule II (SLM)" />
          <G4>
            <F label="Asset Cost (₹) *"     name="cost"        type="number" value={form.cost}        onChange={hc} required error={errors.cost} />
            <F label="Installation Cost (₹)" name="installCost" type="number" value={form.installCost} onChange={hc} />
            <F label="Useful Life (Years)"   name="usefulLife"  type="number" value={form.usefulLife}  onChange={hc} />
            <F label="Depreciation Rate %"   name="depRate"     type="number" value={form.depRate}     onChange={hc} />
          </G4>

          <div style={{ background:T.navy, borderRadius:10, padding:"11px 14px", marginBottom:14 }}>
            <div style={{ color:T.gold, fontWeight:700, fontSize:11, marginBottom:6 }}>DEPRECIATION PREVIEW</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {[
                ["Total Cost",    fmt(totalCostForm)],
                ["Annual Dep.",   fmt(annDepForm)],
                ["Monthly Dep.",  fmt(Math.round(annDepForm/12))],
                ["Life (yrs)",    form.usefulLife||"—"],
              ].map(([l,v])=>(
                <div key={l} style={{ background:"rgba(255,255,255,.1)", borderRadius:8, padding:"7px 10px", textAlign:"center" }}>
                  <div style={{ color:"rgba(255,255,255,.6)", fontSize:9, marginBottom:2 }}>{l}</div>
                  <div style={{ color:T.white, fontWeight:800, fontFamily:"monospace", fontSize:12 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <FSec label="Insurance & Maintenance" />
          <G3>
            <F label="Insurance Expiry" name="insuranceExpiry" type="date" value={form.insuranceExpiry} onChange={hc} />
            <F label="AMC / Warranty"   name="amc"             value={form.amc}    onChange={hc} options={["No","Yes — annual","Yes — biennial","Warranty only"]} />
            <F label="Remarks"          name="remarks"          value={form.remarks} onChange={hc} />
          </G3>
          {status&&<SaveStatus status={status}/>}
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
