import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildFDRow, daysFromToday, calcMaturityDate, calcFDMaturity } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Modal, FSec, F, G2, G3, G4, Btns, Alert, ConfirmModal, SaveStatus, useToast, CalcStrip } from "../shared/ui.jsx";

const BLANK = { bank:"",branch:"",fdNo:"",fdReceiptNo:"",fdType:"Cumulative",principal:0,rate:0,depositDate:today(),tenureMonths:12,interestPayout:"On Maturity",nominee:"",nomineeRelation:"",autoRenew:"No",pledged:"No",status:"Active",remarks:"" };
const RULES = [{ field:"bank",label:"Bank",required:true },{ field:"fdNo",label:"FD No.",required:true },{ field:"principal",label:"Principal",required:true,min:1 },{ field:"rate",label:"Rate",required:true,min:0.1 },{ field:"depositDate",label:"Deposit Date",required:true }];

export default function FDTracker({ data=[], fy, user, onRefresh }) {
  const [modal,  setModal]  = useState(false);
  const [form,   setForm]   = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [editIdx,setEditIdx]= useState(null);
  const [del,    setDel]    = useState(null);
  const { show, Toast } = useToast();

  const hc = e => {
    const val = e.target.value;
    const name = e.target.name;
    setForm(f => {
      const next = {...f,[name]:val};
      // AUTO-CALCULATE maturity date when deposit date or tenure changes
      if (name==="depositDate"||name==="tenureMonths") {
        next.maturityDate = calcMaturityDate(next.depositDate, next.tenureMonths);
      }
      return next;
    });
    setErrors(er=>({...er,[name]:""}));
  };

  // LIVE: always calculate days from today's date, never hardcoded
  const withLive = data.map(fd => {
    const matDate = fd.maturityDate || fd["Maturity Date"] || calcMaturityDate(fd.depositDate||fd["Deposit Date"], fd.tenureMonths||fd["Tenure (Months)"]);
    const daysLeft = daysFromToday(matDate);
    const maturity = calcFDMaturity(fd.principal||fd["Principal (Rs)"]||0, fd.rate||fd["Interest Rate % p.a."]||0, fd.tenureMonths||fd["Tenure (Months)"]||12);
    return { ...fd, _matDate:matDate, _daysLeft:daysLeft, _maturity:maturity };
  });

  const active  = withLive.filter(f=>f.status==="Active"||f.status==="Active ");
  const matured = withLive.filter(f=>f._daysLeft!==null&&f._daysLeft<=0);
  const soon90  = withLive.filter(f=>f._daysLeft!==null&&f._daysLeft>0&&f._daysLeft<=90);
  const total   = withLive.reduce((s,f)=>s+(+(f.principal||f["Principal (Rs)"]||0)),0);

  const openAdd  = () => { setForm({...BLANK,maturityDate:calcMaturityDate(today(),12)}); setErrors({}); setEditIdx(null); setModal(true); };
  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs=validate(form,RULES); if(Object.keys(errs).length){setErrors(errs);return;}
    setSaving(true); setStatus("saving");
    const row=buildFDRow(form,fy,user);
    const res=editIdx!==null?await sheetsAPI.update("FD Tracker",form.rowIndex,row):await sheetsAPI.append("FD Tracker",row);
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
    show(editIdx!==null?"FD updated":"FD saved","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };
  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("FD Tracker",r.rowIndex); show("FD deleted","green"); onRefresh&&onRefresh(); };

  const matAmt = calcFDMaturity(form.principal, form.rate, form.tenureMonths);

  const cols = [
    {key:"bank",       label:"Bank / NBFC",  bold:true, render:r=>r.bank||r["Bank / NBFC"]||"—"},
    {key:"fdNo",       label:"FD No."},
    {key:"fdType",     label:"Type",          render:r=>r.fdType||r["FD Type"]||"—"},
    {key:"principal",  label:"Principal",     right:true, render:r=>fmt(+(r.principal||r["Principal (Rs)"]||0)), exportVal:r=>+(r.principal||0)},
    {key:"rate",       label:"Rate %",        right:true, render:r=><span style={{color:T.green,fontWeight:700}}>{(r.rate||r["Interest Rate % p.a."]||0)}%</span>},
    {key:"depositDate",label:"Deposit",       render:r=>fmtD(r.depositDate||r["Deposit Date"]),         exportVal:r=>r.depositDate||""},
    {key:"tenureMonths",label:"Tenure (m)",   right:true, render:r=>r.tenureMonths||r["Tenure (Months)"]||"—"},
    {key:"_matDate",   label:"Maturity",      render:r=><span style={{color:r._daysLeft!==null&&r._daysLeft<=0?T.red:r._daysLeft!==null&&r._daysLeft<=90?T.amber:T.dark}}>{fmtD(r._matDate)}</span>, exportVal:r=>r._matDate},
    {key:"_daysLeft",  label:"Days Left",     right:true, render:r=>{
      const d=r._daysLeft;
      if(d===null) return "—";
      return <span style={{fontWeight:800,color:d<=0?T.red:d<=90?T.amber:T.green}}>{d<=0?"MATURED":`${d}d`}</span>;
    }, exportVal:r=>r._daysLeft},
    {key:"_maturity",  label:"Maturity Amt",  right:true, render:r=><span style={{color:T.green,fontWeight:700}}>{fmt(r._maturity)}</span>, exportVal:r=>r._maturity},
    {key:"autoRenew",  label:"Auto-Renew",    render:r=><Badge label={r.autoRenew||r["Auto-Renew"]||"No"} color={(r.autoRenew||r["Auto-Renew"])==="Yes"?"green":"default"}/>},
    {key:"status",     label:"Status",        render:r=><Badge label={r.status} color={r.status==="Active"?"green":r._daysLeft<=0?"red":"amber"}/>},
  ];

  return (
    <div>
      <SHdr title="🏦 Fixed Deposit Tracker" action="+ Add FD" onAction={openAdd} secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("FD_Tracker",cols,withLive)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="🏦" label="Total Portfolio" value={fmt(total)}    color={T.navy}/>
        <KPI icon="✅" label="Active"          value={active.length} color={T.green}/>
        <KPI icon="🚨" label="Matured"         value={matured.length} color={matured.length>0?T.red:T.green}/>
        <KPI icon="⏳" label="Maturing ≤90d"  value={soon90.length}  color={soon90.length>0?T.amber:T.green}/>
        <KPI icon="💰" label="Maturity Value"  value={fmt(withLive.reduce((s,f)=>s+f._maturity,0))} color={T.navy} sub="At current rates"/>
      </div>
      {matured.length>0&&<Alert type="red" icon="🚨" msg={`ACTION REQUIRED: ${matured.map(f=>f.fdNo||f["FD No."]).join(", ")} matured — renew or withdraw immediately!`}/>}
      {soon90.length>0&&<Alert type="amber" icon="⏳" msg={`Maturing within 90 days: ${soon90.map(f=>`${f.fdNo||f["FD No."]} (${f._daysLeft}d)`).join(", ")}`}/>}
      {IS_DEMO&&<Alert type="blue" icon="ℹ️" msg="Days left and maturity amount are calculated live from today's date — never hardcoded."/>}
      <Tbl cols={cols} rows={withLive} onEdit={openEdit} onDelete={(r,ri)=>setDel({r,ri})} emptyMsg="No FDs added yet"/>
      {del&&<ConfirmModal msg={`Delete FD ${del.r.fdNo}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}
      {modal&&(
        <Modal title={editIdx!==null?"Edit FD":"Add Fixed Deposit"} onClose={()=>setModal(false)} full>
          <FSec label="Bank & FD Details"/>
          <G3>
            <F label="Bank / NBFC *"  name="bank"        value={form.bank}        onChange={hc} required error={errors.bank}/>
            <F label="Branch"         name="branch"      value={form.branch}      onChange={hc}/>
            <F label="FD Account No. *" name="fdNo"      value={form.fdNo}        onChange={hc} required error={errors.fdNo}/>
          </G3>
          <G3>
            <F label="FD Receipt No." name="fdReceiptNo" value={form.fdReceiptNo} onChange={hc}/>
            <F label="FD Type"        name="fdType"      value={form.fdType}      onChange={hc} options={["Cumulative","Non-Cumulative","Tax-Saver (5yr)","Flexi FD","Corporate FD"]}/>
            <F label="Interest Payout" name="interestPayout" value={form.interestPayout} onChange={hc} options={["On Maturity","Monthly","Quarterly","Annually"]}/>
          </G3>
          <FSec label="Investment Details"/>
          <G4>
            <F label="Principal (₹) *"  name="principal"    type="number" value={form.principal}    onChange={hc} required error={errors.principal}/>
            <F label="Rate % p.a. *"    name="rate"         type="number" value={form.rate}         onChange={hc} required error={errors.rate}/>
            <F label="Tenure (months)"  name="tenureMonths" type="number" value={form.tenureMonths} onChange={hc}/>
            <F label="Deposit Date *"   name="depositDate"  type="date"   value={form.depositDate}  onChange={hc} required error={errors.depositDate}/>
          </G4>
          <F label="Maturity Date (auto-calculated)" name="maturityDate" value={form.maturityDate||calcMaturityDate(form.depositDate,form.tenureMonths)} onChange={hc} readOnly hint="Auto-calculated from deposit date + tenure. Override if needed."/>
          <CalcStrip items={[["Principal",fmt(form.principal||0)],["Rate p.a.",`${form.rate||0}%`],["Tenure",`${form.tenureMonths||0} months`],["Maturity Amount",fmt(matAmt),true]]}/>
          <FSec label="Nominee & Pledge"/>
          <G4>
            <F label="Nominee"         name="nominee"          value={form.nominee}         onChange={hc}/>
            <F label="Relation"        name="nomineeRelation"  value={form.nomineeRelation}  onChange={hc} options={["Father","Mother","Spouse","Son","Daughter","Brother","Sister","Self"]}/>
            <F label="Auto-Renew?"     name="autoRenew"        value={form.autoRenew}        onChange={hc} options={["Yes","No"]}/>
            <F label="Pledged?"        name="pledged"          value={form.pledged}          onChange={hc} options={["No","Yes — OD","Yes — Loan"]}/>
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
