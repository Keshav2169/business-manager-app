import { useState } from "react";
import { T } from "../shared/constants.js";
import { fmt, fmtD, today, validate, exportCSV, sheetsAPI, IS_DEMO, buildPettyCashRow } from "../shared/utils.js";
import { KPI, SHdr, Modal, FSec, F, G2, Btns, Alert, ConfirmModal, SaveStatus, useToast, ProgressBar } from "../shared/ui.jsx";

const BLANK   = { date:today(),category:"",description:"",paidTo:"",mode:"Cash",amount:0,voucherNo:"",jobRef:"",approvedBy:"Keshav Sharma",remarks:"" };
const TOPUP_B = { date:today(),amount:0,by:"Keshav Sharma",remarks:"" };
const RULES   = [{ field:"date",label:"Date",required:true },{ field:"category",label:"Category",required:true },{ field:"amount",label:"Amount",required:true,min:1 },{ field:"description",label:"Description",required:true }];
const CATS    = ["Travel","Office","Meals","Labour","Courier","Maintenance","Utilities","Miscellaneous"];

export default function PettyCash({ data=[], fy, user, onRefresh, jobs=[], imprestAmount=10000 }) {
  const [tab,      setTab]      = useState("ledger");
  const [modal,    setModal]    = useState(false);
  const [topupMod, setTopupMod] = useState(false);
  const [form,     setForm]     = useState(BLANK);
  const [topupF,   setTopupF]   = useState(TOPUP_B);
  const [errors,   setErrors]   = useState({});
  const [saving,   setSaving]   = useState(false);
  const [status,   setStatus]   = useState(null);
  const [editIdx,  setEditIdx]  = useState(null);
  const [del,      setDel]      = useState(null);
  const { show, Toast } = useToast();

  const hc  = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:""})); };
  const htc = e => setTopupF(f=>({...f,[e.target.name]:e.target.value}));

  const fyTxns  = data.filter(d=>d.fy===fy && (d.type||d["Type"]||"")!=="Top-up");
  const fyTopups= data.filter(d=>d.fy===fy && (d.type||d["Type"]||"")==="Top-up");
  const totalIn = fyTopups.reduce((s,t)=>s+(+(t.amount||t["Amount (Rs)"]||0)),0);
  const totalOut= fyTxns.reduce((s,t)=>s+(+(t.amount||t["Amount (Rs)"]||0)),0);
  const cash    = totalIn - totalOut;

  let runBal = totalIn;

  const catSummary = fyTxns.reduce((acc,t)=>{ const cat=t.category||t["Category"]||"Other"; acc[cat]=(acc[cat]||0)+(+(t.amount||0)); return acc; },{});
  const monSummary = fyTxns.reduce((acc,t)=>{ const m=new Date(t.date||"").toLocaleDateString("en-IN",{month:"short",year:"2-digit"}); acc[m]=(acc[m]||0)+(+(t.amount||0)); return acc; },{});

  const openEdit = (row,ri) => { setForm({...row}); setErrors({}); setEditIdx(ri); setModal(true); };

  const handleSave = async () => {
    const errs=validate(form,RULES); if(Object.keys(errs).length){setErrors(errs);return;}
    if(+form.amount>cash){ show("Amount exceeds cash in hand!","red"); return; }
    setSaving(true); setStatus("saving");
    const id=form.id||await sheetsAPI.nextSerial("Petty Cash","PC",fy);
    const row=buildPettyCashRow({...form,id},"Payment",fy,user);
    const res=editIdx!==null?await sheetsAPI.update("Petty Cash",form.rowIndex,row):await sheetsAPI.append("Petty Cash",row);
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
    show(editIdx!==null?"Entry updated":"Payment logged","green");
    setTimeout(()=>{ setModal(false); setStatus(null); onRefresh&&onRefresh(); },1200);
  };

  const handleTopup = async () => {
    if(!(+topupF.amount>0)){ show("Enter a valid amount","red"); return; }
    setSaving(true);
    const id=await sheetsAPI.nextSerial("Petty Cash","PCTOP",fy);
    const row=buildPettyCashRow({...topupF,id,description:topupF.remarks||"Float top-up",receivedFrom:"Main Account"},"Top-up",fy,user);
    const res=await sheetsAPI.append("Petty Cash",row);
    setSaving(false);
    show(res?.error?"Top-up failed":"Float topped up!","green");
    setTopupMod(false); onRefresh&&onRefresh();
  };

  const handleDelete = async ({r}) => { setDel(null); await sheetsAPI.softDelete("Petty Cash",r.rowIndex); show("Entry deleted","green"); onRefresh&&onRefresh(); };

  const pctCols = [
    {key:"id",          label:"Voucher",   render:r=>r.id||r["Entry ID"]||"—"},
    {key:"date",        label:"Date",      render:r=>fmtD(r.date||r["Date"]),                 exportVal:r=>r.date||""},
    {key:"category",    label:"Category",  render:r=><span style={{background:"#EEF2F7",color:T.slate,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:600}}>{r.category||r["Category"]||"—"}</span>},
    {key:"description", label:"Description",bold:true,render:r=>r.description||r["Description"]||"—"},
    {key:"paidTo",      label:"Paid To",   render:r=>r.paidTo||r["Paid To"]||"—"},
    {key:"mode",        label:"Mode",      render:r=>r.mode||r["Mode"]||"Cash"},
    {key:"amount",      label:"Amount (₹)",right:true,render:r=><span style={{color:T.red,fontWeight:700}}>{fmt(+(r.amount||r["Amount (Rs)"]||0))}</span>, exportVal:r=>+(r.amount||0)},
    {key:"jobRef",      label:"Job",       render:r=>r.jobRef||r["Job Reference"]||"—"},
    {key:"balance",     label:"Balance",   right:true,render:r=>{ runBal-=+(r.amount||0); return <span style={{fontWeight:800,color:runBal<0?T.red:T.navy,fontFamily:"monospace"}}>{fmt(runBal)}</span>; }},
    {key:"approvedBy",  label:"Approved",  render:r=>r.approvedBy||r["Approved By"]||"—"},
  ];

  const expCols = [
    {key:"date",   label:"Date",   render:r=>fmtD(r.date||r["Date"])},
    {key:"amount", label:"Amount Added",right:true,render:r=><span style={{color:T.green,fontWeight:800}}>{fmt(+(r.amount||r["Amount (Rs)"]||0))}</span>},
    {key:"by",     label:"Topped By",  render:r=>r.by||r["Received From"]||"—"},
    {key:"remarks",label:"Remarks",    render:r=>r.remarks||r["Remarks"]||"—"},
  ];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{margin:0,fontSize:15,fontWeight:800,color:T.navy}}>💵 Petty Cash Ledger — FY {fy}</h2>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setTopupMod(true)} style={{background:T.green,color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Top-up Float</button>
          <button onClick={()=>{ setForm({...BLANK}); setErrors({}); setEditIdx(null); setModal(true); }} style={{background:T.navy,color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Log Payment</button>
          <button onClick={()=>exportCSV("PettyCash_"+fy,pctCols,fyTxns)} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>⬇️ CSV</button>
        </div>
      </div>

      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="🏦" label="Imprest Float"  value={fmt(imprestAmount)} color={T.navy}/>
        <KPI icon="➕" label="Total Topped Up" value={fmt(totalIn)}       color={T.green}/>
        <KPI icon="💸" label="Total Spent"    value={fmt(totalOut)}       color={T.red}/>
        <KPI icon="💵" label="Cash in Hand"   value={fmt(cash)}           color={cash<1000?T.red:T.green}/>
      </div>

      {cash<1000&&<Alert type="red" icon="⚠️" msg={`Cash in hand ${fmt(cash)} is low — request top-up from main account.`}/>}
      {IS_DEMO&&<Alert type="amber" icon="⚡" msg="Demo mode — set VITE_API_URL to persist entries."/>}

      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["ledger","📋 Ledger"],["summary","📊 Summary"],["topup","🏦 Top-ups"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",background:tab===id?T.navy:"#E8ECF2",color:tab===id?"#fff":T.slate,fontWeight:700,fontSize:12}}>{lbl}</button>
        ))}
      </div>

      {tab==="ledger"&&(
        <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${T.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:T.navy}}>
              {["Voucher","Date","Category","Description","Paid To","Mode","Payment (₹)","Job","Balance (₹)","Approved","Actions"].map(h=>(
                <th key={h} style={{padding:"9px 11px",textAlign:h==="Payment (₹)"||h==="Balance (₹)"?"right":"left",color:"#fff",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              <tr style={{background:"#F0F4FB"}}><td colSpan={8} style={{padding:"7px 11px",fontWeight:700,color:T.navy}}>Opening Float FY {fy}</td><td colSpan={3} style={{padding:"7px 11px",textAlign:"right",fontWeight:800,color:T.green,fontFamily:"monospace"}}>{fmt(totalIn)}</td></tr>
              {fyTxns.map((t,i)=>{
                runBal-=+(t.amount||t["Amount (Rs)"]||0);
                return (
                  <tr key={i} style={{background:i%2===0?"#fff":"#F8FAFB"}}>
                    <td style={{padding:"7px 11px",fontSize:11,fontWeight:600}}>{t.id||t["Entry ID"]||"—"}</td>
                    <td style={{padding:"7px 11px",whiteSpace:"nowrap"}}>{fmtD(t.date)}</td>
                    <td style={{padding:"7px 11px"}}><span style={{background:"#EEF2F7",color:T.slate,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:600}}>{t.category||"—"}</span></td>
                    <td style={{padding:"7px 11px",maxWidth:180}}>{t.description||"—"}</td>
                    <td style={{padding:"7px 11px"}}>{t.paidTo||"—"}</td>
                    <td style={{padding:"7px 11px"}}>{t.mode||"Cash"}</td>
                    <td style={{padding:"7px 11px",textAlign:"right",color:T.red,fontWeight:700,fontFamily:"monospace"}}>{fmt(+(t.amount||0))}</td>
                    <td style={{padding:"7px 11px",fontSize:11,color:T.slate}}>{t.jobRef||"—"}</td>
                    <td style={{padding:"7px 11px",textAlign:"right",fontWeight:800,color:runBal<0?T.red:T.navy,fontFamily:"monospace"}}>{fmt(runBal)}</td>
                    <td style={{padding:"7px 11px",fontSize:11}}>{t.approvedBy||"—"}</td>
                    <td style={{padding:"5px 11px"}}>
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>openEdit(t,i)} style={{background:T.navy,color:"#fff",border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>✏️</button>
                        <button onClick={()=>setDel({r:t,ri:i})} style={{background:T.red,color:"#fff",border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr style={{background:T.navy}}>
                <td colSpan={6} style={{padding:"9px 11px",fontWeight:700,color:"#fff"}}>CLOSING BALANCE</td>
                <td style={{padding:"9px 11px",textAlign:"right",fontWeight:800,color:T.gold,fontFamily:"monospace"}}>{fmt(totalOut)}</td>
                <td colSpan={2} style={{padding:"9px 11px",textAlign:"right",fontWeight:800,color:T.gold,fontFamily:"monospace",fontSize:14}}>{fmt(cash)}</td>
                <td colSpan={2}/>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab==="summary"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div>
            <h3 style={{margin:"0 0 10px",fontSize:13,fontWeight:800,color:T.navy}}>Category-wise Spend</h3>
            <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
              {Object.entries(catSummary).sort((a,b)=>b[1]-a[1]).map(([cat,amt],i)=>(
                <div key={cat} style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,background:i%2===0?"#fff":"#F8FAFB"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600}}>{cat}</span>
                    <span style={{fontSize:13,fontWeight:800,color:T.navy,fontFamily:"monospace"}}>{fmt(amt)}</span>
                  </div>
                  <ProgressBar value={amt} max={totalOut||1} color={T.navy} showPct={true}/>
                </div>
              ))}
              <div style={{padding:"10px 14px",background:T.navy,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,color:"#fff"}}>TOTAL SPENT</span>
                <span style={{fontWeight:800,color:T.gold,fontFamily:"monospace"}}>{fmt(totalOut)}</span>
              </div>
            </div>
          </div>
          <div>
            <h3 style={{margin:"0 0 10px",fontSize:13,fontWeight:800,color:T.navy}}>Month-wise Spend</h3>
            <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,padding:14}}>
              {Object.entries(monSummary).map(([mon,amt],i)=>(
                <div key={mon} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:11}}>{mon}</span>
                    <span style={{fontSize:11,fontWeight:700,color:T.amber}}>{fmt(amt)}</span>
                  </div>
                  <ProgressBar value={amt} max={totalOut||1} color={T.gold} showPct={false}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==="topup"&&(
        <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${T.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:T.navy}}>{["Date","Amount Added (₹)","Topped By","Remarks"].map(h=><th key={h} style={{padding:"9px 14px",textAlign:"left",color:"#fff",fontWeight:700,fontSize:11}}>{h}</th>)}</tr></thead>
            <tbody>
              {fyTopups.map((t,i)=>(
                <tr key={i} style={{background:i%2===0?"#fff":"#F8FAFB"}}>
                  <td style={{padding:"9px 14px"}}>{fmtD(t.date)}</td>
                  <td style={{padding:"9px 14px",fontWeight:800,color:T.green,fontFamily:"monospace"}}>{fmt(+(t.amount||0))}</td>
                  <td style={{padding:"9px 14px"}}>{t.by||t["Received From"]||"—"}</td>
                  <td style={{padding:"9px 14px",color:T.slate}}>{t.remarks||"—"}</td>
                </tr>
              ))}
              <tr style={{background:T.navy}}>
                <td style={{padding:"9px 14px",fontWeight:700,color:"#fff"}}>TOTAL</td>
                <td style={{padding:"9px 14px",fontWeight:800,color:T.gold,fontFamily:"monospace"}}>{fmt(totalIn)}</td>
                <td colSpan={2}/>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {del&&<ConfirmModal msg={`Delete petty cash entry: ${del.r.description}?`} onConfirm={()=>handleDelete(del)} onCancel={()=>setDel(null)}/>}

      {modal&&(
        <Modal title={editIdx!==null?"Edit Entry":"Log Petty Cash Payment"} onClose={()=>setModal(false)} wide>
          <div style={{background:"#D5F5E3",borderRadius:8,padding:"7px 12px",marginBottom:14,fontSize:12,color:T.green,fontWeight:700}}>
            Cash in hand: {fmt(cash)}
          </div>
          <G2>
            <F label="Date *"      name="date"     type="date" value={form.date}     onChange={hc} required error={errors.date}/>
            <F label="Category *"  name="category" value={form.category} onChange={hc} options={CATS} required error={errors.category}/>
          </G2>
          <F label="Description *" name="description" value={form.description} onChange={hc} required error={errors.description}/>
          <G2>
            <F label="Paid To"     name="paidTo"   value={form.paidTo}   onChange={hc}/>
            <F label="Mode"        name="mode"     value={form.mode}     onChange={hc} options={["Cash","UPI","Card"]}/>
          </G2>
          <G2>
            <F label="Amount (₹) *" name="amount"   type="number" value={form.amount}   onChange={hc} required error={errors.amount}/>
            <F label="Voucher / Bill No." name="voucherNo" value={form.voucherNo} onChange={hc}/>
          </G2>
          <F label="Job Reference" name="jobRef"     value={form.jobRef}     onChange={hc} options={["",  ...jobs.map(j=>j.id||j["Job ID"]||"")].filter(Boolean)}/>
          {+form.amount>cash&&<Alert type="red" icon="⚠️" msg={`Amount ${fmt(+form.amount)} exceeds cash in hand ${fmt(cash)}.`}/>}
          <SaveStatus status={status}/>
          <Btns onClose={()=>setModal(false)} onSave={handleSave} saving={saving} isEdit={editIdx!==null}/>
        </Modal>
      )}

      {topupMod&&(
        <Modal title="Top-up Petty Cash Float" onClose={()=>setTopupMod(false)}>
          <div style={{background:"#D5F5E3",borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:12,color:T.green}}>
            <strong>Cash in hand: {fmt(cash)}</strong><br/>
            <span style={{fontSize:11}}>Float target: {fmt(imprestAmount)} · Shortfall: {fmt(Math.max(0,imprestAmount-cash))}</span>
          </div>
          <F label="Date"           name="date"    type="date"   value={topupF.date}   onChange={htc}/>
          <F label="Amount (₹)"     name="amount"  type="number" value={topupF.amount} onChange={htc}/>
          <F label="Topped Up By"   name="by"                    value={topupF.by}     onChange={htc}/>
          <F label="Remarks"        name="remarks"               value={topupF.remarks} onChange={htc}/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
            <button onClick={()=>setTopupMod(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${T.border}`,background:"#fff",cursor:"pointer",fontSize:13}}>Cancel</button>
            <button onClick={handleTopup} disabled={saving} style={{padding:"8px 20px",borderRadius:8,border:"none",background:T.green,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>
              {saving?"Saving…":"✅ Record Top-up"}
            </button>
          </div>
        </Modal>
      )}
      <Toast/>
    </div>
  );
}
