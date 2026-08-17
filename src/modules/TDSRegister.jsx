import { useState } from "react";
import { T, OPT } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildTDSRow } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, Pills, Search, StatCard, ConfirmModal, SaveStatus, useToast } from "../shared/ui.jsx";

const TDS_SECTIONS = [
  { code:"194C", desc:"Contractors & Sub-contractors", rate:"1% (Individual) / 2% (Company)", nature:"Contract payments" },
  { code:"194J", desc:"Professional / Technical Services", rate:"10%", nature:"CA, legal, consultant fees" },
  { code:"194I", desc:"Rent", rate:"10% (Plant & Machinery) / 10% (Land & Building)", nature:"Office / equipment rent" },
  { code:"194H", desc:"Commission / Brokerage", rate:"5%", nature:"Commission payments" },
  { code:"194A", desc:"Interest (other than bank)", rate:"10%", nature:"Interest on loans" },
  { code:"192B", desc:"Salary", rate:"Slab rates", nature:"Employee salaries" },
];

const QUARTERS = ["Q1 (Apr-Jun)","Q2 (Jul-Sep)","Q3 (Oct-Dec)","Q4 (Jan-Mar)"];
const BLANK = { date:today(), type:"Deducted", party:"", pan:"", nature:"", section:"194C", amount:0, rate:2, quarter:"Q1 (Apr-Jun)", challan:"", depositDate:"", status:"Pending", remarks:"" };
const RULES = [{ field:"party",label:"Party Name",required:true },{ field:"nature",label:"Nature of Payment",required:true }];

