import { useState, useEffect } from "react";
import { T } from "./constants.js";
import { fmt, fmtD, stars, waLink } from "./utils.js";

// Small inline marker for a row that's waiting to sync (or stuck in
// conflict) — used generically by <Tbl> below so EVERY module's list view
// shows offline state for free, with no per-module changes required.
export const PendingBadge = ({ conflict, error }) => (
  <span
    title={conflict ? "Edited elsewhere too — needs your decision to sync (see the sync panel)" : error ? "Sync failed — will retry" : "Saved offline — will sync automatically when you're back online"}
    style={{display:"inline-block",marginRight:6,padding:"1px 7px",borderRadius:10,fontSize:9.5,fontWeight:800,letterSpacing:.3,verticalAlign:"middle",
      background:conflict?"#FADBD8":error?"#FADBD8":"#FCF3CF",
      color:conflict?T.red:error?T.red:T.amber,
      border:`1px solid ${conflict||error?T.red:T.amber}`}}>
    {conflict ? "⚠ CONFLICT" : error ? "⚠ RETRY" : "⏳ PENDING SYNC"}
  </span>
);

export const Badge = ({ label, color }) => {
  const bg={green:"#D5F5E3",red:"#FADBD8",amber:"#FBEEDD",blue:"#DBEAFE",purple:"#EAE4F5",teal:"#D6EEF2"};
  const fg={green:T.green,red:T.red,amber:T.amber,blue:"#1E40AF",purple:T.purple,teal:T.teal};
  return <span style={{display:"inline-block",padding:"2px 9px",borderRadius:12,fontSize:11,fontWeight:700,letterSpacing:.3,background:bg[color]||"#EEF2F7",color:fg[color]||T.slate}}>{label}</span>;
};

export const KPI = ({ icon, label, value, color, sub, onClick }) => (
  <div onClick={onClick} style={{background:T.white,borderRadius:12,padding:"13px 15px",border:`1px solid ${T.border}`,flex:1,minWidth:130,borderTop:`3px solid ${color||T.navy}`,cursor:onClick?"pointer":"default"}}>
    <div style={{fontSize:18,marginBottom:2}}>{icon}</div>
    <div style={{fontSize:18,fontWeight:800,color:color||T.navy,fontFamily:"monospace"}}>{value}</div>
    <div style={{fontSize:11,color:T.slate,marginTop:3,fontWeight:600,textTransform:"uppercase",letterSpacing:.4}}>{label}</div>
    {sub&&<div style={{fontSize:10,color:T.slate,marginTop:2}}>{sub}</div>}
  </div>
);

