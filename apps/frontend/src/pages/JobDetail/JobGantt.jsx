import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { addLog } from "../../utils/helpers";
import { SECTION_COLORS } from "../../fixtures/seedData.jsx";

const JobGantt = ({ job }) => {
  const { setJobs } = useAppStore();
  const jobAccent = SECTION_COLORS.jobs.accent;
  const defaultPhase = { name: "", startDate: job.startDate || new Date().toISOString().slice(0,10), endDate: job.dueDate || new Date().toISOString().slice(0,10), color: "#3b82f6", progress: 0 };

  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [editPhase, setEditPhase] = useState(null);
  const [phaseForm, setPhaseForm] = useState({ ...defaultPhase });

  const phases = job.phases || [];

  if (phases.length === 0 && !showPhaseForm) {
    return (
      <div>
        <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-text">No project phases yet</div></div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => { setEditPhase(null); setPhaseForm({ ...defaultPhase }); setShowPhaseForm(true); }}>+ Add Phase</button>
        </div>
      </div>
    );
  }

  const allDates = phases.flatMap(p => [p.startDate, p.endDate]).filter(Boolean);
  const minDate = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : job.startDate || new Date().toISOString().slice(0,10);
  const maxDate = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : job.dueDate || new Date().toISOString().slice(0,10);
  const startMs = new Date(minDate + "T00:00:00").getTime();
  const endMs = new Date(maxDate + "T23:59:59").getTime();
  const rangeMs = Math.max(endMs - startMs, 86400000);
  const todayStr = new Date().toISOString().slice(0,10);
  const todayMs = new Date(todayStr + "T12:00:00").getTime();
  const todayPct = Math.max(0, Math.min(100, ((todayMs - startMs) / rangeMs) * 100));

  const printGanttPdf = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Gantt – ${job.title}</title><style>body{font-family:sans-serif;padding:30px}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left;font-size:13px}th{background:#f5f5f5;font-weight:700}.bar-cell{position:relative;height:24px}.bar{position:absolute;height:20px;border-radius:4px;top:2px}.bar-prog{height:100%;border-radius:4px;opacity:0.7}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#888;margin-top:0}</style></head><body>`);
    w.document.write(`<h1>${job.title}</h1><h2>Project Schedule — Gantt Chart</h2>`);
    w.document.write(`<table><thead><tr><th style="width:160px">Phase</th><th>Start</th><th>End</th><th>Progress</th><th style="width:40%">Timeline</th></tr></thead><tbody>`);
    phases.forEach(p => {
      const pStart = ((new Date(p.startDate + "T00:00:00").getTime() - startMs) / rangeMs) * 100;
      const pWidth = Math.max(2, ((new Date(p.endDate + "T23:59:59").getTime() - new Date(p.startDate + "T00:00:00").getTime()) / rangeMs) * 100);
      w.document.write(`<tr><td style="font-weight:600">${p.name}</td><td>${p.startDate}</td><td>${p.endDate}</td><td>${p.progress}%</td><td class="bar-cell"><div class="bar" style="left:${pStart}%;width:${pWidth}%;background:${p.color}30"><div class="bar-prog" style="width:${p.progress}%;background:${p.color}"></div></div></td></tr>`);
    });
    w.document.write(`</tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const savePhase = () => {
    if (!phaseForm.name.trim()) return;
    const updated = editPhase
      ? (job.phases || []).map(p => p.id === editPhase.id ? { ...p, ...phaseForm } : p)
      : [...(job.phases || []), { ...phaseForm, id: Date.now() }];
    setJobs(js => js.map(j => j.id === job.id ? { ...j, phases: updated, activityLog: addLog(j.activityLog, editPhase ? `Updated phase "${phaseForm.name}"` : `Added phase "${phaseForm.name}"`) } : j));
    setShowPhaseForm(false); setEditPhase(null);
  };
  const handleDeletePhase = (pid) => {
    setJobs(js => js.map(j => j.id === job.id ? { ...j, phases: (j.phases || []).filter(p => p.id !== pid), activityLog: addLog(j.activityLog, "Removed a project phase") } : j));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, fontSize: 12, color: "#888" }}>{phases.length} phase{phases.length !== 1 ? "s" : ""} · {minDate} → {maxDate}</div>
        <button className="btn btn-ghost btn-sm" onClick={printGanttPdf}>🖨️ Export PDF</button>
        <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => { setEditPhase(null); setPhaseForm({ ...defaultPhase }); setShowPhaseForm(true); }}>+ Add Phase</button>
      </div>

      {showPhaseForm && (
        <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Phase Name</label><input className="form-control" value={phaseForm.name} onChange={e => setPhaseForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Demolition" /></div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Color</label><input type="color" value={phaseForm.color} onChange={e => setPhaseForm(f => ({ ...f, color: e.target.value }))} style={{ width: "100%", height: 36, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Start Date</label><input type="date" className="form-control" value={phaseForm.startDate} onChange={e => setPhaseForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>End Date</label><input type="date" className="form-control" value={phaseForm.endDate} onChange={e => setPhaseForm(f => ({ ...f, endDate: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Progress: {phaseForm.progress}%</label>
            <input type="range" min="0" max="100" step="5" value={phaseForm.progress} onChange={e => setPhaseForm(f => ({ ...f, progress: parseInt(e.target.value) }))} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowPhaseForm(false); setEditPhase(null); }}>Cancel</button>
            <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={savePhase} disabled={!phaseForm.name.trim()}>
              {editPhase ? "Update Phase" : "Add Phase"}
            </button>
          </div>
        </div>
      )}

      {/* Gantt Chart */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #e8e8e8" }}>
          <div style={{ width: 160, minWidth: 160, padding: "8px 12px", fontWeight: 700, fontSize: 11, color: "#888", borderRight: "1px solid #e8e8e8" }}>Phase</div>
          <div style={{ flex: 1, position: "relative", padding: "8px 0", fontSize: 10, color: "#aaa" }}>
            <span style={{ position: "absolute", left: 4 }}>{minDate}</span>
            <span style={{ position: "absolute", right: 4 }}>{maxDate}</span>
          </div>
        </div>
        {phases.map(p => {
          const pStartMs = new Date(p.startDate + "T00:00:00").getTime();
          const pEndMs = new Date(p.endDate + "T23:59:59").getTime();
          const leftPct = ((pStartMs - startMs) / rangeMs) * 100;
          const widthPct = Math.max(2, ((pEndMs - pStartMs) / rangeMs) * 100);
          return (
            <div key={p.id} style={{ display: "flex", borderBottom: "1px solid #f0f0f0", minHeight: 40, alignItems: "center" }}>
              <div style={{ width: 160, minWidth: 160, padding: "6px 12px", borderRight: "1px solid #e8e8e8", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.name}</span>
                <button className="btn btn-ghost" style={{ padding: 2, fontSize: 10 }} onClick={() => { setEditPhase(p); setPhaseForm({ name: p.name, startDate: p.startDate, endDate: p.endDate, color: p.color, progress: p.progress }); setShowPhaseForm(true); }}>✏️</button>
                <button className="btn btn-ghost" style={{ padding: 2, fontSize: 10, color: "#c00" }} onClick={() => handleDeletePhase(p.id)}>🗑</button>
              </div>
              <div style={{ flex: 1, position: "relative", height: 24, margin: "0 8px" }}>
                {todayPct > 0 && todayPct < 100 && <div style={{ position: "absolute", left: `${todayPct}%`, top: -2, bottom: -2, width: 2, background: "#ef4444", zIndex: 2, borderRadius: 1 }} />}
                <div style={{ position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, height: "100%", background: p.color + "25", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${p.progress}%`, height: "100%", background: p.color, borderRadius: 4, transition: "width 0.3s" }} />
                </div>
                <div style={{ position: "absolute", left: `${leftPct + widthPct + 1}%`, top: 3, fontSize: 10, color: "#888", whiteSpace: "nowrap" }}>{p.progress}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JobGantt;
