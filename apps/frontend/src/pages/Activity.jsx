import { useState } from "react";
import { useAppStore } from '../lib/store';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';

const ActivityPage = () => {
  const { jobs, clients, quotes, invoices, bills, timeEntries, schedule } = useAppStore();
  const [filterType, setFilterType] = useState("all");
  const [filterJob, setFilterJob] = useState("all");

  // Collect all activity events from all jobs
  const allEvents = [];
  jobs.forEach(j => {
    const client = clients.find(c => c.id === j.clientId);
    (j.activityLog || []).forEach(e => allEvents.push({ ...e, entityType: "job", entityLabel: j.title, entitySub: client?.name, jobId: j.id }));
  });

  // Sort newest first
  allEvents.sort((a, b) => b.ts > a.ts ? 1 : -1);

  const filtered = allEvents
    .filter(e => filterType === "all" || e.entityType === filterType)
    .filter(e => filterJob === "all" || String(e.jobId) === filterJob);

  const typeColors = { job: "#111", quote: "#555", invoice: "#333", bill: "#777", time: "#999" };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
          {["all","job"].map(t => (
            <button key={t} className={`btn btn-sm ${filterType === t ? "" : "btn-secondary"}`}
              onClick={() => setFilterType(t)} style={filterType === t ? { background: SECTION_COLORS.activity.accent, color: '#fff', textTransform: "capitalize" } : { textTransform: "capitalize" }}>
              {t === "all" ? "All Events" : `Jobs`}
            </button>
          ))}
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="all">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Events", val: allEvents.length },
          { label: "Today", val: allEvents.filter(e => e.ts.startsWith(new Date().toLocaleDateString("en-AU",{day:"2-digit",month:"short",year:"numeric"}))).length },
          { label: "This Week", val: (() => { const d=new Date(); d.setDate(d.getDate()-7); const w=d.toISOString().slice(0,10); return allEvents.filter(e => e.ts >= w).length; })() },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ flex: 1, padding: "14px 18px" }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 24 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No activity events found</div></div>
      ) : (
        <div className="card">
          <div style={{ padding: "0 4px" }}>
            <div className="timeline" style={{ padding: "16px 24px 16px 40px" }}>
              {filtered.map((e, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-dot" style={{ background: typeColors[e.entityType] || "#111" }} />
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>{e.action}</div>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
                        <span style={{ fontWeight: 600, color: "#555" }}>{e.entityLabel}</span>
                        {e.entitySub && <span style={{ color: "#bbb" }}> · {e.entitySub}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>{e.user}</div>
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 1 }}>{e.ts}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
