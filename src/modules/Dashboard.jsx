import { useState, useEffect } from "react";
import { T, OPT } from "../shared/constants.js";
import { fmt, fmtD, daysFromToday, isPast } from "../shared/utils.js";
import { KPI, Badge, Alert, SHdr, StatCard, ProgressBar } from "../shared/ui.jsx";

// Month labels for crushing season heatmap
const MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const BUSY_MONTHS = [6,7,8,9,10,11]; // Oct-Mar in FY order (indices 6-11)

export default function Dashboard({ mockData, fy }) {
  const m = mockData;

  const totalAR    = (m.ar||[]).reduce((s,r)=>s+r.outstanding,0);
  const totalRev   = (m.invoices||[]).reduce((s,i)=>s+i.grandTotal,0);
  const activeJobs = (m.jobs||[]).filter(j=>j.status==="In Progress"||j.status==="Scheduled").length;
  const maturedFDs = (m.fds||[]).filter(f=>f.status==="Matured");
  const lowStock   = (m.inventory||[]).filter(i=>{
    // Bug fix: this used to compare i.closing (a field that doesn't exist on
    // the raw row — Inventory.jsx computes it on the fly as opening+purchased
    // -issued) against i.reorder. undefined<=n is always false in JS, so this
    // alert silently never fired no matter how low stock actually got.
    const closing = (+i.opening||0) + (+i.purchased||0) - (+i.issued||0);
    return closing <= (+i.reorder||0);
  });
  const openQuotes = (m.quotations||[]).filter(q=>["Pending","Sent","Negotiating"].includes(q.status));
  const expiring   = (m.vault||[]).filter(v=>v.expiry&&v.expiry!=="—"&&isPast(v.expiry));
  const expiringSoon = (m.vault||[]).filter(v=>{
    if (!v.expiry || v.expiry==="—") return false;
    const d = daysFromToday(v.expiry);
    return d!==null && d>=0 && d<=30;
  });
  // Bug fix: pettyCash is a flat array of transactions (each row has a `type`
  // of "Top-up" or a spend category), not an object with .topups/.transactions
  // sub-arrays. `m.pettyCash?.topups` on an array is always undefined, so this
  // was silently computing 0 every time — both the Petty Cash KPI and the
  // "petty cash low" alert below were wrong on every load, not just sometimes.
  const pcRows = m.pettyCash || [];
  const cashInHand = pcRows.filter(t=>t.type==="Top-up").reduce((s,t)=>s+(+t.amount||0),0)
                   - pcRows.filter(t=>t.type!=="Top-up").reduce((s,t)=>s+(+t.amount||0),0);

  const alerts = [
    ...(maturedFDs.length ? [{ t:"red",  icon:"🏦", msg:`${maturedFDs.map(f=>f.fdNo).join(", ")} matured — renew or withdraw urgently` }] : []),
    ...(lowStock.length   ? [{ t:"red",  icon:"📦", msg:`${lowStock.length} items below reorder: ${lowStock.slice(0,2).map(i=>i.name).join(", ")}` }] : []),
    ...(expiring.length   ? [{ t:"red",  icon:"📄", msg:`Expired documents: ${expiring.map(d=>d.name).join(", ")}` }] : []),
    ...(expiringSoon.length ? [{ t:"amber", icon:"⏳", msg:`${expiringSoon.length} document${expiringSoon.length!==1?"s":""} expiring within 30 days: ${expiringSoon.slice(0,2).map(d=>d.name).join(", ")}` }] : []),
    ...((m.ar||[]).filter(r=>r.daysElapsed>90).map(r=>({ t:"red", icon:"💰", msg:`${r.client} — ${fmt(r.outstanding)} overdue ${r.daysElapsed} days` }))),
    ...((m.fds||[]).filter(f=>f.daysLeft>0&&f.daysLeft<=30&&f.status==="Active").map(f=>({ t:"amber", icon:"⏳", msg:`${f.bank} FD maturing in ${f.daysLeft} days — plan renewal` }))),
    ...(openQuotes.filter(q=>isPast(q.followUp)).map(q=>({ t:"amber", icon:"📋", msg:`Quote ${q.id} follow-up overdue — ${q.client}` }))),
    ...(cashInHand<1000  ? [{ t:"amber", icon:"💵", msg:`Petty cash low — only ${fmt(cashInHand)} remaining` }] : []),
    { t:"green", icon:"⚙️", msg:`${activeJobs} jobs active | ${(m.jobs||[]).filter(j=>j.status==="Completed").length} completed this FY` },
  ].filter(Boolean);

  // Job pipeline counts
  const pipeline = OPT.jobStages.map(s=>({ stage:s, count:(m.jobs||[]).filter(j=>j.status===s).length }));
  const stageColors = { Enquiry:T.slate, Scheduled:T.amber, "In Progress":T.gold, Completed:T.green, Invoiced:T.teal, Paid:"#1A7A4A" };

  // AR aging buckets
  const agingBuckets = [
    { label:"0-30 days",  count:(m.ar||[]).filter(r=>r.daysElapsed<=30).length,  amt:(m.ar||[]).filter(r=>r.daysElapsed<=30).reduce((s,r)=>s+r.outstanding,0),  color:T.green },
    { label:"31-60 days", count:(m.ar||[]).filter(r=>r.daysElapsed>30&&r.daysElapsed<=60).length, amt:(m.ar||[]).filter(r=>r.daysElapsed>30&&r.daysElapsed<=60).reduce((s,r)=>s+r.outstanding,0), color:T.amber },
    { label:"61-90 days", count:(m.ar||[]).filter(r=>r.daysElapsed>60&&r.daysElapsed<=90).length, amt:(m.ar||[]).filter(r=>r.daysElapsed>60&&r.daysElapsed<=90).reduce((s,r)=>s+r.outstanding,0), color:T.red },
    { label:"90+ days",   count:(m.ar||[]).filter(r=>r.daysElapsed>90).length,   amt:(m.ar||[]).filter(r=>r.daysElapsed>90).reduce((s,r)=>s+r.outstanding,0),   color:T.red },
  ];

  // Top clients by revenue
  const clientRevenue = (m.invoices||[]).reduce((acc,inv)=>{ acc[inv.client]=(acc[inv.client]||0)+inv.grandTotal; return acc; },{});
  const topClients = Object.entries(clientRevenue).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxRev = topClients[0]?.[1] || 1;

  return (
    <div>
      {/* Welcome */}
      <div style={{ marginBottom:18 }}>
        <h1 style={{ margin:0, fontSize:20, fontWeight:900, color:T.navy }}>Good morning, Keshav 👋</h1>
        <p style={{ margin:"3px 0 0", color:T.slate, fontSize:13 }}>
          {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
          {" · "} Keshav Enterprises, Shamli UP · FY {fy}
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
        <KPI icon="⚙️"  label="Active Jobs"     value={activeJobs}    color={T.green} />
        <KPI icon="📄"  label="Total Invoiced"  value={fmt(totalRev)} color={T.navy} />
        <KPI icon="💰"  label="Outstanding AR"  value={fmt(totalAR)}  color={T.red} />
        <KPI icon="📋"  label="Open Quotations" value={openQuotes.length} color={T.amber} sub={`${fmt(openQuotes.reduce((s,q)=>s+q.value,0))} pipeline`} />
        <KPI icon="💵"  label="Petty Cash"      value={fmt(cashInHand)} color={cashInHand<1000?T.red:T.green} />
        <KPI icon="🏦"  label="FD Portfolio"    value={fmt((m.fds||[]).reduce((s,f)=>s+f.principal,0))} color={T.navy} />
      </div>

      {/* Alerts */}
      <SHdr title="🔔 Alerts & Action Items" />
      <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:20 }}>
        {alerts.slice(0,8).map((a,i)=>(
          <Alert key={i} type={a.t} icon={a.icon} msg={a.msg} />
        ))}
        {alerts.length===0&&<Alert type="green" icon="✅" msg="All clear! No pending alerts today." />}
      </div>

      {/* 3-column grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:20 }}>

        {/* Jobs Pipeline */}
        <div>
          <SHdr title="⚙️ Jobs Pipeline" />
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:14 }}>
            {pipeline.map(({ stage, count })=>(
              <div key={stage} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:stageColors[stage]||T.slate, flexShrink:0 }}/>
                <span style={{ fontSize:12, flex:1 }}>{stage}</span>
                <div style={{ flex:2 }}>
                  <div style={{ height:6, background:"#E8ECF2", borderRadius:4 }}>
                    <div style={{ height:"100%", width:`${Math.max(4,count/Math.max(...pipeline.map(p=>p.count)||[1])*100)}%`, background:stageColors[stage]||T.slate, borderRadius:4 }}/>
                  </div>
                </div>
                <span style={{ fontSize:13, fontWeight:700, width:20, textAlign:"right" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AR Aging */}
        <div>
          <SHdr title="💰 AR Aging" />
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:14 }}>
            {agingBuckets.map(b=>(
              <div key={b.label} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:11, color:T.slate }}>{b.label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:b.color }}>{fmt(b.amt)}</span>
                </div>
                <ProgressBar value={b.amt} max={totalAR||1} color={b.color} showPct={false} />
              </div>
            ))}
            <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:8, marginTop:4, display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, fontWeight:700 }}>Total</span>
              <span style={{ fontSize:13, fontWeight:800, color:T.red, fontFamily:"monospace" }}>{fmt(totalAR)}</span>
            </div>
          </div>
        </div>

        {/* Top Clients */}
        <div>
          <SHdr title="🏆 Top Clients by Revenue" />
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:14 }}>
            {topClients.map(([name,rev],i)=>(
              <div key={name} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:11, color:T.dark, fontWeight:600 }}>{i+1}. {name.split(" ").slice(0,2).join(" ")}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:T.navy }}>{fmt(rev)}</span>
                </div>
                <ProgressBar value={rev} max={maxRev} color={T.navy} showPct={false} />
              </div>
            ))}
            {topClients.length===0&&<div style={{ color:T.slate, fontSize:12, textAlign:"center", padding:16 }}>No invoice data yet</div>}
          </div>
        </div>
      </div>

      {/* 2-column row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>

        {/* Seasonal planner */}
        <div>
          <SHdr title="📅 Seasonal Business Planner" />
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:14 }}>
            <div style={{ fontSize:11, color:T.slate, marginBottom:10 }}>Sugar mill crushing season: Oct–Mar (highlighted). Plan manpower and spares accordingly.</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:4 }}>
              {MONTHS.map((m,i)=>{
                const isBusy = BUSY_MONTHS.includes(i);
                const isCurrent = new Date().getMonth() === (i+3)%12;
                return (
                  <div key={m} style={{ padding:"8px 4px", borderRadius:8, textAlign:"center", background:isBusy?"#FEF3C7":T.light, border:`1.5px solid ${isCurrent?T.gold:isBusy?"#FCD34D":T.border}` }}>
                    <div style={{ fontSize:10, fontWeight:isBusy?700:400, color:isBusy?T.amber:T.slate }}>{m}</div>
                    {isBusy && <div style={{ fontSize:8, color:T.amber, marginTop:1 }}>🔥</div>}
                    {isCurrent && <div style={{ fontSize:8, color:T.gold, marginTop:1, fontWeight:700 }}>NOW</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}><div style={{ width:10, height:10, background:"#FEF3C7", border:"1px solid #FCD34D", borderRadius:2 }}/><span style={{ fontSize:10, color:T.slate }}>Crushing season (busy)</span></div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}><div style={{ width:10, height:10, background:T.light, border:`1px solid ${T.border}`, borderRadius:2 }}/><span style={{ fontSize:10, color:T.slate }}>Off season</span></div>
            </div>
          </div>
        </div>

        {/* FD Maturities */}
        <div>
          <SHdr title="🏦 FD Maturity Timeline" />
          <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`, padding:14 }}>
            {(m.fds||[]).sort((a,b)=>a.daysLeft-b.daysLeft).map((fd,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:i<(m.fds||[]).length-1?`1px solid ${T.border}`:"none" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{fd.bank}</div>
                  <div style={{ fontSize:10, color:T.slate }}>{fd.fdNo} · {fmt(fd.principal)}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:fd.daysLeft<0?T.red:fd.daysLeft<90?T.amber:T.green }}>
                    {fd.daysLeft<0 ? "MATURED" : `${fd.daysLeft}d`}
                  </div>
                  <div style={{ fontSize:10, color:T.slate }}>{fmtD(fd.maturityDate)}</div>
                </div>
              </div>
            ))}
            {!(m.fds||[]).length&&<div style={{ color:T.slate, fontSize:12, textAlign:"center", padding:16 }}>No FDs added yet</div>}
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
        <StatCard title="Inventory" rows={[
          ["Total Items",   (m.inventory||[]).length,                                         T.navy],
          ["Low Stock",     (m.inventory||[]).filter(i=>i.closing<=i.reorder).length,         T.red],
          ["Stock Value",   fmt((m.inventory||[]).reduce((s,i)=>s+(i.closing*i.unitCost),0)), T.navy],
        ]}/>
        <StatCard title="Clients" rows={[
          ["Active",    (m.clients||[]).filter(c=>c.status==="Active").length,   T.green],
          ["Prospects", (m.clients||[]).filter(c=>c.status==="Prospect").length, T.amber],
          ["Follow-ups due", (m.clients||[]).filter(c=>isPast(c.nextFollowup)&&c.status==="Active").length, T.red],
        ]}/>
        <StatCard title="Quotations" rows={[
          ["Accepted",    (m.quotations||[]).filter(q=>q.status==="Accepted").length,    T.green],
          ["Pending",     (m.quotations||[]).filter(q=>["Pending","Sent"].includes(q.status)).length, T.amber],
          ["Conversion",  Math.round((m.quotations||[]).filter(q=>q.status==="Accepted").length/Math.max((m.quotations||[]).length,1)*100)+"%", T.gold],
        ]}/>
        <StatCard title="Documents" rows={[
          ["Total Docs",    (m.vault||[]).length,                        T.navy],
          ["Expiring Soon", (m.vault||[]).filter(v=>v.expiry!=="—"&&!isPast(v.expiry)&&daysFromToday(v.expiry)<30).length, T.amber],
          ["Expired",       expiring.length,                             T.red],
        ]}/>
      </div>
    </div>
  );
}
