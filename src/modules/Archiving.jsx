import { useState, useEffect } from "react";
import { T } from "../shared/constants.js";
import { sheetsAPI, IS_DEMO } from "../shared/utils.js";
import { SHdr, Alert, useToast } from "../shared/ui.jsx";

const CONFIRM_WORD = "ARCHIVE";

// Small inline table — deliberately not the shared <Tbl>, which is built for
// row-editable data-entry sheets (sort/paginate/edit/delete). This is a
// short, fixed-length summary (one row per ARCHIVABLE_SHEETS entry, never
// paginated) with no per-row actions, so a plain table keeps it simple.
function ResultTable({ rows, cols }) {
  return (
    <div style={{overflowX:"auto",border:`1px solid ${T.border}`,borderRadius:10}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12.5}}>
        <thead>
          <tr style={{background:T.light}}>
            {cols.map(c=>(
              <th key={c.key} style={{textAlign:c.right?"right":"left",padding:"9px 12px",fontWeight:800,color:T.navy,borderBottom:`1px solid ${T.border}`}}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={r.sheet} style={{background:i%2?T.white:"#FAFBFC"}}>
              {cols.map(c=>(
                <td key={c.key} style={{textAlign:c.right?"right":"left",padding:"8px 12px",borderBottom:`1px solid ${T.border}`,fontWeight:c.key==="sheet"?700:400,color:c.color?c.color(r):T.dark,fontFamily:c.right?"monospace":"inherit"}}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Archiving({ user }) {
  const [yearsToKeep, setYearsToKeep] = useState(2);
  const [preview, setPreview]         = useState(null);   // last archivePreview() result
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError]     = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning]         = useState(false);

  const [runResult, setRunResult] = useState(null); // last archiveFY() result
  const [runError, setRunError]   = useState(null);

  const { show, Toast } = useToast();

  const loadPreview = async (yrs = yearsToKeep) => {
    setPreviewLoading(true); setPreviewError(null); setRunResult(null); setRunError(null);
    const res = await sheetsAPI.archivePreview(yrs);
    setPreviewLoading(false);
    if (res?.error) { setPreviewError(res.error); setPreview(null); return; }
    setPreview(res);
  };

  // "On open: call archivePreview and show a table" — auto-load once, on mount.
  useEffect(() => { loadPreview(2); /* eslint-disable-next-line */ }, []);

  const totalEligible = (preview?.results||[]).reduce((s,r)=>s+(r.eligibleToArchive||0),0);
  const totalSkipped   = (preview?.results||[]).reduce((s,r)=>s+(r.skippedOpen||0),0);

  const openConfirm = () => { setConfirmText(""); setConfirmOpen(true); };

  const runArchiving = async () => {
    setRunning(true); setRunError(null);
    const res = await sheetsAPI.archiveFY(yearsToKeep, user?.name);
    setRunning(false);
    setConfirmOpen(false);
    if (res?.error) { setRunError(res.error); show(res.error, "red"); return; }
    setRunResult(res);
    show("Archiving run complete", "green");
    // The preview is now stale (rows just moved) — clear it rather than let
    // it silently show pre-run numbers next to a post-run result.
    setPreview(null);
  };

  const previewCols = [
    { key:"sheet",             label:"Sheet" },
    { key:"totalRows",         label:"Total Rows",         right:true },
    { key:"eligibleToArchive", label:"Eligible to Archive", right:true, color:r=>r.eligibleToArchive>0?T.amber:T.slate },
    { key:"skippedOpen",       label:"Kept Open",          right:true, color:r=>r.skippedOpen>0?T.red:T.slate },
  ];
  const runCols = [
    { key:"sheet",       label:"Sheet" },
    { key:"archived",    label:"Archived",     right:true, color:r=>r.archived>0?T.green:T.slate },
    { key:"kept",        label:"Kept",         right:true },
    { key:"skippedOpen", label:"Skipped Open", right:true, color:r=>r.skippedOpen>0?T.amber:T.slate },
  ];

  return (
    <div>
      <SHdr title="FY Archiving" action={previewLoading?"Loading…":"↻ Re-Preview"} onAction={()=>loadPreview(yearsToKeep)}/>

      {IS_DEMO && <Alert type="amber" icon="🧪" msg="Demo mode — archiving preview/run is disabled." sub="Connect a real Apps Script backend to use this screen."/>}

      <Alert type="blue" icon="🗄️" msg="Moves old, CLOSED records out of the live sheets into a matching Archive tab."
        sub="Old records that are still open (unpaid invoice, unbilled job, live quotation, undeposited TDS) are always kept live regardless of FY — see 'Kept Open' below. Nothing is ever deleted."/>

      <div style={{display:"flex",alignItems:"flex-end",gap:14,marginBottom:16,flexWrap:"wrap"}}>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:T.navy,marginBottom:4}}>Years to Keep Live</label>
          <input type="number" min={1} max={10} value={yearsToKeep}
            onChange={e=>setYearsToKeep(Math.max(1,+e.target.value||1))}
            style={{width:100,padding:"9px 10px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:13,minHeight:38}}/>
        </div>
        <button onClick={()=>loadPreview(yearsToKeep)} disabled={previewLoading}
          style={{padding:"9px 18px",borderRadius:8,border:"none",background:T.navy,color:T.white,cursor:previewLoading?"not-allowed":"pointer",fontSize:13,fontWeight:700,minHeight:38}}>
          {previewLoading?"Loading…":"🔍 Preview"}
        </button>
        <button onClick={openConfirm} disabled={!preview || previewLoading || running}
          style={{padding:"9px 18px",borderRadius:8,border:"none",background:(!preview||previewLoading||running)?"#94a3b8":T.red,color:T.white,cursor:(!preview||previewLoading||running)?"not-allowed":"pointer",fontSize:13,fontWeight:700,minHeight:38}}
          title={!preview?"Run a preview first":""}>
          🗄️ Run Archiving
        </button>
      </div>

      {previewError && <Alert type="red" icon="⚠️" msg="Preview failed" sub={previewError}/>}

      {preview && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:800,color:T.navy,marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>
            Preview — keeping FY {" "}{preview.yearsToKeep ?? yearsToKeep} year(s) live · {totalEligible} row(s) eligible · {totalSkipped} kept open
          </div>
          <ResultTable rows={preview.results||[]} cols={previewCols}/>
        </div>
      )}

      {runError && <Alert type="red" icon="⚠️" msg="Archiving run failed" sub={runError}/>}

      {runResult && (
        <div>
          <Alert type="green" icon="✅" msg="Archiving run complete"
            sub="Row positions in every archived sheet just shifted — refresh the app (or switch FY and back) before editing records in the sheets touched below."/>
          <ResultTable rows={runResult.results||[]} cols={runCols}/>
        </div>
      )}

      {confirmOpen && (
        <div role="alertdialog" aria-modal="true" aria-label="Confirm archiving run"
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.white,borderRadius:16,padding:28,maxWidth:420,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
            <div style={{fontSize:32,textAlign:"center",marginBottom:12}} aria-hidden="true">🗄️</div>
            <div style={{fontSize:14,fontWeight:700,color:T.dark,textAlign:"center",marginBottom:8}}>Confirm Archiving Run</div>
            <div style={{fontSize:13,color:T.slate,textAlign:"center",marginBottom:16,lineHeight:1.6}}>
              This will move {totalEligible} row(s) across {(preview?.results||[]).filter(r=>r.eligibleToArchive>0).length} sheet(s) into their Archive tabs, keeping {yearsToKeep} year(s) live. Type <b>{CONFIRM_WORD}</b> to proceed.
            </div>
            <input value={confirmText} onChange={e=>setConfirmText(e.target.value)} placeholder={CONFIRM_WORD} autoFocus
              style={{width:"100%",padding:"9px 10px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:13,textAlign:"center",fontWeight:700,letterSpacing:1,boxSizing:"border-box",marginBottom:16,minHeight:38}}/>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setConfirmOpen(false)} disabled={running}
                style={{padding:"10px 22px",borderRadius:8,border:`1px solid ${T.border}`,background:T.white,cursor:"pointer",fontSize:13,fontWeight:600,minHeight:40}}>Cancel</button>
              <button onClick={runArchiving} disabled={confirmText!==CONFIRM_WORD || running}
                style={{padding:"10px 22px",borderRadius:8,border:"none",background:(confirmText!==CONFIRM_WORD||running)?"#94a3b8":T.red,color:T.white,cursor:(confirmText!==CONFIRM_WORD||running)?"not-allowed":"pointer",fontSize:13,fontWeight:700,minHeight:40}}>
                {running?"Archiving…":"Run Archiving"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast/>
    </div>
  );
}