export const SHdr = ({ title, action, onAction, secondaryAction, onSecondary }) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
    <h2 style={{margin:0,fontSize:15,fontWeight:800,color:T.navy}}>{title}</h2>
    <div style={{display:"flex",gap:8}}>
      {secondaryAction&&<button onClick={onSecondary} style={{background:T.green,color:T.white,border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{secondaryAction}</button>}
      {action&&<button onClick={onAction} style={{background:T.navy,color:T.white,border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{action}</button>}
    </div>
  </div>
);

// Sortable, paginated table. Behaviour-compatible with the original Tbl —
// same props still work — but now also supports:
//  - click-to-sort on any column (asc → desc → unsorted), driven by row[c.key]
//    unless c.sortValue(row) is supplied for computed/rendered columns
//  - client-side pagination once a table exceeds `pageSize` rows (default 25),
//    so a 500-row Jobs/Invoices sheet doesn't render as one giant scroll
//  - icon-only Edit/Delete buttons now carry aria-label + title, since a
//    screen reader previously got nothing but "button, button" per row
export const Tbl = ({ cols, rows, emptyMsg="No records found.", onEdit, onDelete, onRowClick, pageSize=25 }) => {
  const [sort, setSort] = useState({ key:null, dir:1 });
  const [page, setPage] = useState(0);

  const sorted = (() => {
    if (!sort.key) return rows;
    const col = cols.find(c=>c.key===sort.key);
    const val = r => col?.sortValue ? col.sortValue(r) : r[sort.key];
    return [...rows].sort((a,b)=>{
      const av=val(a), bv=val(b);
      if (av==null && bv==null) return 0;
      if (av==null) return 1;
      if (bv==null) return -1;
      if (typeof av==="number" && typeof bv==="number") return (av-bv)*sort.dir;
      return String(av).localeCompare(String(bv))*sort.dir;
    });
  })();

  const pageCount = Math.max(1, Math.ceil(sorted.length/pageSize));
  const curPage = Math.min(page, pageCount-1);
  const pageRows = sorted.slice(curPage*pageSize, curPage*pageSize+pageSize);

  const toggleSort = key => setSort(s => s.key!==key ? {key,dir:1} : s.dir===1 ? {key,dir:-1} : {key:null,dir:1});

  return (
  <div>
    <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${T.border}`,WebkitOverflowScrolling:"touch"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr style={{background:T.navy}}>
            {cols.map(c=>{
              const active = sort.key===c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active?(sort.dir===1?"ascending":"descending"):"none"}
                  onClick={()=>toggleSort(c.key)}
                  style={{padding:"9px 11px",textAlign:c.right?"right":"left",color:T.white,fontWeight:700,fontSize:11,letterSpacing:.4,whiteSpace:"nowrap",cursor:"pointer",userSelect:"none"}}>
                  {c.label}
                  <span style={{marginLeft:4,opacity:active?1:.35,fontSize:9}}>{active?(sort.dir===1?"▲":"▼"):"▲▼"}</span>
                </th>
              );
            })}
            {(onEdit||onDelete)&&<th style={{padding:"9px 11px",color:T.white,fontSize:11,fontWeight:700,textAlign:"center"}}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {pageRows.length===0
            ? <tr><td colSpan={cols.length+(onEdit||onDelete?1:0)} style={{padding:32,textAlign:"center",color:T.slate,fontStyle:"italic"}}>{emptyMsg}</td></tr>
            : pageRows.map((row,ri)=>{
              const pending = !!row._pendingSync, conflict = !!row._conflict, syncError = !!row._syncError;
              const rowBg = conflict ? "#FDECEA" : pending ? "#FFFCF3" : (ri%2===0?T.white:T.light);
              return (
              <tr key={ri} onClick={()=>onRowClick&&onRowClick(row)}
                tabIndex={onRowClick?0:undefined}
                onKeyDown={e=>{ if(onRowClick && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); onRowClick(row); } }}
                style={{background:rowBg,cursor:onRowClick||onEdit?"pointer":"default"}}
                onMouseEnter={e=>{e.currentTarget.style.background="#EEF1F6";}}
                onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}>
                {cols.map((c,ci)=>(
                  <td key={c.key} style={{padding:"7px 11px",textAlign:c.right?"right":"left",borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap",fontWeight:c.bold?700:400}}>
                    {ci===0 && (pending||conflict) && <PendingBadge conflict={conflict} error={syncError}/>}
                    {c.render?c.render(row):row[c.key]??"—"}
                  </td>
                ))}
                {(onEdit||onDelete)&&(
                  <td style={{padding:"5px 11px",borderBottom:`1px solid ${T.border}`,textAlign:"center"}}>
                    {/* A row still queued as an unsynced CREATE has no real
                        Sheet row yet (rowIndex is null) — update/delete would
                        be sent with rowIndex:null, which the backend always
                        rejects, and flushQueue() would retry that exact same
                        failure forever with no user-facing way to clear it
                        (only "conflict" status gets a resolution UI). Disable
                        both actions until the create has actually synced. */}
                    {row._pendingSync && row.rowIndex==null ? (
                      <span title="This record hasn't finished syncing yet — edit and delete will be available once it's saved to Sheets." style={{fontSize:11,color:T.slate,fontStyle:"italic"}}>Syncing…</span>
                    ) : (
                    <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                      {onEdit&&<button aria-label="Edit record" title="Edit" onClick={e=>{e.stopPropagation();onEdit(row,ri);}} style={{background:T.navy,color:T.white,border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>✏️ Edit</button>}
                      {onDelete&&<button aria-label="Delete record" title="Delete" onClick={e=>{e.stopPropagation();onDelete(row,ri);}} style={{background:T.red,color:T.white,border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,cursor:"pointer",fontWeight:700}}>🗑️<span style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0,0,0,0)"}}> Delete</span></button>}
                    </div>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
        </tbody>
      </table>
    </div>
    {rows.length>0&&(
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,padding:"7px 14px",background:"#F8FAFB",border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",fontSize:11,color:T.slate}}>
        <span>{rows.length} record{rows.length!==1?"s":""}{sort.key?` · sorted by ${cols.find(c=>c.key===sort.key)?.label}`:""}</span>
        {pageCount>1&&(
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <button aria-label="Previous page" disabled={curPage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}
              style={{padding:"3px 9px",borderRadius:6,border:`1px solid ${T.border}`,background:T.white,cursor:curPage===0?"default":"pointer",opacity:curPage===0?.4:1,fontSize:11}}>◀ Prev</button>
            <span style={{fontWeight:700}}>Page {curPage+1} / {pageCount}</span>
            <button aria-label="Next page" disabled={curPage>=pageCount-1} onClick={()=>setPage(p=>Math.min(pageCount-1,p+1))}
              style={{padding:"3px 9px",borderRadius:6,border:`1px solid ${T.border}`,background:T.white,cursor:curPage>=pageCount-1?"default":"pointer",opacity:curPage>=pageCount-1?.4:1,fontSize:11}}>Next ▶</button>
          </div>
        )}
      </div>
    )}
  </div>
  );
};

export const Modal = ({ title, subtitle, onClose, children, wide, full }) => {
  // Esc closes the modal — was previously mouse/touch-only (backdrop click).
  useEffect(() => {
    const onKey = e => { if (e.key==="Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
  <div role="presentation" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.52)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:12}} onClick={onClose}>
    <div className="ke-modal" role="dialog" aria-modal="true" aria-label={title}
      style={{background:T.white,borderRadius:16,width:"100%",maxWidth:full?960:wide?700:540,boxShadow:"0 20px 60px rgba(0,0,0,.3)",maxHeight:"94vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 20px",background:T.navy,borderRadius:"16px 16px 0 0",position:"sticky",top:0,zIndex:1}}>
        <div>
          <div style={{fontWeight:800,color:T.white,fontSize:14}}>{title}</div>
          {subtitle&&<div style={{fontSize:11,color:"rgba(255,255,255,.72)",marginTop:2}}>{subtitle}</div>}
        </div>
        <button aria-label="Close dialog" onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:T.white,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:16,minWidth:32,minHeight:32}}>✕</button>
      </div>
      <div style={{padding:20}}>{children}</div>
    </div>
  </div>
  );
};

export const ConfirmModal = ({ msg, onConfirm, onCancel }) => {
  useEffect(() => {
    const onKey = e => { if (e.key==="Escape") onCancel?.(); if (e.key==="Enter") onConfirm?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);
  return (
  <div role="alertdialog" aria-modal="true" aria-label="Confirm delete" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:T.white,borderRadius:16,padding:28,maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
      <div style={{fontSize:32,textAlign:"center",marginBottom:12}} aria-hidden="true">🗑️</div>
      <div style={{fontSize:14,fontWeight:700,color:T.dark,textAlign:"center",marginBottom:8}}>Confirm Delete</div>
      <div style={{fontSize:13,color:T.slate,textAlign:"center",marginBottom:20,lineHeight:1.6}}>{msg||"This record will be marked deleted in Google Sheets. Cannot be undone."}</div>
      <div style={{display:"flex",gap:10,justifyContent:"center"}}>
        <button autoFocus onClick={onCancel} style={{padding:"10px 22px",borderRadius:8,border:`1px solid ${T.border}`,background:T.white,cursor:"pointer",fontSize:13,fontWeight:600,minHeight:40}}>Cancel</button>
        <button onClick={onConfirm} style={{padding:"10px 22px",borderRadius:8,border:"none",background:T.red,color:T.white,cursor:"pointer",fontSize:13,fontWeight:700,minHeight:40}}>Delete Record</button>
      </div>
    </div>
  </div>
  );
};

// Section header for long forms. Plain by default (unchanged look/behaviour).
// Pass `collapsible` to make it an expand/collapse group — wrap the section's
// fields in <FSec.Body> right after it. Used to tame very long forms (e.g.
// Jobs' 30+ fields) by defaulting less-used sections (Safety, Tools, Remarks)
// to collapsed so the primary fields aren't buried in one long scroll.
export const FSec = ({ label, sub, collapsible, defaultOpen=true, open, onToggle }) => {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isOpen = open !== undefined ? open : localOpen;
  const toggle = () => onToggle ? onToggle(!isOpen) : setLocalOpen(o=>!o);
  if (!collapsible) {
    return (
      <div style={{margin:"18px 0 10px",paddingBottom:6,borderBottom:`2px solid ${T.light}`}}>
        <span style={{fontSize:11,fontWeight:800,color:T.navy,letterSpacing:.8,textTransform:"uppercase"}}>{label}</span>
        {sub&&<span style={{fontSize:11,color:T.slate,marginLeft:10,fontStyle:"italic"}}>{sub}</span>}
      </div>
    );
  }
  return (
    <button type="button" onClick={toggle} aria-expanded={isOpen}
      style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",margin:"18px 0 10px",paddingBottom:6,borderBottom:`2px solid ${T.light}`,background:"none",border:"none",borderBottomWidth:2,borderBottomStyle:"solid",borderBottomColor:T.light,cursor:"pointer",textAlign:"left"}}>
      <span>
        <span style={{fontSize:11,fontWeight:800,color:T.navy,letterSpacing:.8,textTransform:"uppercase"}}>{label}</span>
        {sub&&<span style={{fontSize:11,color:T.slate,marginLeft:10,fontStyle:"italic"}}>{sub}</span>}
      </span>
      <span style={{fontSize:11,color:T.slate,fontWeight:700}}>{isOpen?"▲ Hide":"▼ Show"}</span>
    </button>
  );
};
FSec.Body = ({ open=true, children }) => open ? <>{children}</> : null;

export const F = ({ label, name, type="text", value, onChange, options, required, placeholder, readOnly, hint, error }) => (
  <div style={{marginBottom:11}}>
    <label style={{display:"block",fontSize:11,fontWeight:700,color:error?T.red:T.navy,marginBottom:4,letterSpacing:.3}}>
      {label}{required&&<span style={{color:T.red}}> *</span>}
    </label>
    {options
      ? <select name={name} value={value||""} onChange={onChange} aria-invalid={!!error} aria-required={required} style={{width:"100%",padding:"9px 10px",borderRadius:8,border:`1.5px solid ${error?T.red:T.border}`,fontSize:13,background:T.white,outline:"none",color:T.dark,minHeight:38}}>
          <option value="">— Select —</option>
          {options.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      : <input type={type} name={name} value={value||""} onChange={onChange} placeholder={placeholder||""} readOnly={readOnly} aria-invalid={!!error} aria-required={required}
          style={{width:"100%",padding:"9px 10px",borderRadius:8,border:`1.5px solid ${error?T.red:T.border}`,fontSize:13,outline:"none",boxSizing:"border-box",color:T.dark,background:readOnly?"#F8F9FA":T.white,minHeight:38}}/>
    }
    {error&&<div style={{fontSize:10,color:T.red,marginTop:3,fontWeight:600}}>⚠ {error}</div>}
    {!error&&hint&&<div style={{fontSize:10,color:T.slate,marginTop:3}}>{hint}</div>}
  </div>
);

export const FTxt = ({ label, name, value, onChange, placeholder, rows=3, required, error }) => (
  <div style={{marginBottom:11}}>
    <label style={{display:"block",fontSize:11,fontWeight:700,color:error?T.red:T.navy,marginBottom:4}}>
      {label}{required&&<span style={{color:T.red}}> *</span>}
    </label>
    <textarea name={name} value={value||""} onChange={onChange} rows={rows} placeholder={placeholder||""}
      style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1.5px solid ${error?T.red:T.border}`,fontSize:13,outline:"none",boxSizing:"border-box",resize:"vertical",fontFamily:"inherit"}}/>
    {error&&<div style={{fontSize:10,color:T.red,marginTop:3,fontWeight:600}}>⚠ {error}</div>}
  </div>
);

export const G2 = ({ children }) => <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{children}</div>;
export const G3 = ({ children }) => <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>{children}</div>;
export const G4 = ({ children }) => <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>{children}</div>;

export const Btns = ({ onClose, onSave, saving, isEdit, label }) => (
  <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
    <button type="button" onClick={onClose} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${T.border}`,background:T.white,cursor:"pointer",fontSize:13,color:T.slate}}>Cancel</button>
    <button type="button" onClick={onSave} disabled={!!saving} style={{padding:"8px 20px",borderRadius:8,border:"none",background:saving?"#94a3b8":isEdit?T.green:T.navy,color:T.white,cursor:saving?"not-allowed":"pointer",fontSize:13,fontWeight:700}}>
      {saving?"Saving…":isEdit?"✏️ Update Record":"💾 "+(label||"Save to Google Sheets")}
    </button>
  </div>
);

export const CalcStrip = ({ items }) => (
  <div style={{background:T.navy,borderRadius:10,padding:"11px 14px",marginBottom:14}}>
    <div style={{color:T.gold,fontWeight:700,fontSize:11,marginBottom:7}}>LIVE CALCULATION</div>
    <div style={{display:"grid",gridTemplateColumns:`repeat(${items.length},1fr)`,gap:6}}>
      {items.map(([l,v,hi])=>(
        <div key={l} style={{background:hi?"rgba(216,154,58,.3)":"rgba(255,255,255,.1)",borderRadius:7,padding:"7px 8px",textAlign:"center"}}>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:9,marginBottom:1}}>{l}</div>
          <div style={{color:hi?T.gold:T.white,fontWeight:800,fontFamily:"monospace",fontSize:12}}>{v}</div>
        </div>
      ))}
    </div>
  </div>
);

export const ProgressBar = ({ value, max, color=T.navy, label, showPct=true }) => {
  const p=max?Math.min(100,Math.round(value/max*100)):0;
  return (
    <div>
      {label&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
        <span style={{fontSize:12,fontWeight:600}}>{label}</span>
        {showPct&&<span style={{fontSize:12,color:T.slate}}>{p}%</span>}
      </div>}
      <div style={{height:7,background:"#E8ECF2",borderRadius:6}}>
        <div style={{height:"100%",width:`${p}%`,background:color,borderRadius:6,transition:"width .3s"}}/>
      </div>
    </div>
  );
};

export const Alert = ({ type="amber", icon, msg, sub }) => {
  const bg={red:"#FADBD8",amber:"#FBEEDD",green:"#D5F5E3",blue:"#DBEAFE"};
  const bc={red:T.red,amber:T.amber,green:T.green,blue:"#1E40AF"};
  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",borderRadius:10,border:`1px solid ${T.border}`,background:bg[type]||bg.amber,borderLeft:`4px solid ${bc[type]||bc.amber}`,marginBottom:10}}>
      {icon&&<span style={{fontSize:16,flexShrink:0,marginTop:1}}>{icon}</span>}
      <div>
        <div style={{fontSize:13,color:T.dark,fontWeight:500}}>{msg}</div>
        {sub&&<div style={{fontSize:11,color:T.slate,marginTop:2}}>{sub}</div>}
      </div>
    </div>
  );
};

export const WA = ({ mobile, msg, label="WA" }) => (
  <a href={waLink(mobile,msg)} target="_blank" rel="noreferrer"
    style={{background:"#25D366",color:T.white,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,textDecoration:"none",display:"inline-block"}}>
    {label}
  </a>
);

// Debounces the actual filter (onChange) by ~180ms so a large table (Ledger,
// Inventory) doesn't re-filter its full in-memory row array on every single
// keystroke — typing itself stays instant since the input's own value is
// local state, only the onChange callback to the parent is delayed.
export const Search = ({ value, onChange, placeholder="Search...", debounceMs=180 }) => {
  const [local, setLocal] = useState(value ?? "");
  // Stay in sync if the parent resets/changes `value` from elsewhere (e.g.
  // a "clear filters" action) — this only reacts to the PARENT's value
  // changing, never fires from our own keystrokes below.
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  useEffect(() => {
    const t = setTimeout(() => { if (local !== value) onChange(local); }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [local]);
  return (
    <input value={local} onChange={e=>setLocal(e.target.value)} placeholder={placeholder}
      style={{width:"100%",padding:"9px 13px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,marginBottom:12,outline:"none",boxSizing:"border-box"}}/>
  );
};

export const Pills = ({ options, active, onChange }) => (
  <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
    {options.map(({label,value,count})=>(
      <button key={value} onClick={()=>onChange(value)} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",background:active===value?T.navy:"#E8ECF2",color:active===value?T.white:T.slate,fontWeight:700,fontSize:11}}>
        {label}{count!=null&&<span style={{marginLeft:4,background:"rgba(255,255,255,.25)",borderRadius:10,padding:"0 5px"}}>{count}</span>}
      </button>
    ))}
  </div>
);

export const DetailGrid = ({ fields, cols=2 }) => (
  <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:8,marginBottom:12}}>
    {fields.filter(([,v])=>v!=null&&v!=="").map(([l,v,span])=>(
      <div key={l} style={{background:T.light,borderRadius:8,padding:"7px 11px",gridColumn:span?`span ${span}`:undefined}}>
        <div style={{fontSize:10,color:T.slate,fontWeight:700,marginBottom:2}}>{l}</div>
        <div style={{fontSize:13,fontWeight:600,color:T.dark,wordBreak:"break-word"}}>{v||"—"}</div>
      </div>
    ))}
  </div>
);

export const AmtTable = ({ rows }) => (
  <div style={{border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>
    {rows.filter(Boolean).map(([label,val],i)=>{
      const isTotal=["NET PAYABLE","Invoice Total","Taxable Amount","GRAND TOTAL"].includes(label);
      return (
        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",background:label==="NET PAYABLE"?T.navy:isTotal?T.light:i%2===0?T.white:"#FAFBFC",borderBottom:`1px solid ${T.border}`}}>
          <span style={{fontSize:13,fontWeight:isTotal?700:400,color:label==="NET PAYABLE"?T.white:T.dark}}>{label}</span>
          <span style={{fontSize:isTotal?14:13,fontWeight:isTotal?800:500,color:label==="NET PAYABLE"?T.gold:val<0?T.red:T.dark,fontFamily:"monospace"}}>
            {typeof val==="number"?fmt(Math.abs(val)):val}
          </span>
        </div>
      );
    })}
  </div>
);

export const StatCard = ({ title, rows }) => (
  <div style={{background:T.white,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
    <div style={{background:T.navy,padding:"9px 14px"}}><span style={{fontWeight:700,color:T.white,fontSize:13}}>{title}</span></div>
    {rows.map(([l,v,color],i)=>(
      <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:i%2===0?T.white:T.light,borderBottom:`1px solid ${T.border}`}}>
        <span style={{fontSize:13,color:T.dark}}>{l}</span>
        <span style={{fontSize:13,fontWeight:700,color:color||T.navy,fontFamily:"monospace"}}>{v}</span>
      </div>
    ))}
  </div>
);

export const FYSelector = ({ fy, setFY, allFYs, currentFY }) => (
  <div style={{display:"flex",alignItems:"center",gap:8}}>
    <span style={{fontSize:11,color:T.slate,fontWeight:600}}>FY:</span>
    <select value={fy} onChange={e=>setFY(e.target.value)}
      style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:12,fontWeight:700,color:T.navy,background:T.light,cursor:"pointer",outline:"none"}}>
      {allFYs.map(f=><option key={f} value={f}>{f}{f===currentFY?" (Current)":""}</option>)}
    </select>
    {fy!==currentFY&&<span style={{background:"#FCF3CF",color:T.amber,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,border:`1px solid ${T.amber}`}}>Past FY</span>}
  </div>
);

export const SaveStatus = ({ status }) => {
  if (!status) return null;
  const cfg={saving:{bg:"#E0F2FE",color:"#0369a1",text:"Saving to Google Sheets…"},saved:{bg:"#D5F5E3",color:T.green,text:"✅ Saved to Google Sheets"},demo:{bg:"#FCF3CF",color:T.amber,text:"⚡ Demo mode — connect Google Sheets to persist data"},error:{bg:"#FADBD8",color:T.red,text:"❌ Save failed — check Apps Script URL"}}[status]||{};
  return <div style={{padding:"8px 13px",borderRadius:8,background:cfg.bg,color:cfg.color,fontSize:12,fontWeight:600,marginTop:8}}>{cfg.text}</div>;
};

// Header pill: how many offline changes are waiting to sync, plus a manual
// "Sync now" button. Lives once in App.jsx's topbar rather than per-module —
// every module's writes flow into the same queue, so one indicator covers
// all of them.
export const SyncStatusBadge = ({ pendingCount, conflictCount, syncing, online, onSyncNow }) => {
  if (!pendingCount && !conflictCount && online) return null;
  const label = !online
    ? `📴 Offline${pendingCount?` — ${pendingCount} waiting to sync`:""}`
    : conflictCount
      ? `⚠ ${conflictCount} conflict${conflictCount!==1?"s":""} need attention`
      : syncing
        ? "↻ Syncing…"
        : `⏳ ${pendingCount} pending sync`;
  const bg = conflictCount ? "#FDECEA" : !online ? "#EEF2F7" : "#FCF3CF";
  const fg = conflictCount ? T.red : !online ? T.slate : T.amber;
  return (
    <button onClick={onSyncNow} disabled={syncing||!online}
      title={!online?"Changes are saved locally and will sync once you're back online":"Push queued changes to Google Sheets now"}
      style={{background:bg,color:fg,border:`1px solid ${fg}`,borderRadius:8,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:(syncing||!online)?"default":"pointer",minHeight:34,opacity:syncing?.7:1}}>
      {label}{online&&!syncing&&(pendingCount||conflictCount)?" · Sync now":""}
    </button>
  );
};

// One row/pair of "mine" vs "theirs" for a single queued edit that collided
// with someone else's change on the same record while this person was
// offline. Nothing applies until Keep Mine / Keep Theirs is chosen.
export const ConflictModal = ({ conflicts, onResolve, onClose }) => {
  if (!conflicts || !conflicts.length) return null;
  return (
    <Modal title="⚠ Sync conflicts" subtitle={`${conflicts.length} record${conflicts.length!==1?"s were":" was"} edited by someone else while you were offline`} onClose={onClose} wide>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {conflicts.map(c=>(
          <div key={c.localId} style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
            <div style={{background:T.light,padding:"8px 12px",fontWeight:700,fontSize:12,color:T.navy}}>
              {c.sheet} — {c.label}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
              <div style={{padding:"10px 12px",borderRight:`1px solid ${T.border}`}}>
                <div style={{fontSize:10,fontWeight:800,color:T.amber,marginBottom:6,letterSpacing:.4}}>YOUR OFFLINE EDIT</div>
                {c.diffs.map(d=>(
                  <div key={d.field} style={{fontSize:12,marginBottom:4}}>
                    <span style={{color:T.slate}}>{d.field}: </span>
                    <span style={{fontWeight:600}}>{String(d.mine??"—")}</span>
                  </div>
                ))}
              </div>
              <div style={{padding:"10px 12px"}}>
                <div style={{fontSize:10,fontWeight:800,color:T.red,marginBottom:6,letterSpacing:.4}}>
                  THEIR EDIT{c.theirsBy?` — ${c.theirsBy}`:""}{c.theirsAt?` (${c.theirsAt})`:""}
                </div>
                {c.diffs.map(d=>(
                  <div key={d.field} style={{fontSize:12,marginBottom:4}}>
                    <span style={{color:T.slate}}>{d.field}: </span>
                    <span style={{fontWeight:600}}>{String(d.theirs??"—")}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",padding:"10px 12px",borderTop:`1px solid ${T.border}`,background:"#FAFBFC"}}>
              <button onClick={()=>onResolve(c.localId,"theirs")} style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${T.border}`,background:T.white,cursor:"pointer",fontSize:12,fontWeight:700,color:T.dark}}>Keep Theirs</button>
              <button onClick={()=>onResolve(c.localId,"mine")} style={{padding:"7px 16px",borderRadius:8,border:"none",background:T.navy,color:T.white,cursor:"pointer",fontSize:12,fontWeight:700}}>Keep Mine</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

// Full visibility into the offline write queue — opened from the header's
// pending-count area (see the 📋 button next to SyncStatusBadge in
// App.jsx). Lists EVERY item in the queue, grouped by status
// (error/conflict/pending), not just the conflicts that already get their
// own modal. Does NOT change flushQueue's own automatic-retry-on-reconnect
// behavior — this is an additional way to SEE and ACT ON the queue.
export const SyncQueuePanel = ({ items, conflicts, onClose, onRetry, onDiscard, onResolve }) => {
  const [discardTarget, setDiscardTarget] = useState(null);
  const pending = (items||[]).filter(i => i.status==="pending");
  const errors  = (items||[]).filter(i => i.status==="error");
  const total = pending.length + errors.length + (conflicts?.length||0);

  const actionLabel = a => a==="append" ? "NEW" : a==="softDelete" ? "DELETE" : "EDIT";

  const Row = ({ item, children }) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",borderBottom:`1px solid ${T.border}`,gap:10}}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:12.5,fontWeight:700,color:T.dark}}>
          {item.sheet} — {item.label}
          <span style={{fontSize:9.5,fontWeight:800,letterSpacing:.3,color:T.slate,background:T.light,border:`1px solid ${T.border}`,borderRadius:6,padding:"1px 6px",marginLeft:7}}>{actionLabel(item.action)}</span>
        </div>
        {item.errorMsg && <div style={{fontSize:11,color:T.red,marginTop:2}}>{item.errorMsg}</div>}
      </div>
      {children && <div style={{display:"flex",gap:6,flexShrink:0}}>{children}</div>}
    </div>
  );

  return (
    <Modal title="🔄 Sync Queue" subtitle={`${total} item${total!==1?"s":""} waiting to sync`} onClose={onClose} wide>
      {total===0 && (
        <div style={{textAlign:"center",padding:"30px 10px",color:T.slate,fontSize:13}}>Nothing queued — everything's synced. ✅</div>
      )}

      {errors.length>0 && (
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:800,color:T.red,letterSpacing:.4,marginBottom:6}}>NEEDS ATTENTION ({errors.length})</div>
          <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
            {errors.map(item=>(
              <Row key={item.localId} item={item}>
                <button onClick={()=>onRetry(item.localId)} style={{padding:"5px 11px",borderRadius:7,border:`1px solid ${T.border}`,background:T.white,cursor:"pointer",fontSize:11,fontWeight:700,color:T.navy,minHeight:30}}>Retry now</button>
                <button onClick={()=>setDiscardTarget(item.localId)} style={{padding:"5px 11px",borderRadius:7,border:"none",background:T.red,color:T.white,cursor:"pointer",fontSize:11,fontWeight:700,minHeight:30}}>Discard</button>
              </Row>
            ))}
          </div>
        </div>
      )}

      {conflicts?.length>0 && (
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:800,color:T.amber,letterSpacing:.4,marginBottom:6}}>CONFLICTS ({conflicts.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {conflicts.map(c=>(
              <div key={c.localId} style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{background:T.light,padding:"7px 12px",fontWeight:700,fontSize:12,color:T.navy}}>{c.sheet} — {c.label}</div>
                <div style={{display:"flex",gap:10,justifyContent:"flex-end",padding:"8px 12px"}}>
                  <button onClick={()=>onResolve(c.localId,"theirs")} style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${T.border}`,background:T.white,cursor:"pointer",fontSize:11,fontWeight:700,color:T.dark,minHeight:30}}>Keep Theirs</button>
                  <button onClick={()=>onResolve(c.localId,"mine")} style={{padding:"6px 14px",borderRadius:7,border:"none",background:T.navy,color:T.white,cursor:"pointer",fontSize:11,fontWeight:700,minHeight:30}}>Keep Mine</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length>0 && (
        <div>
          <div style={{fontSize:11,fontWeight:800,color:T.amber,letterSpacing:.4,marginBottom:6}}>PENDING ({pending.length})</div>
          <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
            {pending.map(item=><Row key={item.localId} item={item}/>)}
          </div>
        </div>
      )}

      {discardTarget && (
        <ConfirmModal
          msg="This queued change will be permanently discarded and never synced to Google Sheets. This cannot be undone."
          onConfirm={()=>{ onDiscard(discardTarget); setDiscardTarget(null); }}
          onCancel={()=>setDiscardTarget(null)}
        />
      )}
    </Modal>
  );
};

export const useToast = () => {
  const [toast,setToast] = useState(null);
  const show = (msg,type="green") => { setToast({msg,type}); setTimeout(()=>setToast(null),3200); };
  const Toast = () => toast?(
    <div style={{position:"fixed",bottom:24,right:24,background:toast.type==="green"?T.green:toast.type==="amber"?T.amber:T.red,color:T.white,padding:"12px 20px",borderRadius:12,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(0,0,0,.25)",zIndex:9999,display:"flex",alignItems:"center",gap:8}}>
      {toast.type==="green"?"✅":toast.type==="amber"?"⚡":"❌"} {toast.msg}
    </div>
  ):null;
  return { show, Toast };
};