export default function TDSRegister({ fy, user, onRefresh, data=[] }) {
  const [tab,   setTab]   = useState("deducted");
  const [modal, setModal] = useState(false);
  const [search,setSearch]= useState("");
  const [form,  setForm]  = useState(BLANK);
  const [errors,setErrors]= useState({});
  const [saving,setSaving]= useState(false);
  const [status,setStatus]= useState(null);
  const [editIdx,setEditIdx]=useState(null);
  const [del,   setDel]   = useState(null);
  const { show, Toast }   = useToast();

  const hc = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };

  const fyData    = data.filter(r=>r.fy===fy);
  const allDeducted = fyData.filter(r=>r.type==="Deducted");
  const allReceived = fyData.filter(r=>r.type==="Received");
  const deducted = allDeducted.filter(r=>(r.party||"").toLowerCase().includes(search.toLowerCase()));
  const received = allReceived.filter(r=>(r.party||"").toLowerCase().includes(search.toLowerCase()));
  const active    = tab==="deducted" ? deducted : received;

  const totalDeducted = allDeducted.reduce((s,r)=>s+(+r.tdsAmt||0),0);
  const totalReceived = allReceived.reduce((s,r)=>s+(+r.tdsAmt||0),0);
  const pendingDeposit= allDeducted.filter(r=>r.status==="Pending").reduce((s,r)=>s+(+r.tdsAmt||0),0);

  const tdsAmt = Math.round((+form.amount)*(+form.rate)/100);

  const qtrSummary = QUARTERS.map(q=>({
    quarter:q,
    deducted: allDeducted.filter(r=>r.quarter===q).reduce((s,r)=>s+(+r.tdsAmt||0),0),
    received: allReceived.filter(r=>r.quarter===q).reduce((s,r)=>s+(+r.tdsAmt||0),0),
  }));

  const openAdd  = () => { setForm({...BLANK,date:today(),type:tab==="deducted"?"Deducted":"Received"}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs = validate(form, RULES);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setStatus("saving");
    let id = form.id || await sheetsAPI.nextSerial("TDS", form.type==="Deducted"?"TDS":"TDSR", fy);
    const row = buildTDSRow({...form,id,tdsAmt}, fy, user);
    const res = editIdx!==null ? await sheetsAPI.update("TDS",form.rowIndex,row) : await sheetsAPI.append("TDS",row);
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
    show(editIdx!==null?"Entry updated":"TDS entry logged","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleDelete = async ({r}) => {
    setDel(null);
    const res = await sheetsAPI.softDelete("TDS",r.rowIndex);
    show(res?.error?"Delete failed":"Entry deleted",res?.error?"red":"green");
    onRefresh&&onRefresh();
  };

  const cols = [
    { key:"id",          label:"TDS ID",         bold:true },
    { key:"date",        label:"Date",            render:r=>fmtD(r.date), exportVal:r=>r.date },
    { key:"party",       label:"Party Name",      bold:true },
    { key:"pan",         label:"PAN" },
    { key:"nature",      label:"Nature" },
    { key:"section",     label:"Section",         render:r=><Badge label={r.section} color="blue" /> },
    { key:"amount",      label:"Amount Paid (₹)", right:true, render:r=>fmt(r.amount) },
    { key:"rate",        label:"Rate %",          right:true, render:r=>r.rate+"%" },
    { key:"tdsAmt",      label:"TDS Amount (₹)",  right:true, render:r=><span style={{ fontWeight:800, color:tab==="deducted"?T.red:T.green }}>{fmt(r.tdsAmt)}</span> },
    { key:"quarter",     label:"Quarter" },
    { key:"challan",     label:"Challan No.",     render:r=>r.challan||"Pending" },
    { key:"depositDate", label:"Deposit Date",    render:r=>r.depositDate?fmtD(r.depositDate):"—" },
    { key:"status",      label:"Status",          render:r=><Badge label={r.status} color={r.status==="Deposited"?"green":r.status==="Pending"?"amber":"red"} /> },
  ];

  return (
    <div>
      <SHdr title="🏛️ TDS Register" action="+ Add TDS Entry" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("TDS_"+fy,cols,active)} />

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        <KPI icon="📤" label="TDS Deducted (paid out)" value={fmt(totalDeducted)} color={T.red}   sub="You deducted from vendors" />
        <KPI icon="📥" label="TDS Received (by clients)" value={fmt(totalReceived)} color={T.green} sub="Clients deducted from you" />
        <KPI icon="⏳" label="Pending Deposit to Govt" value={fmt(pendingDeposit)} color={pendingDeposit>0?T.amber:T.green} sub="Must deposit by 7th next month" />
        <KPI icon="📋" label="Net Position" value={fmt(totalReceived-totalDeducted)} color={totalReceived>totalDeducted?T.green:T.red} sub={totalReceived>totalDeducted?"ITC benefit":"Liability"} />
      </div>

      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — saves logged to console. Set VITE_API_URL to persist data."/>}
      {pendingDeposit > 0 && (
        <Alert type="amber" icon="⚠️" msg={`TDS of ${fmt(pendingDeposit)} deducted but not yet deposited. Deposit by 7th of next month to avoid interest u/s 201.`} />
      )}

      <details style={{ marginBottom:14, background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:"10px 14px" }}>
        <summary style={{ cursor:"pointer", fontWeight:700, color:T.navy, fontSize:13 }}>📚 TDS Section Quick Reference (click to expand)</summary>
        <div style={{ marginTop:12, overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr style={{ background:T.navy }}>
              {["Section","Nature of Payment","Rate","Applicable to KE"].map(h=>(
                <th key={h} style={{ padding:"8px 11px", color:T.white, fontWeight:700, textAlign:"left" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {TDS_SECTIONS.map((s,i)=>(
                <tr key={s.code} style={{ background:i%2===0?T.white:T.light }}>
                  <td style={{ padding:"7px 11px", fontWeight:700, color:T.navy }}>{s.code}</td>
                  <td style={{ padding:"7px 11px" }}>{s.desc}</td>
                  <td style={{ padding:"7px 11px", fontWeight:600, color:T.amber }}>{s.rate}</td>
                  <td style={{ padding:"7px 11px", fontSize:11, color:T.slate }}>{s.nature}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
        {qtrSummary.map(q=>(
          <div key={q.quarter} style={{ background:T.white, borderRadius:10, border:`1px solid ${T.border}`, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.navy, marginBottom:8 }}>{q.quarter}</div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:11, color:T.slate }}>Deducted</span>
              <span style={{ fontSize:12, fontWeight:700, color:T.red }}>{fmt(q.deducted)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, color:T.slate }}>Received</span>
              <span style={{ fontSize:12, fontWeight:700, color:T.green }}>{fmt(q.received)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[
          { id:"deducted", label:"📤 TDS Deducted (by you)", count:deducted.length },
          { id:"received", label:"📥 TDS Received (from clients)", count:received.length },
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:"7px 16px", borderRadius:8, border:"none", cursor:"pointer", background:tab===t.id?T.navy:"#E8ECF2", color:tab===t.id?T.white:T.slate, fontWeight:700, fontSize:12 }}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <Search value={search} onChange={setSearch} placeholder="Search by party name..." />

      <Tbl cols={cols} rows={active} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg={`No TDS entries for FY ${fy}`}/>
      {del&&<ConfirmModal msg={`Delete TDS entry for ${del.r.party}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      <div style={{ background:"#EEF2F7", borderRadius:10, padding:"12px 16px", marginTop:14 }}>
        <div style={{ fontWeight:700, color:T.navy, fontSize:13, marginBottom:6 }}>📋 26AS Reconciliation Guide</div>
        <div style={{ fontSize:12, color:T.slate, lineHeight:1.7 }}>
          <strong>TDS Received</strong> (from clients) → check in your Form 26AS at incometax.gov.in. Every entry here should appear in 26AS by the 15th of the month after quarter end.<br/>
          <strong>TDS Deducted</strong> (by you from vendors) → file quarterly TDS return (24Q/26Q). Due: Q1→31 Jul, Q2→31 Oct, Q3→31 Jan, Q4→31 May.<br/>
          <strong>Deposit deadline:</strong> 7th of next month (March: 30 April).
        </div>
      </div>

      {modal && (
        <Modal title={editIdx!==null?"Edit TDS Entry":"Add TDS Entry"} onClose={()=>setModal(false)} wide>
          <FSec label="Type & Basic Details" />
          <G2>
            <F label="TDS Type *" name="type" value={form.type} onChange={hc} options={["Deducted","Received"]}
              hint={form.type==="Deducted"?"You deducted TDS from a vendor payment":"Client deducted TDS from your invoice"} />
            <F label="Date *" name="date" type="date" value={form.date} onChange={hc} />
          </G2>
          <G2>
            <F label="Party Name *" name="party" value={form.party} onChange={hc} placeholder={form.type==="Deducted"?"Vendor / Service provider name":"Client name"} error={errors.party} />
            <F label="PAN of Party" name="pan" value={form.pan} onChange={hc} placeholder="XXXXXPXXXXXX" hint="Required for TDS return filing" />
          </G2>
          <F label="Nature of Payment *" name="nature" value={form.nature} onChange={hc} placeholder="e.g. Professional fees, Contract work, AMC charges" error={errors.nature} />

          <FSec label="TDS Calculation" />
          <G4>
            <F label="Amount Paid / Received (₹)" name="amount" type="number" value={form.amount} onChange={hc} />
            <F label="TDS Section" name="section" value={form.section} onChange={hc} options={TDS_SECTIONS.map(s=>s.code)} />
            <F label="TDS Rate %" name="rate" type="number" value={form.rate} onChange={hc} />
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:T.navy, marginBottom:4 }}>TDS Amount (auto)</label>
              <div style={{ padding:"8px 10px", borderRadius:8, background:"#D5F5E3", fontSize:13, fontWeight:800, color:T.green, fontFamily:"monospace" }}>{fmt(tdsAmt)}</div>
            </div>
          </G4>

          <FSec label="Quarter & Deposit Details" />
          <G3>
            <F label="Quarter" name="quarter" value={form.quarter} onChange={hc} options={QUARTERS} />
            <F label="Challan No. (after deposit)" name="challan" value={form.challan} onChange={hc} placeholder="Leave blank until deposited" />
            <F label="Deposit Date" name="depositDate" type="date" value={form.depositDate} onChange={hc} />
          </G3>
          <G2>
            <F label="Status" name="status" value={form.status} onChange={hc} options={["Pending","Deposited","Filed"]} />
            <F label="Remarks" name="remarks" value={form.remarks} onChange={hc} />
          </G2>
          {status&&<SaveStatus status={status}/>}
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
