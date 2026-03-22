import { useState } from "react";
import { useAppStore } from '../lib/store';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import s from './Activity.module.css';

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
      <div className={s.filterBar}>
        <div className={s.filterButtons}>
          {["all","job"].map(t => (
            <button key={t} className={`btn btn-sm ${filterType === t ? "" : "btn-secondary"} ${filterType === t ? s.filterBtnActive : s.filterBtn}`}
              onClick={() => setFilterType(t)} style={filterType === t ? { background: SECTION_COLORS.activity.accent } : undefined}>
              {t === "all" ? "All Events" : `Jobs`}
            </button>
          ))}
        </div>
        <select className={`form-control ${s.jobSelect}`} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="all">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>

      {/* Summary stats */}
      <div className={s.statsRow}>
        {[
          { label: "Total Events", val: allEvents.length },
          { label: "Today", val: allEvents.filter(e => e.ts.startsWith(new Date().toLocaleDateString("en-AU",{day:"2-digit",month:"short",year:"numeric"}))).length },
          { label: "This Week", val: (() => { const d=new Date(); d.setDate(d.getDate()-7); const w=d.toISOString().slice(0,10); return allEvents.filter(e => e.ts >= w).length; })() },
        ].map(st => (
          <div key={st.label} className={`stat-card ${s.statCard}`}>
            <div className="stat-label">{st.label}</div>
            <div className={`stat-value ${s.statVal}`}>{st.val}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No activity events found</div></div>
      ) : (
        <div className="card">
          <div className={s.timelineWrap}>
            <div className={`timeline ${s.timeline}`}>
              {filtered.map((e, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-dot" style={{ background: typeColors[e.entityType] || "#111" }} />
                  <div className={s.itemRow}>
                    <div className={s.itemContent}>
                      <div className={s.itemAction}>{e.action}</div>
                      <div className={s.itemMeta}>
                        <span className={s.itemLabel}>{e.entityLabel}</span>
                        {e.entitySub && <span className={s.itemSub}> · {e.entitySub}</span>}
                      </div>
                    </div>
                    <div className={s.itemRight}>
                      <div className={s.itemUser}>{e.user}</div>
                      <div className={s.itemTs}>{e.ts}</div>
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
