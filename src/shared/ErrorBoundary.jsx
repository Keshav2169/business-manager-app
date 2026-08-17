import { Component } from "react";
import { T } from "./constants.js";

// Catches render-time crashes in whatever it wraps and shows a recoverable
// screen instead of a white page. Without this, one malformed row coming back
// from a hand-edited Google Sheet (a null where a module expects a number, a
// missing field, a bad date string) throws during render and takes down the
// ENTIRE app for every module, not just the one with bad data — since this is
// a live-Sheets app where non-technical staff can edit rows directly, that's
// a real and recurring failure mode, not a hypothetical one.
//
// Two boundaries are used in App.jsx: one around the whole shell (catches
// crashes in the sidebar/topbar itself) and one around just the active
// module's view (so a bad Jobs row doesn't take out Dashboard, Invoices,
// etc. — the person can switch away from the broken module and keep working).
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[KE Business Suite] caught render error:", error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const { scope = "This section" } = this.props;
    return (
      <div style={{padding:24,margin:this.props.inline?0:20,background:"#FDECEA",border:`1px solid ${T.red}`,borderRadius:12,color:T.dark}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:24}} aria-hidden="true">⚠️</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:14,color:T.red,marginBottom:4}}>{scope} hit an unexpected error</div>
            <div style={{fontSize:12,color:T.slate,marginBottom:10,lineHeight:1.5}}>
              This is usually caused by a row with an unexpected value in the underlying Google Sheet.
              Your other data and modules are unaffected — you can keep working and come back to this later.
            </div>
            <details style={{fontSize:11,color:T.slate,marginBottom:10}}>
              <summary style={{cursor:"pointer",fontWeight:700}}>Technical details</summary>
              <pre style={{whiteSpace:"pre-wrap",marginTop:6,fontSize:10,background:"#fff",padding:8,borderRadius:6,border:`1px solid ${T.border}`}}>{String(this.state.error?.message || this.state.error)}</pre>
            </details>
            <button onClick={()=>this.setState({error:null})}
              style={{padding:"7px 16px",borderRadius:8,border:"none",background:T.navy,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              ↻ Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
