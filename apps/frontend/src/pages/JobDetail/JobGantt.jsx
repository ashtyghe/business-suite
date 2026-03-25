import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { addLog, fmtDate } from "../../utils/helpers";
import { SECTION_COLORS } from "../../fixtures/seedData.jsx";
import s from './JobGantt.module.css';

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
        <div className={s.addPhaseCenter}>
          <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff" }} onClick={() => { setEditPhase(null); setPhaseForm({ ...defaultPhase }); setShowPhaseForm(true); }}>+ Add Phase</button>
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
      w.document.write(`<tr><td style="font-weight:600">${p.name}</td><td>${fmtDate(p.startDate)}</td><td>${fmtDate(p.endDate)}</td><td>${p.progress}%</td><td class="bar-cell"><div class="bar" style="left:${pStart}%;width:${pWidth}%;background:${p.color}30"><div class="bar-prog" style="width:${p.progress}%;background:${p.color}"></div></div></td></tr>`);
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
      <div className={s.header}>
        <div className={s.phaseSummary}>{phases.length} phase{phases.length !== 1 ? "s" : ""} · {minDate} → {maxDate}</div>
        <button className="btn btn-ghost btn-sm" onClick={printGanttPdf}>🖨️ Export PDF</button>
        <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: jobAccent, color: "#fff" }} onClick={() => { setEditPhase(null); setPhaseForm({ ...defaultPhase }); setShowPhaseForm(true); }}>+ Add Phase</button>
      </div>

      {showPhaseForm && (
        <div className={s.phaseFormCard}>
          <div className={s.phaseFormGrid}>
            <div><label className={s.fieldLabel}>Phase Name</label><input className="form-control" value={phaseForm.name} onChange={e => setPhaseForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Demolition" /></div>
            <div><label className={s.fieldLabel}>Color</label><input type="color" value={phaseForm.color} onChange={e => setPhaseForm(f => ({ ...f, color: e.target.value }))} className={s.colorInput} /></div>
            <div><label className={s.fieldLabel}>Start Date</label><input type="date" className="form-control" value={phaseForm.startDate} onChange={e => setPhaseForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div><label className={s.fieldLabel}>End Date</label><input type="date" className="form-control" value={phaseForm.endDate} onChange={e => setPhaseForm(f => ({ ...f, endDate: e.target.value }))} /></div>
          </div>
          <div className={s.progressWrap}>
            <label className={s.fieldLabel}>Progress: {phaseForm.progress}%</label>
            <input type="range" min="0" max="100" step="5" value={phaseForm.progress} onChange={e => setPhaseForm(f => ({ ...f, progress: parseInt(e.target.value) }))} className={s.rangeInput} />
          </div>
          <div className={s.formActions}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowPhaseForm(false); setEditPhase(null); }}>Cancel</button>
            <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: jobAccent, color: "#fff" }} onClick={savePhase} disabled={!phaseForm.name.trim()}>
              {editPhase ? "Update Phase" : "Add Phase"}
            </button>
          </div>
        </div>
      )}

      {/* Gantt Chart */}
      <div className={s.chartWrap}>
        <div className={s.chartHeader}>
          <div className={s.chartPhaseCol}>Phase</div>
          <div className={s.chartTimelineCol}>
            <span className={s.dateLabelLeft}>{fmtDate(minDate)}</span>
            <span className={s.dateLabelRight}>{fmtDate(maxDate)}</span>
          </div>
        </div>
        {phases.map(p => {
          const pStartMs = new Date(p.startDate + "T00:00:00").getTime();
          const pEndMs = new Date(p.endDate + "T23:59:59").getTime();
          const leftPct = ((pStartMs - startMs) / rangeMs) * 100;
          const widthPct = Math.max(2, ((pEndMs - pStartMs) / rangeMs) * 100);
          return (
            <div key={p.id} className={s.phaseRow}>
              <div className={s.phaseNameCol}>
                <div className={s.phaseDot} style={{ background: p.color }} />
                <span className={s.phaseName}>{p.name}</span>
                <button className={`btn btn-ghost ${s.phaseActionBtn}`} onClick={() => { setEditPhase(p); setPhaseForm({ name: p.name, startDate: p.startDate, endDate: p.endDate, color: p.color, progress: p.progress }); setShowPhaseForm(true); }}>✏️</button>
                <button className={`btn btn-ghost ${s.phaseActionBtnDanger}`} onClick={() => handleDeletePhase(p.id)}>🗑</button>
              </div>
              <div className={s.timelineCell}>
                {todayPct > 0 && todayPct < 100 && <div className={s.todayMarker} style={{ left: `${todayPct}%` }} />}
                <div className={s.barBg} style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: p.color + "25" }}>
                  <div className={s.barFill} style={{ width: `${p.progress}%`, background: p.color }} />
                </div>
                <div className={s.barLabel} style={{ left: `${leftPct + widthPct + 1}%` }}>{p.progress}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JobGantt;
