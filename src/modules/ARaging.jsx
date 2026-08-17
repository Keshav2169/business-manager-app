import { T } from "../shared/constants.js";
import { fmt, fmtD, daysOverdue, exportCSV } from "../shared/utils.js";
import { KPI, Badge, SHdr, Tbl, Alert, Pills, ProgressBar, WA } from "../shared/ui.jsx";
import { useState } from "react";

export default function ARaging({ data=[], fy }) {
  const [filter, setFilter] = useState("All");

  // LIVE: calculate days overdue from actual due date, not hardcoded
  const withDays = data.map(inv => {
    const dueDate   = inv.dueDate || inv["Due Date"] || "";
    const grandTotal= +(inv.grandTotal||inv["Grand Total (Rs)"]||0);
    const received  = +(inv.amountReceived||inv["Amount Received (Rs)"]||0);
    const balance   = grandTotal - received;
    const overdue   = dueDate ? daysOverdue(dueDate) : 0;
    const bucket    = overdue<=0?"Not Due":overdue<=30?"0-30 days":overdue<=60?"31-60 days":overdue<=90?"61-90 days":"90+ days";
    return { ...inv, _balance:balance, _overdue:overdue, _bucket:bucket, _dueDate:dueDate };
  }).filter(i => i._balance > 0 && i.fy===fy);

  const filtered = filter==="All" ? withDays : withDays.filter(i=>i._bucket===filter);
  const total    = withDays.reduce((s,i)=>s+i._balance,0);
  const critical = withDays.filter(i=>i._overdue>90).reduce((s,i)=>s+i._balance,0);
  const high     = withDays.filter(i=>i._overdue>60&&i._overdue<=90).reduce((s,i)=>s+i._balance,0);

  const buckets = [
    { label:"Not Due",    color:T.green,  count:withDays.filter(i=>i._bucket==="Not Due").length,    amt:withDays.filter(i=>i._bucket==="Not Due").reduce((s,i)=>s+i._balance,0) },
    { label:"0-30 days",  color:T.green,  count:withDays.filter(i=>i._bucket==="0-30 days").length,  amt:withDays.filter(i=>i._bucket==="0-30 days").reduce((s,i)=>s+i._balance,0) },
    { label:"31-60 days", color:T.amber,  count:withDays.filter(i=>i._bucket==="31-60 days").length, amt:withDays.filter(i=>i._bucket==="31-60 days").reduce((s,i)=>s+i._balance,0) },
    { label:"61-90 days", color:"#f97316",count:withDays.filter(i=>i._bucket==="61-90 days").length, amt:withDays.filter(i=>i._bucket==="61-90 days").reduce((s,i)=>s+i._balance,0) },
    { label:"90+ days",   color:T.red,    count:withDays.filter(i=>i._bucket==="90+ days").length,   amt:withDays.filter(i=>i._bucket==="90+ days").reduce((s,i)=>s+i._balance,0) },
  ];

  const cols = [
    {key:"client",      label:"Client",      bold:true,  render:r=>r.client||r["Client"]||"—"},
    {key:"invoiceNo",   label:"Invoice No.",             render:r=>r.invoiceNo||r["Invoice No."]||"—"},
    {key:"_dueDate",    label:"Due Date",                render:r=>fmtD(r._dueDate),           exportVal:r=>r._dueDate},
    {key:"_overdue",    label:"Days Overdue", right:true, render:r=><span style={{fontWeight:700,color:r._overdue>90?T.red:r._overdue>60?"#f97316":r._overdue>30?T.amber:T.green}}>{r._overdue<=0?"Not Due":`${r._overdue} days`}</span>, exportVal:r=>r._overdue},
    {key:"_bucket",     label:"Bucket",                  render:r=><Badge label={r._bucket} color={r._overdue>90?"red":r._overdue>60?"amber":"green"}/>},
    {key:"_balance",    label:"Balance (₹)",  right:true, render:r=><span style={{fontWeight:800,color:T.red}}>{fmt(r._balance)}</span>, exportVal:r=>r._balance},
    {key:"grandTotal",  label:"Invoice Total",right:true, render:r=>fmt(+(r.grandTotal||0)),   exportVal:r=>+(r.grandTotal||0)},
    {key:"amtReceived", label:"Received",     right:true, render:r=>fmt(+(r.amountReceived||0)),exportVal:r=>+(r.amountReceived||0)},
    {key:"call",        label:"Call",                    render:r=>{ const m=r.mobile||""; return m?<a href={`tel:+91${m}`} style={{background:T.navy,color:"#fff",borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,textDecoration:"none"}}>📞</a>:"—"; }},
    {key:"wa",          label:"WA",                      render:r=>{ const m=r.mobile||""; return m?<WA mobile={m} msg={`Dear Sir/Madam, this is Keshav Sharma from Keshav Enterprises, Shamli. Gentle reminder regarding outstanding payment of ${fmt(r._balance)} against Invoice ${r.invoiceNo||"—"}. Request you to please arrange payment at earliest. Thank you.`}/>:"—"; }},
  ];

  return (
    <div>
      <SHdr title="📅 AR Aging — Outstanding Receivables" secondaryAction="⬇️ Export CSV" onSecondary={()=>exportCSV("AR_Aging_"+fy,cols,withDays)}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="💰" label="Total Outstanding" value={fmt(total)}    color={T.red}/>
        <KPI icon="🚨" label="90+ Days (Critical)" value={fmt(critical)} color={T.red}/>
        <KPI icon="⚠️" label="61-90 Days (High)" value={fmt(high)}    color={"#f97316"}/>
        <KPI icon="👥" label="Debtors"           value={withDays.length} color={T.navy}/>
      </div>

      {/* Aging buckets */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
        {buckets.map(b=>(
          <div key={b.label} style={{background:"#fff",borderRadius:10,border:`1px solid ${T.border}`,padding:"12px 14px",borderTop:`3px solid ${b.color}`}}>
            <div style={{fontSize:11,color:T.slate,fontWeight:600,marginBottom:4}}>{b.label}</div>
            <div style={{fontSize:15,fontWeight:800,color:b.color,fontFamily:"monospace"}}>{fmt(b.amt)}</div>
            <div style={{fontSize:11,color:T.slate,marginTop:2}}>{b.count} invoice{b.count!==1?"s":""}</div>
            {total>0&&<div style={{marginTop:6}}><ProgressBar value={b.amt} max={total} color={b.color} showPct={true}/></div>}
          </div>
        ))}
      </div>

      <Pills options={[{label:"All",value:"All",count:withDays.length},...buckets.map(b=>({label:b.label,value:b.label,count:b.count}))]} active={filter} onChange={setFilter}/>
      <Tbl cols={cols} rows={filtered} emptyMsg={`No outstanding AR for FY ${fy}`}/>
    </div>
  );
}
