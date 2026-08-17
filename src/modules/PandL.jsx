import { T } from "../shared/constants.js";
import { fmt, exportCSV } from "../shared/utils.js";
import { KPI, SHdr, Alert } from "../shared/ui.jsx";

export default function PandL({ data={}, fy }) {
  const inv  = (data.invoices||[]).filter(i=>i.fy===fy);
  const exp  = (data.expenses||[]).filter(e=>e.fy===fy);
  const pur  = (data.purchases||[]).filter(p=>p.fy===fy);
  const pc   = (data.pettyCash||[]).filter(t=>t.fy===fy&&(t.type||t["Type"]||"")!=="Top-up");

  const rev       = inv.reduce((s,i)=>s+(+(i.taxableAmount||i["Taxable Amount (Rs)"]||0)),0);
  const outputGST = inv.reduce((s,i)=>s+(+(i.totalGST||i["Total GST (Rs)"]||0)),0);
  const tdsRecv   = inv.reduce((s,i)=>s+(+(i.tdsAmt||i["TDS Amount (Rs)"]||0)),0);
  const received  = inv.reduce((s,i)=>s+(+(i.amountReceived||i["Amount Received (Rs)"]||0)),0);
  const grandTotal= inv.reduce((s,i)=>s+(+(i.grandTotal||i["Grand Total (Rs)"]||0)),0);
  const opExp     = exp.reduce((s,e)=>s+(+(e.amount||e["Amount (Rs)"]||0)),0);
  const expGST    = exp.reduce((s,e)=>s+(+(e.gst||e["GST (Rs)"]||0)),0);
  const purAmt    = pur.reduce((s,p)=>s+(+(p.taxableAmount||p["Taxable Amount (Rs)"]||0)),0);
  const purGST    = pur.filter(p=>(p.itcEligible||p["ITC Eligible"])==="Yes").reduce((s,p)=>s+(+(p.totalGST||p["Total GST (Rs)"]||0)),0);
  const pcAmt     = pc.reduce((s,t)=>s+(+(t.amount||t["Amount (Rs)"]||0)),0);

  const totalExp  = opExp + purAmt + pcAmt;
  const net       = rev - totalExp;
  const margin    = rev ? Math.round(net/rev*100*10)/10 : 0;
  const netGST    = outputGST - expGST - purGST;

  const rows = [
    ["REVENUE",null,true],
    ["Sales Revenue (Taxable)",rev],
    ["Output GST Collected",outputGST,false,T.amber],
    ["TDS Deducted by Clients",-tdsRecv,false,T.amber],
    ["Total Invoiced",grandTotal,false,null,true],
    ["Amount Received",received,false,T.green],
    ["Balance Outstanding",grandTotal-received,false,T.red],
    ["EXPENSES",null,true],
    ["Operating Expenses",opExp],
    ["Material Purchases",purAmt],
    ["Petty Cash Expenses",pcAmt],
    ["TOTAL EXPENSES",totalExp,false,null,true],
    ["GROSS PROFIT / (LOSS)",net,false,net>=0?T.green:T.red,false,true],
    ["Net Margin",margin+"%",false,net>=0?T.green:T.red,false,true],
    ["GST SUMMARY",null,true],
    ["Output GST (A)",outputGST],
    ["Input ITC — Expenses",-expGST,false,T.green],
    ["Input ITC — Purchases",-purGST,false,T.green],
    ["NET GST PAYABLE",netGST,false,netGST>0?T.red:T.green,false,true],
  ];

  return (
    <div>
      <SHdr title={`📈 Profit & Loss Summary — FY ${fy}`} secondaryAction="⬇️ Export CSV" onSecondary={()=>{
        const rows=[["Particulars","Amount (Rs)"],["Revenue (Taxable)",rev],["Output GST",outputGST],["Total Invoiced",grandTotal],["Amount Received",received],["Operating Expenses",opExp],["Material Purchases",purAmt],["Petty Cash",pcAmt],["Total Expenses",totalExp],["Net Profit",net],["Net Margin %",margin+"%"],["Net GST Payable",netGST]];
        const csv=rows.map(r=>r.join(",")).join("\n");
        const blob=new Blob([csv],{type:"text/csv"});
        const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:"PL_"+fy+".csv"}); a.click();
      }}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <KPI icon="💰" label="Revenue"    value={fmt(rev)}       color={T.green}/>
        <KPI icon="💸" label="Expenses"   value={fmt(totalExp)}  color={T.red}/>
        <KPI icon="📊" label="Net Profit" value={fmt(net)}       color={net>=0?T.navy:T.red}/>
        <KPI icon="%" label="Net Margin"  value={margin+"%"}     color={T.gold}/>
        <KPI icon="🧾" label="GST Payable" value={fmt(netGST)}  color={netGST>0?T.red:T.green}/>
      </div>
      <Alert type="amber" icon="ℹ️" msg="Internal estimate — verify with CA before filing. Based on invoices, expenses and purchase bills entered in this FY."/>
      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
        {rows.map(([l,v,h,color,tot,big],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:h?"9px 20px":"10px 20px 10px 32px",background:h?T.navy:big?"#FEF9E7":tot?"#F0F4FB":i%2===0?"#fff":"#F8FAFB",borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontWeight:h||tot||big?700:400,color:h?"#fff":T.dark,fontSize:h?11:13,letterSpacing:h?.5:0,textTransform:h?"uppercase":"none"}}>{l}</span>
            <span style={{fontWeight:tot||big?800:500,color:color||T.dark,fontSize:big?16:13,fontFamily:"monospace"}}>
              {typeof v==="number" ? (v<0?`(${fmt(Math.abs(v))})`:fmt(v)) : v||""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
