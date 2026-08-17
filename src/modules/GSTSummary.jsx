import { T } from "../shared/constants.js";
import { fmt, exportCSV } from "../shared/utils.js";
import { KPI, SHdr, Alert, StatCard } from "../shared/ui.jsx";

export default function GSTSummary({ data={}, fy }) {
  const inv = (data.invoices||[]).filter(i=>i.fy===fy);
  const exp = (data.expenses||[]).filter(e=>e.fy===fy);
  const pur = (data.purchases||[]).filter(p=>p.fy===fy);

  const outputGST = inv.reduce((s,i)=>s+(+(i.totalGST||i["Total GST (Rs)"]||0)),0);
  const cgstOut   = inv.reduce((s,i)=>s+(+(i.cgst||0)),0);
  const sgstOut   = inv.reduce((s,i)=>s+(+(i.sgst||0)),0);
  const igstOut   = inv.reduce((s,i)=>s+(+(i.igst||0)),0);
  const inpExp    = exp.reduce((s,e)=>s+(+(e.gst||e["GST (Rs)"]||0)),0);
  const inpPur    = pur.filter(p=>(p.itcEligible||p["ITC Eligible"])==="Yes").reduce((s,p)=>s+(+(p.totalGST||p["Total GST (Rs)"]||0)),0);
  const totalInp  = inpExp + inpPur;
  const net       = outputGST - totalInp;

  const rows = [
    ["OUTPUT GST (Tax Collected from Clients)",null,true],
    ["CGST Collected",cgstOut],
    ["SGST Collected",sgstOut],
    ["IGST Collected",igstOut],
    ["TOTAL OUTPUT GST (A)",outputGST,false,null,true],
    ["INPUT GST / ITC (Tax Paid on Purchases)",null,true],
    ["ITC on Operating Expenses",inpExp,false,T.green],
    ["ITC on Purchase Invoices",inpPur,false,T.green],
    ["TOTAL INPUT ITC (B)",totalInp,false,T.green,true],
    ["NET GST PAYABLE (A − B)",net,false,net>0?T.red:T.green,false,true],
  ];

  // GST by month for reference
  const monthly = inv.reduce((acc,i)=>{
    const m=new Date(i.date||"").toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
    acc[m]=(acc[m]||0)+(+(i.totalGST||0)); return acc;
  },{});

  return (
    <div>
      <SHdr title="🧾 GST Summary — GSTR-3B Reference" secondaryAction="⬇️ Export CSV" onSecondary={()=>{
        const lines=[["Particulars","Amount (Rs)"],["Output GST",outputGST],["Input ITC Expenses",inpExp],["Input ITC Purchases",inpPur],["Total Input ITC",totalInp],["Net GST Payable",net]].map(r=>r.join(",")).join("\n");
        const blob=new Blob([lines],{type:"text/csv"});
        const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:"GST_"+fy+".csv"}); a.click();
      }}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="📤" label="Output GST"  value={fmt(outputGST)} color={T.red}/>
        <KPI icon="📥" label="Input ITC"   value={fmt(totalInp)}  color={T.green}/>
        <KPI icon="🧾" label="Net Payable" value={fmt(net)}       color={net>0?T.red:T.green}/>
      </div>
      <Alert type="amber" icon="⚠️" msg="Internal estimate. Verify against GSTR-2A/2B before filing. Share with CA for GSTR-3B."/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
          {rows.map(([l,v,h,color,tot,big],i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:h?"9px 20px":"10px 20px 10px 32px",background:h?T.navy:big?"#FEF9E7":tot?"#F0F4FB":i%2===0?"#fff":"#F8FAFB",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontWeight:h||tot||big?700:400,color:h?"#fff":T.dark,fontSize:h?11:13,textTransform:h?"uppercase":"none"}}>{l}</span>
              <span style={{fontWeight:tot||big?800:500,color:color||T.dark,fontSize:big?15:13,fontFamily:"monospace"}}>{typeof v==="number"?fmt(v):v||""}</span>
            </div>
          ))}
        </div>
        <div>
          <StatCard title="Month-wise Output GST" rows={Object.entries(monthly).map(([m,v])=>[m,fmt(v),T.amber])}/>
          <div style={{marginTop:14,background:"#EEF2F7",borderRadius:10,padding:"12px 16px",fontSize:12,color:T.slate}}>
            <strong>Filing deadlines:</strong><br/>
            GSTR-1: 11th of next month<br/>
            GSTR-3B: 20th of next month (with payment)<br/>
            ITC claim: Match with GSTR-2B before claiming
          </div>
        </div>
      </div>
    </div>
  );
}
