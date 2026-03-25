import { useState, memo } from "react";
import { useAppStore } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { createJob, updateJob, deleteJob } from '../lib/db';
import { fmt, fmtDate, calcQuoteTotal, daysUntil, mkLog, addLog } from '../utils/helpers';
import { SECTION_COLORS, ViewField, TEAM } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import { StatusBadge, AvatarGroup, SectionProgressBar, SectionDrawer } from '../components/shared';
import JobDetail from './JobDetail';
import s from './Jobs.module.css';

const Jobs = () => {
  const { jobs, setJobs, clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, staff, workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders } = useAppStore();
  const auth = useAuth();
  const canDeleteJob = auth.isAdmin || auth.isLocalDev;
  const canEditJob = (j) => auth.isAdmin || auth.isLocalDev || (j.assignedTo || []).includes(auth.currentUserName);
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [jobMode, setJobMode] = useState("edit");
  const [detailJob, setDetailJob] = useState(null);
  const [form, setForm] = useState({ title: "", clientId: "", status: "draft", priority: "medium", description: "", startDate: "", dueDate: "", assignedTo: [], tags: "", estimate: { labour: 0, materials: 0, subcontractors: 0, other: 0 } });

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const client = clients.find(c => c.id === j.clientId);
    const sites = client?.sites || [];
    const matchSearch = !search ||
      j.title.toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (j.description || "").toLowerCase().includes(q) ||
      (j.status || "").toLowerCase().includes(q) ||
      (j.priority || "").toLowerCase().includes(q) ||
      (j.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (j.assignedTo || []).some(n => n.toLowerCase().includes(q)) ||
      (client?.address || "").toLowerCase().includes(q) ||
      sites.some(s => (s.name || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q));
    return (filterStatus === "all" || j.status === filterStatus) && matchSearch;
  });

  const openNew = () => { setEditJob(null); setJobMode("edit"); setForm({ title: "", clientId: clients[0]?.id || "", siteId: null, status: "draft", priority: "medium", description: "", startDate: "", dueDate: "", assignedTo: [], tags: "", estimate: { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setShowModal(true); };
  const openEdit = (j) => { setEditJob(j); setJobMode("view"); setForm({ ...j, siteId: j.siteId || null, tags: j.tags.join(", "), estimate: j.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setShowModal(true); };
  const openDetail = (j) => setDetailJob(j);
  const save = async () => {
    const nextNum = jobs.length > 0 ? Math.max(...jobs.map(j => parseInt((j.jobNumber || "").replace(/\D/g, "") || "0", 10))) + 1 : 1;
    const data = { ...form, clientId: form.clientId, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean), estimate: form.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 }, ...(!form.jobNumber && !editJob ? { jobNumber: "J-" + String(nextNum).padStart(4, "0") } : {}) };
    try {
      if (editJob) {
        const changes = [];
        if (editJob.title !== data.title) changes.push(`Title changed to "${data.title}"`);
        if (editJob.status !== data.status) changes.push(`Status → ${data.status.replace("_"," ")}`);
        if (editJob.priority !== data.priority) changes.push(`Priority → ${data.priority}`);
        if (String(editJob.clientId) !== String(data.clientId)) changes.push(`Client changed`);
        if ((editJob.siteId||null) !== (data.siteId||null)) changes.push(`Site changed`);
        const msg = changes.length ? changes.join(" · ") : "Job updated";
        const saved = await updateJob(editJob.id, data);
        setJobs(js => js.map(j => j.id === editJob.id ? { ...saved, activityLog: addLog(j.activityLog, msg) } : j));
      } else {
        const saved = await createJob(data);
        setJobs(js => [...js, { ...saved, activityLog: [mkLog("Job created")] }]);
      }
    } catch (err) {
      console.error('Failed to save job:', err);
    }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteJob(id);
      setJobs(js => js.filter(j => j.id !== id));
      if (detailJob?.id === id) setDetailJob(null);
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  };

  const STATUSES = ["all","draft","scheduled","quoted","in_progress","completed","cancelled"];
  const kanbanCols = ["draft","scheduled","quoted","in_progress","completed"];

  // Relationship counts per job
  const jobStats = (jobId) => ({
    quotes: quotes.filter(q => q.jobId === jobId).length,
    invoices: invoices.filter(i => i.jobId === jobId).length,
    hours: timeEntries.filter(t => t.jobId === jobId).reduce((s,t) => s + t.hours, 0),
  });

  const jobStatusColors = { draft: "#888", scheduled: "#0891b2", quoted: "#7c3aed", in_progress: "#d97706", completed: "#16a34a", cancelled: "#dc2626" };
  const jobStatusLabels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed" };

  return (
    <div>
      {/* ── Summary strip */}
      {(() => {
        const today = new Date().toISOString().slice(0, 10);
        const nextWeekStart = (() => { const d = new Date(); d.setDate(d.getDate() + (7 - ((d.getDay() + 6) % 7))); return d.toISOString().slice(0, 10); })();
        const nextWeekEnd = (() => { const d = new Date(nextWeekStart); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();
        const overdueCount = jobs.filter(j => j.dueDate && daysUntil(j.dueDate) < 0 && j.status !== "completed" && j.status !== "cancelled").length;
        const dueNextWeek = jobs.filter(j => j.dueDate && j.dueDate >= nextWeekStart && j.dueDate <= nextWeekEnd && j.status !== "completed" && j.status !== "cancelled").length;

        const scheduledCount = jobs.filter(j => j.status === "scheduled").length;
        // Weekdays this week missing time entries
        const monDate = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
        const weekdayDates = Array.from({ length: 5 }, (_, i) => { const d = new Date(monDate); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); }).filter(d => d <= today);
        const datesWithTime = new Set(timeEntries.map(t => t.date));
        const missingTimeDays = weekdayDates.filter(d => !datesWithTime.has(d)).length;

        const quotedCount = jobs.filter(j => j.status === "quoted").length;
        const quotedOverdue = jobs.filter(j => j.status === "quoted" && j.dueDate && daysUntil(j.dueDate) < 0).length;

        const inProgressCount = jobs.filter(j => j.status === "in_progress").length;

        const tiles = [
          { key: "overdue", label: "Overdue", color: "#dc2626", count: overdueCount, sub: dueNextWeek > 0 ? `${dueNextWeek} due next week` : "None due next week" },
          { key: "scheduled", label: "Scheduled", color: jobStatusColors.scheduled, count: scheduledCount, sub: missingTimeDays > 0 ? `${missingTimeDays} day${missingTimeDays !== 1 ? "s" : ""} missing time` : "All days logged ✓" },
          { key: "quoted", label: "Quoted", color: jobStatusColors.quoted, count: quotedCount, sub: quotedOverdue > 0 ? `${quotedOverdue} overdue` : "None overdue" },
          { key: "in_progress", label: "In Progress", color: jobStatusColors.in_progress, count: inProgressCount, sub: `${inProgressCount === 1 ? "job" : "jobs"} active` },
        ];

        return (
          <div className={s.summaryGrid}>
            {tiles.map(tile => (
              <div key={tile.key} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${tile.color}`, cursor: "pointer" }}
                onClick={() => { if (tile.key === "overdue") { setFilterStatus(""); setView("list"); } else { setFilterStatus(tile.key); setView("list"); } }}>
                <div className="stat-label">{tile.label}</div>
                <div className="stat-value" style={{ fontSize: 22, color: tile.color }}>{tile.count}</div>
                <div className="stat-sub">{tile.sub}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, clients..." />
        </div>
        <select className={`form-control ${s.filterSelect}`} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.jobs.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.jobs.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: SECTION_COLORS.jobs.accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns">
          {(auth.isAdmin || auth.isLocalDev) && <button className="btn btn-primary" style={{ background: SECTION_COLORS.jobs.accent }} onClick={openNew}><Icon name="plus" size={14} />New Job</button>}
        </div>
      </div>

      {view === "grid" ? (
        <div className="order-cards-grid">
          {filtered.length === 0 && <div className={`empty-state ${s.emptyStateFull}`}><div className="empty-state-icon">🔧</div><div className="empty-state-text">No jobs found</div></div>}
          {filtered.map(job => {
            const client = clients.find(c => c.id === job.clientId);
            const site = client?.sites?.find(si => si.id === job.siteId);
            const stats = jobStats(job.id);
            const priorityColors = { high: "#111", medium: "#777", low: "#ccc" };
            return (
              <div key={job.id} className="order-card" onClick={() => openDetail(job)}>
                <div className={s.cardHeader}>
                  <div className={s.cardHeaderLeft}>
                    <div className={s.cardIcon} style={{ background: SECTION_COLORS.jobs.light, color: SECTION_COLORS.jobs.accent }}>
                      <Icon name="jobs" size={15} />
                    </div>
                    <div>
                      <div className={s.cardTitle}>{job.jobNumber || `J-${String(job.id).padStart(4,"0")}`} · {job.title}</div>
                      <div className={s.cardSubtitle}>{job.startDate ? fmtDate(job.startDate) : "No start date"}</div>
                    </div>
                  </div>
                  <div className={s.statusWrap}>
                    <StatusBadge status={job.status} />
                  </div>
                </div>
                <div className={s.cardClient}>
                  {client?.name || <span className={s.noClientText}>No client</span>}
                </div>
                {site && <div className={s.siteRow}>📍 {site.name}</div>}
                <div className={s.tagsRow}>
                  <span className={s.priorityBadge} style={{ color: priorityColors[job.priority] }}>
                    <span className={`priority-dot priority-${job.priority}`} /> {job.priority}
                  </span>
                  {stats.quotes > 0 && <span className={s.statChip}>{stats.quotes} quote{stats.quotes !== 1 ? "s" : ""}</span>}
                  {stats.invoices > 0 && <span className={s.statChip}>{stats.invoices} inv</span>}
                  {stats.hours > 0 && <span className={s.statChip}>{stats.hours}h</span>}
                </div>
                {(job.assignedTo || []).length > 0 && <div className={s.avatarWrap}><AvatarGroup names={job.assignedTo} max={4} /></div>}
                <SectionProgressBar status={job.status} section="jobs" />
                <div className={s.cardFooter}>
                  <span className={s.dueDate} style={{ color: job.dueDate ? "#334155" : "#ccc" }}>{job.dueDate ? `Due ${fmtDate(job.dueDate)}` : "No due date"}</span>
                  <div className={s.actionRow} onClick={e => e.stopPropagation()}>
                    {canEditJob(job) && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(job)}><Icon name="edit" size={12} /></button>}
                    {canDeleteJob && <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(job.id)}><Icon name="trash" size={12} /></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "list" ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Job</th><th>Client</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Assigned</th><th>Links</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">🔧</div><div className="empty-state-text">No jobs found</div></div></td></tr>}
                {filtered.map(job => {
                  const client = clients.find(c => c.id === job.clientId);
                  const stats = jobStats(job.id);
                  return (
                    <tr key={job.id} className={s.rowPointer} onClick={() => openDetail(job)}>
                      <td>
                        <div className={s.listTitle}>{job.jobNumber || `J-${String(job.id).padStart(4,"0")}`} · {job.title}</div>
                        <div className={s.listDesc}>{job.description?.slice(0, 55)}{job.description?.length > 55 ? "…" : ""}</div>
                      </td>
                      <td>
                        <div className={s.listClient}>{client?.name}</div>
                        {(() => { const si = client?.sites?.find(x => x.id === job.siteId); return si ? <div className={s.listSite}>📍 {si.name}</div> : null; })()}
                      </td>
                      <td><StatusBadge status={job.status} /></td>
                      <td>
                        <div className={s.priorityCell}>
                          <span className={`priority-dot priority-${job.priority}`} />
                          <span className={s.priorityText}>{job.priority}</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize: 12, color: job.dueDate ? "#111" : "#ccc" }}>{fmtDate(job.dueDate)}</span></td>
                      <td onClick={e => e.stopPropagation()}><AvatarGroup names={job.assignedTo} max={3} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className={s.linksRow}>
                          {stats.quotes > 0 && <span className="chip"><Icon name="quotes" size={10} />{stats.quotes}</span>}
                          {stats.invoices > 0 && <span className="chip"><Icon name="invoices" size={10} />{stats.invoices}</span>}
                          {stats.hours > 0 && <span className="chip"><Icon name="time" size={10} />{stats.hours}h</span>}
                        </div>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className={s.actionRow}>
                          {canEditJob(job) && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(job)}><Icon name="edit" size={12} /></button>}
                          {canDeleteJob && <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(job.id)}><Icon name="trash" size={12} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="kanban">
          {kanbanCols.map(col => {
            const colJobs = filtered.filter(j => j.status === col);
            const labels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed" };
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span className={s.kanbanCount}>{colJobs.length}</span>
                </div>
                {colJobs.map(job => {
                  const client = clients.find(c => c.id === job.clientId);
                  const stats = jobStats(job.id);
                  return (
                    <div key={job.id} className="kanban-card" onClick={() => openDetail(job)}>
                      <div className={s.kanbanTitleRow}>
                        <span className={`priority-dot priority-${job.priority}`} />
                        <span className={s.kanbanTitle}>{job.jobNumber || `J-${String(job.id).padStart(4,"0")}`} · {job.title}</span>
                      </div>
                      <div className={s.kanbanClient}>{client?.name}</div>
                      {job.dueDate && <div className={s.kanbanDue}>Due: {fmtDate(job.dueDate)}</div>}
                      <div className={s.kanbanChips}>
                        {stats.quotes > 0 && <span className={`chip ${s.kanbanChipSmall}`}><Icon name="quotes" size={9} />{stats.quotes} quote{stats.quotes>1?"s":""}</span>}
                        {stats.invoices > 0 && <span className={`chip ${s.kanbanChipSmall}`}><Icon name="invoices" size={9} />{stats.invoices} inv</span>}
                        {stats.hours > 0 && <span className={`chip ${s.kanbanChipSmall}`}><Icon name="time" size={9} />{stats.hours}h</span>}
                      </div>
                      <div className={s.kanbanFooter}>
                        <div>{job.tags.slice(0,2).map((t, i) => <span key={i} className={`tag ${s.kanbanTag}`}>{t}</span>)}</div>
                        <AvatarGroup names={job.assignedTo} max={2} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Job detail drawer */}
      {detailJob && (
        <JobDetail
          job={jobs.find(j => j.id === detailJob.id) || detailJob}
          onClose={() => setDetailJob(null)}
          onEdit={() => { openEdit(jobs.find(j => j.id === detailJob.id) || detailJob); setDetailJob(null); }}
        />
      )}

      {/* Edit / New Job drawer */}
      {showModal && (() => {
        const isNewJob = !editJob;
        const jobClient = clients.find(c => String(c.id) === String(form.clientId));
        const jobSite = jobClient?.sites?.find(si => String(si.id) === String(form.siteId));
        return (
        <SectionDrawer
          accent={SECTION_COLORS.jobs.accent}
          icon={<Icon name="jobs" size={16} />}
          typeLabel="Job"
          title={editJob ? editJob.title : "New Job"}
          statusBadge={editJob ? <StatusBadge status={form.status} /> : null}
          mode={jobMode} setMode={setJobMode}
          showToggle={!isNewJob}
          isNew={isNewJob}
          footer={jobMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <button className={`btn btn-sm ${s.drawerBtn}`} style={{ background: SECTION_COLORS.jobs.accent }} onClick={() => setJobMode("edit")}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editJob ? setJobMode("view") : setShowModal(false)}>{editJob ? "Cancel" : "Cancel"}</button>
            <button className={`btn btn-sm ${s.drawerBtn}`} style={{ background: SECTION_COLORS.jobs.accent }} onClick={() => { save(); if (editJob) setJobMode("view"); }} disabled={!form.title || (isNewJob && ((form.estimate?.labour || 0) + (form.estimate?.materials || 0) + (form.estimate?.subcontractors || 0) + (form.estimate?.other || 0)) === 0)}>
              <Icon name="check" size={13} /> {isNewJob ? "Create Job" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {jobMode === "view" ? (
            <div className={s.drawerBody}>
              <ViewField label="Job Title" value={form.title} />
              <div className="grid-2">
                <ViewField label="Client" value={jobClient?.name} />
                <ViewField label="Site" value={jobSite?.name || "No specific site"} />
              </div>
              <div className="grid-2">
                <ViewField label="Status" value={form.status?.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())} />
                <ViewField label="Priority" value={form.priority?.charAt(0).toUpperCase() + form.priority?.slice(1)} />
              </div>
              <ViewField label="Tags" value={form.tags || "—"} />
              <div className="grid-2">
                <ViewField label="Start Date" value={fmtDate(form.startDate)} />
                <ViewField label="Due Date" value={fmtDate(form.dueDate)} />
              </div>
              {(form.assignedTo || []).length > 0 && (
                <div className={s.assignedSection}>
                  <div className={s.sectionLabel}>Assigned Team</div>
                  <div className={s.chipRow}>
                    {form.assignedTo.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {form.description && <ViewField label="Description" value={form.description} />}
              {(() => {
                const est = form.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 };
                const totalEst = (est.labour || 0) + (est.materials || 0) + (est.subcontractors || 0) + (est.other || 0);
                const acceptedTotal = quotes.filter(q => q.jobId === (editJob?.id) && q.status === "accepted").reduce((s, q) => s + calcQuoteTotal(q), 0);
                return (
                  <div className={s.estimateSection}>
                    <div className={s.estimateSectionLabel}>Estimate</div>
                    <div className={s.estimateCard}>
                      <div className={s.estimateGrid}>
                        <div><div className={s.estimateItemLabel}>Labour</div><div className={s.estimateItemValue}>{fmt(est.labour || 0)}</div></div>
                        <div><div className={s.estimateItemLabel}>Materials</div><div className={s.estimateItemValue}>{fmt(est.materials || 0)}</div></div>
                        <div><div className={s.estimateItemLabel}>Subcontractors</div><div className={s.estimateItemValue}>{fmt(est.subcontractors || 0)}</div></div>
                        <div><div className={s.estimateItemLabel}>Other</div><div className={s.estimateItemValue}>{fmt(est.other || 0)}</div></div>
                      </div>
                      <div className={s.estimateFooter}>
                        <div className={s.estimateTotalRight}>Total Estimate: {fmt(totalEst)}</div>
                        {acceptedTotal > 0 && <div className={s.acceptedQuotes}>Accepted Quotes: {fmt(acceptedTotal)}</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
          <div className={s.drawerBody}>
            <div className="form-group">
              <label className="form-label">Job Title *</label>
              <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Fitout – Level 3" />
            </div>
            <div className={s.grid2Fixed}>
              <div className="form-group">
                <label className="form-label">Client *</label>
                <select className="form-control" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value, siteId: "" }))}>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Site</label>
                <select className="form-control" value={form.siteId || ""} onChange={e => setForm(f => ({ ...f, siteId: e.target.value || null }))}>
                  <option value="">— No specific site —</option>
                  {(clients.find(c => String(c.id) === String(form.clientId))?.sites || []).map(si => (
                    <option key={si.id} value={si.id}>{si.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={s.grid2Fixed}>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {["draft","scheduled","quoted","in_progress","completed","cancelled"].map(st => <option key={st} value={st}>{st.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-control" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {["high","medium","low"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tags (comma separated)</label>
              <input className="form-control" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="fitout, commercial, urgent" />
            </div>
            <div className={s.grid2Fixed}>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input type="date" className="form-control" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input type="date" className="form-control" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned Team Members</label>
              <div className="multi-select">
                {(staff && staff.length > 0 ? staff.map(st => st.name) : TEAM).map(t => (
                  <span key={t} className={`multi-option ${form.assignedTo.includes(t) ? "selected" : ""}`}
                    onClick={() => setForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-control" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Job details, scope of work..." />
            </div>
            <div className={s.estimateEditSection}>
              <div className={s.estimateSectionLabel}>Estimate *</div>
              <div className={s.estimateEditCard}>
                <div className={`grid-2 ${s.estimateEditGrid}`}>
                  <div className={`form-group ${s.formGroupNoMargin}`}>
                    <label className={`form-label ${s.formLabelSmall}`}>Labour ($)</label>
                    <input type="number" className="form-control" min="0" step="100" value={form.estimate?.labour || ""} onChange={e => setForm(f => ({ ...f, estimate: { ...f.estimate, labour: Number(e.target.value) || 0 } }))} placeholder="0" />
                  </div>
                  <div className={`form-group ${s.formGroupNoMargin}`}>
                    <label className={`form-label ${s.formLabelSmall}`}>Materials ($)</label>
                    <input type="number" className="form-control" min="0" step="100" value={form.estimate?.materials || ""} onChange={e => setForm(f => ({ ...f, estimate: { ...f.estimate, materials: Number(e.target.value) || 0 } }))} placeholder="0" />
                  </div>
                </div>
                <div className="grid-2">
                  <div className={`form-group ${s.formGroupNoMargin}`}>
                    <label className={`form-label ${s.formLabelSmall}`}>Subcontractors ($)</label>
                    <input type="number" className="form-control" min="0" step="100" value={form.estimate?.subcontractors || ""} onChange={e => setForm(f => ({ ...f, estimate: { ...f.estimate, subcontractors: Number(e.target.value) || 0 } }))} placeholder="0" />
                  </div>
                  <div className={`form-group ${s.formGroupNoMargin}`}>
                    <label className={`form-label ${s.formLabelSmall}`}>Other ($)</label>
                    <input type="number" className="form-control" min="0" step="100" value={form.estimate?.other || ""} onChange={e => setForm(f => ({ ...f, estimate: { ...f.estimate, other: Number(e.target.value) || 0 } }))} placeholder="0" />
                  </div>
                </div>
                {(() => {
                  const t = (form.estimate?.labour || 0) + (form.estimate?.materials || 0) + (form.estimate?.subcontractors || 0) + (form.estimate?.other || 0);
                  return <div className={s.estimateEditTotalRight}>Total: {fmt(t)}</div>;
                })()}
              </div>
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}
    </div>
  );
};

export default memo(Jobs);
