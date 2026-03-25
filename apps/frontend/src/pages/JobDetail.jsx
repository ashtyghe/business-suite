import { useState } from "react";
import { useAppStore } from "../lib/store";
import { useAuth } from "../lib/AuthContext";
import {
  createQuote, updateQuote, deleteQuote,
  createInvoice, updateInvoice, deleteInvoice,
  createTimeEntry, deleteTimeEntry,
  createBill, updateBill, deleteBill,
  updateJob,
  createScheduleEntry, updateScheduleEntry, deleteScheduleEntry,
  uploadFile, createAttachment, deleteAttachment,
  createPhase, updatePhase, deletePhase,
  createTask, updateTask, deleteTask,
  createNote, updateNote, deleteNote,
  createWorkOrder, updateWorkOrder, deleteWorkOrder,
  createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  createAuditEntry,
} from "../lib/db";
import { supabase, xeroSyncInvoice, xeroSyncBill, sendEmail } from "../lib/supabase";
import { buildQuotePdfHtml, buildInvoicePdfHtml, htmlToPdfBase64 } from "../lib/pdf";
import { Icon } from "../components/Icon";
import {
  StatusBadge, XeroSyncBadge, AvatarGroup,
  OrderIcon, OrderStatusBadge, DueDateChip, OrderProgressBar,
  SectionProgressBar, BillStatusBadge, BILL_CATEGORIES,
  SectionLabel, SectionDrawer, LineItemsEditor, ActivityLog,
} from "../components/shared";
import { BillModal } from "../components/BillModal";
import { OrderCard } from "../components/OrderCard";
import { OrderDrawer } from "../components/OrderDrawer";
import {
  TEAM, SECTION_COLORS, STATUS_BG, ViewField,
  ORDER_CONTRACTORS, ORDER_SUPPLIERS, ORDER_UNITS,
  ORDER_STATUSES, ORDER_TRANSITIONS, ORDER_TERMINAL,
} from "../fixtures/seedData.jsx";
import {
  fmt, calcQuoteTotal, uid, addLog,
  genId, makeLogEntry, orderAddDays, orderToday, orderFmtDate,
  orderFmtTs, orderAddLog, applyTransition, orderJobDisplay,
  daysUntil, fmtDate, calcHoursFromTimes, addMinsToTime, hexToRgba,
  COMPLIANCE_DOC_TYPES, COMPLIANCE_STATUS_COLORS,
  getComplianceStatus, getDaysUntilExpiry, getContractorComplianceCount,
  ORDER_STATUS_TRIGGERS,
} from "../utils/helpers";

import JobPnL from './JobDetail/JobPnL';
import JobGantt from './JobDetail/JobGantt';
import JobTasks from './JobDetail/JobTasks';
import JobNotes from './JobDetail/JobNotes';
import s from './JobDetail.module.css';

// ── Job Detail Drawer ─────────────────────────────────────────────────────────
const JobDetail = ({ job, onClose, onEdit }) => {
  const { clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, jobs, setJobs, staff, workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders, companyInfo } = useAppStore();
  const [tab, setTab] = useState("overview");
  const [detailMode, setDetailMode] = useState("view");
  const [orderModal, setOrderModal] = useState(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [detailForm, setDetailForm] = useState({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } });
  const client = clients.find(c => c.id === job.clientId);

  const jobQuotes    = quotes.filter(q => q.jobId === job.id);
  const jobInvoices  = invoices.filter(i => i.jobId === job.id);
  const jobTime      = timeEntries.filter(t => t.jobId === job.id);
  const jobBills     = bills.filter(b => b.jobId === job.id);
  const jobSchedule  = schedule.filter(s => s.jobId === job.id).sort((a,b) => a.date > b.date ? 1 : -1);
  const jobWOs = (workOrders || []).filter(o => String(o.jobId) === String(job.id));
  const jobPOs = (purchaseOrders || []).filter(o => String(o.jobId) === String(job.id));

  const totalQuoted   = jobQuotes.filter(q => q.status === "accepted").reduce((s,q) => s + calcQuoteTotal(q), 0);
  const totalInvoiced = jobInvoices.reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalPaid     = jobInvoices.filter(i => i.status === "paid").reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalHours    = jobTime.reduce((s,t) => s + t.hours, 0);
  const totalCosts    = jobBills.filter(b => b.status === "approved").reduce((s,b) => s + b.amount, 0);
  const actualLabour  = jobTime.reduce((s,t) => { const st = (staff||[]).find(x => x.name === t.worker); return s + t.hours * (st?.costRate || 55); }, 0);
  const actualMaterials = jobBills.filter(b => b.category === "Materials").reduce((s,b) => s + b.amount, 0);
  const actualSubs    = jobBills.filter(b => b.category === "Subcontractor").reduce((s,b) => s + b.amount, 0);

  // Quick-add quote from within job
  const addQuoteForJob = async () => {
    try {
      const newQ = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" };
      const saved = await createQuote(newQ);
      setQuotes(qs => [...qs, saved]);
    } catch (err) {
      console.error('Failed to create quote:', err);
    }
  };

  // Convert accepted quote → invoice
  const quoteToInvoice = async (q) => {
    try {
      const newInv = { jobId: job.id, status: "draft", lineItems: [...q.lineItems], tax: q.tax, dueDate: "", notes: q.notes, fromQuoteId: q.id };
      const saved = await createInvoice(newInv);
      setInvoices(is => [...is, saved]);
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${saved.number} created from ${q.number}`) } : j));
    } catch (err) {
      console.error('Failed to create invoice from quote:', err);
    }
  };

  // Quick-add time
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeForm, setTimeForm] = useState({ worker: TEAM[0], date: new Date().toISOString().slice(0,10), startTime: "", endTime: "", hours: 1, description: "", billable: true });
  const quickHours = calcHoursFromTimes(timeForm.startTime, timeForm.endTime) || timeForm.hours;
  const saveTime = async () => {
    const hours = calcHoursFromTimes(timeForm.startTime, timeForm.endTime) || Number(timeForm.hours);
    try {
      const staffMember = staff ? staff.find(s => s.name === timeForm.worker) : null;
      const staffId = staffMember?.id;
      const saved = await createTimeEntry({ ...timeForm, jobId: job.id, hours }, staffId);
      setTimeEntries(ts => [...ts, saved]);
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `${timeForm.worker} logged ${hours}h`) } : j));
    } catch (err) {
      console.error('Failed to save time entry:', err);
    }
    setShowTimeForm(false);
    setTimeForm({ worker: (staff && staff[0]?.name) || TEAM[0], date: new Date().toISOString().slice(0,10), startTime: "", endTime: "", hours: 1, description: "", billable: true });
  };

  // Quick-add schedule entry
  const [showSchedForm, setShowSchedForm] = useState(false);
  const [schedForm, setSchedForm] = useState({ date: new Date().toISOString().slice(0, 10), assignedTo: [], notes: "" });
  const saveScheduleEntry = async () => {
    try {
      const saved = await createScheduleEntry({ jobId: job.id, date: schedForm.date, assignedTo: schedForm.assignedTo, notes: schedForm.notes });
      setSchedule(prev => [...prev, saved]);
    } catch (err) { console.error("Failed to create schedule entry:", err); }
    setShowSchedForm(false);
    setSchedForm({ date: new Date().toISOString().slice(0, 10), assignedTo: [], notes: "" });
  };

  const delTime = async (id) => {
    try {
      await deleteTimeEntry(id);
      setTimeEntries(ts => ts.filter(t => t.id !== id));
    } catch (err) { console.error('Failed to delete time entry:', err); }
  };
  const delQuote = async (id) => {
    try {
      await deleteQuote(id);
      setQuotes(qs => qs.filter(q => q.id !== id));
    } catch (err) { console.error('Failed to delete quote:', err); }
  };
  const delInvoice = async (id) => {
    try {
      await deleteInvoice(id);
      setInvoices(is => is.filter(i => i.id !== id));
    } catch (err) { console.error('Failed to delete invoice:', err); }
  };
  const delBill = async (id) => {
    try {
      await deleteBill(id);
      setBills(bs => bs.filter(b => b.id !== id));
    } catch (err) { console.error('Failed to delete bill:', err); }
  };
  const markInvPaid = async (id) => {
    const inv = invoices.find(i => i.id === id);
    try {
      const saved = await updateInvoice(id, { ...inv, status: "paid" });
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${inv?.number} marked paid`) } : j));
    } catch (err) { console.error('Failed to mark invoice paid:', err); }
  };
  const acceptQuote = async (id) => {
    const q = quotes.find(x => x.id === id);
    try {
      const saved = await updateQuote(id, { ...q, status: "accepted" });
      setQuotes(qs => {
        const updated = qs.map(x => x.id === saved.id ? saved : x);
        // Update job estimate with cumulative accepted quote total
        const acceptedTotal = updated.filter(x => x.jobId === job.id && x.status === "accepted").reduce((s, x) => s + calcQuoteTotal(x), 0);
        setJobs(js => js.map(j => j.id === job.id ? {
          ...j,
          estimate: { ...(j.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 }), total: acceptedTotal },
          activityLog: addLog(j.activityLog, `Quote ${q?.number} accepted · Estimate updated to ${fmt(acceptedTotal)}`)
        } : j));
        return updated;
      });
    } catch (err) { console.error('Failed to accept quote:', err); }
  };

  // ── Edit state for inline modals ──
  const [editingQuote,   setEditingQuote]   = useState(null);
  const [inlineQuoteMode, setInlineQuoteMode] = useState("edit");
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [inlineInvMode, setInlineInvMode] = useState("edit");
  const [editingBill,    setEditingBill]    = useState(null);

  const saveQuote = async (data) => {
    try {
      const saved = await updateQuote(data.id, data);
      setQuotes(qs => qs.map(q => q.id === saved.id ? saved : q));
      setEditingQuote(saved);
      setInlineQuoteMode("view");
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Quote ${data.number} updated`) } : j));
    } catch (err) { console.error('Failed to save quote:', err); }
  };
  const saveInvoice = async (data) => {
    try {
      const saved = await updateInvoice(data.id, data);
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      setEditingInvoice(saved);
      setInlineInvMode("view");
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${data.number} updated`) } : j));
    } catch (err) { console.error('Failed to save invoice:', err); }
  };
  const saveBillFromJob = async (data) => {
    try {
      if (editingBill?.id) {
        const saved = await updateBill(editingBill.id, data);
        setBills(bs => bs.map(b => b.id === editingBill.id ? saved : b));
        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill from ${data.supplier} updated`) } : j));
      } else {
        const billData = { ...data, jobId: job.id, status: "linked" };
        const saved = await createBill(billData);
        setBills(bs => [...bs, saved]);
        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill captured: ${data.supplier} ${fmt(data.amount)}`) } : j));
      }
    } catch (err) { console.error('Failed to save bill:', err); }
    setEditingBill(null);
  };

  const saveDetailForm = async () => {
    const data = { ...detailForm, tags: detailForm.tags.split(",").map(t => t.trim()).filter(Boolean), estimate: detailForm.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } };
    try {
      const changes = [];
      if (job.title !== data.title) changes.push(`Title changed to "${data.title}"`);
      if (job.status !== data.status) changes.push(`Status → ${data.status.replace("_"," ")}`);
      if (job.priority !== data.priority) changes.push(`Priority → ${data.priority}`);
      const msg = changes.length ? changes.join(" · ") : "Job updated";
      const saved = await updateJob(job.id, data);
      setJobs(js => js.map(j => j.id === job.id ? { ...saved, activityLog: addLog(j.activityLog, msg) } : j));
      setDetailMode("view");
    } catch (err) { console.error('Failed to save job:', err); }
  };

  const jobNotes = job.notes || [];
  const jobPhases = job.phases || [];
  const jobTasks = job.tasks || [];
  const tasksDone = jobTasks.filter(t => t.done).length;
  const tasksRemaining = jobTasks.length - tasksDone;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "pnl", label: "P&L" },
    { id: "quotes", label: `Quotes (${jobQuotes.length})` },
    { id: "gantt", label: `Gantt (${jobPhases.length})` },
    { id: "tasks", label: `Tasks${tasksRemaining > 0 ? ` (${tasksRemaining})` : jobTasks.length > 0 ? " ✓" : ""}` },
    { id: "schedule", label: `Schedule (${jobSchedule.length})` },
    { id: "orders", label: `Orders (${jobWOs.length + jobPOs.length})` },
    { id: "time", label: `Time (${totalHours}h)` },
    { id: "costs", label: `Costs (${jobBills.length})` },
    { id: "invoices", label: `Invoices (${jobInvoices.length})` },
    { id: "notes", label: `Notes (${jobNotes.length})` },
    { id: "activity", label: `Activity (${(job.activityLog||[]).length})` },
  ];

  const jobAccent = SECTION_COLORS.jobs.accent;
  const jobLight = SECTION_COLORS.jobs.light;

  const jobStatuses = ["draft","scheduled","in_progress","completed","cancelled"];
  const jobStatusStrip = detailMode === "view" ? (
    <div className={s.flexShrink0}>
      <div className={s.statusStrip} style={{ background: jobLight }}>
        {jobStatuses.map(st => {
          const isActive = st === job.status;
          return (
            <button key={st} className={`btn btn-xs ${s.statusBtn} ${isActive ? s.statusBtnActive : s.statusBtnInactive}`}
              style={isActive ? { background: STATUS_BG[st], color: (st === "draft" || st === "cancelled") ? "#475569" : "#fff", borderColor: STATUS_BG[st] } : undefined}
              onClick={() => {
                if (isActive) return;
                const updated = { ...job, status: st, activityLog: addLog(job.activityLog, `Status → ${st.replace("_"," ")}`) };
                setJobs(js => js.map(j => j.id === job.id ? updated : j));
              }}>{st.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</button>
          );
        })}
      </div>
      {/* Tabs */}
      <div className={`tabs ${s.tabBar}`}>
        {tabs.map(t => <div key={t.id} className={`tab ${tab === t.id ? "active" : ""} ${s.tabItemNoWrap}`} onClick={() => setTab(t.id)} style={{ borderBottomColor: tab === t.id ? jobAccent : "transparent" }}>{t.label}</div>)}
      </div>
    </div>
  ) : null;

  const jobFooter = detailMode === "view" ? <>
    <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
    <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: jobAccent }} onClick={() => { setDetailForm({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setDetailMode("edit"); }}>
      <Icon name="edit" size={13} /> Edit
    </button>
  </> : <>
    <button className="btn btn-ghost btn-sm" onClick={() => setDetailMode("view")}>Cancel</button>
    <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: jobAccent }} onClick={saveDetailForm} disabled={!detailForm.title}>
      <Icon name="check" size={13} /> Save Changes
    </button>
  </>;

  const newMenuItems = [
    { label: "Quote", icon: "quotes", action: async () => { setShowNewMenu(false); try { const saved = await createQuote({ jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" }); setQuotes(qs => [...qs, saved]); setEditingQuote(saved); setInlineQuoteMode("edit"); setTab("quotes"); } catch (err) { console.error(err); } } },
    { label: "Task", icon: "check", action: () => { setTab("tasks"); setShowNewMenu(false); } },
    { label: "Schedule", icon: "schedule", action: () => { setTab("schedule"); setShowSchedForm(true); setShowNewMenu(false); } },
    { label: "Work Order", icon: "orders", action: () => { setOrderModal({ type: "wo", order: null }); setTab("orders"); setShowNewMenu(false); } },
    { label: "Purchase Order", icon: "orders", action: () => { setOrderModal({ type: "po", order: null }); setTab("orders"); setShowNewMenu(false); } },
    { label: "Log Time", icon: "time", action: () => { setTab("time"); setShowTimeForm(true); setShowNewMenu(false); } },
    { label: "Bill", icon: "bills", action: () => { setTab("costs"); setEditingBill({}); setShowNewMenu(false); } },
    { label: "Invoice", icon: "invoices", action: async () => { setShowNewMenu(false); try { const saved = await createInvoice({ jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" }); setInvoices(is => [...is, saved]); setEditingInvoice(saved); setInlineInvMode("edit"); setTab("invoices"); } catch (err) { console.error(err); } } },
    { label: "Note", icon: "notes", action: () => { setTab("notes"); setShowNewMenu(false); } },
  ];

  const newDropdown = detailMode === "view" ? (
    <div className={s.newMenuWrap}>
      <button className={s.newMenuBtn} onClick={() => setShowNewMenu(v => !v)}>
        <Icon name="plus" size={13} /> New
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {showNewMenu && (
        <>
          <div className={s.newMenuBackdrop} onClick={() => setShowNewMenu(false)} />
          <div className={s.newMenuDropdown}>
            {newMenuItems.map(item => (
              <button key={item.label} className={s.newMenuItem} onClick={item.action}>
                <Icon name={item.icon} size={14} />{item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <>
    <SectionDrawer
      accent={jobAccent}
      icon={<Icon name="jobs" size={16} />}
      typeLabel="Job"
      title={`${job.jobNumber || `J-${String(job.id).padStart(4,"0")}`} · ${job.title}`}
      statusBadge={<StatusBadge status={job.status} />}
      mode={detailMode} setMode={setDetailMode}
      showToggle={true}
      statusStrip={jobStatusStrip}
      footer={jobFooter}
      onClose={onClose}
      headerRight={newDropdown}
    >
        {detailMode === "edit" ? (
        <div className={s.sectionPad}>
          <div>
            <SectionLabel>Job Details</SectionLabel>
            <div className="form-group">
              <label className="form-label">Job Title *</label>
              <input className="form-control" value={detailForm.title} onChange={e => setDetailForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Fitout – Level 3" />
            </div>
            <div className={s.grid2Fixed}>
              <div className="form-group">
                <label className="form-label">Client *</label>
                <select className="form-control" value={detailForm.clientId} onChange={e => setDetailForm(f => ({ ...f, clientId: e.target.value, siteId: "" }))}>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Site</label>
                <select className="form-control" value={detailForm.siteId || ""} onChange={e => setDetailForm(f => ({ ...f, siteId: e.target.value || null }))}>
                  <option value="">— No specific site —</option>
                  {(clients.find(c => String(c.id) === String(detailForm.clientId))?.sites || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={s.grid2Fixed}>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-control" value={detailForm.priority} onChange={e => setDetailForm(f => ({ ...f, priority: e.target.value }))}>
                  {["high","medium","low"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={detailForm.status} onChange={e => setDetailForm(f => ({ ...f, status: e.target.value }))}>
                  {["draft","scheduled","quoted","in_progress","completed","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
            </div>
            <div className={s.grid2Fixed}>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input type="date" className="form-control" value={detailForm.startDate} onChange={e => setDetailForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input type="date" className="form-control" value={detailForm.dueDate} onChange={e => setDetailForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-control" value={detailForm.description} onChange={e => setDetailForm(f => ({ ...f, description: e.target.value }))} placeholder="Job details, scope of work..." />
            </div>
          </div>
          <div>
            <SectionLabel>Team</SectionLabel>
            <div className="form-group">
              <div className="multi-select">
                {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                  <span key={t} className={`multi-option ${detailForm.assignedTo.includes(t) ? "selected" : ""}`}
                    onClick={() => setDetailForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div>
            <SectionLabel>Tags</SectionLabel>
            <div className="form-group">
              <input className="form-control" value={detailForm.tags} onChange={e => setDetailForm(f => ({ ...f, tags: e.target.value }))} placeholder="fitout, commercial, urgent" />
            </div>
          </div>
          <div className={s.estimateWrap}>
            <SectionLabel>Estimate</SectionLabel>
            <div className={s.estimateBox}>
              <div className={`grid-2 ${s.gridGap8}`}>
                <div className={`form-group ${s.formGroupNoMb}`}>
                  <label className={`form-label ${s.formLabelSm}`}>Labour ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.labour || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, labour: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className={`form-group ${s.formGroupNoMb}`}>
                  <label className={`form-label ${s.formLabelSm}`}>Materials ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.materials || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, materials: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              <div className="grid-2">
                <div className={`form-group ${s.formGroupNoMb}`}>
                  <label className={`form-label ${s.formLabelSm}`}>Subcontractors ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.subcontractors || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, subcontractors: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className={`form-group ${s.formGroupNoMb}`}>
                  <label className={`form-label ${s.formLabelSm}`}>Other ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.other || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, other: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              {(() => {
                const t = (detailForm.estimate?.labour || 0) + (detailForm.estimate?.materials || 0) + (detailForm.estimate?.subcontractors || 0) + (detailForm.estimate?.other || 0);
                return <div className={s.estimateTotalRight}>Total: {fmt(t)}</div>;
              })()}
            </div>
          </div>
        </div>
        ) : (
        <div className={s.sectionPad}>

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div>
              <div className={s.statGrid}>
                {(() => {
                  const e = job.estimate || {};
                  const estTotal = (e.labour||0)+(e.materials||0)+(e.subcontractors||0)+(e.other||0);
                  const totalActual = actualLabour + actualMaterials + actualSubs;
                  const profit = estTotal - totalActual;
                  const avgRate = totalHours > 0 ? actualLabour / totalHours : 55;
                  const budgetHours = (e.labour||0) > 0 ? Math.round((e.labour||0) / avgRate) : 0;
                  return [
                    { label: "P&L", val: estTotal > 0 ? fmt(profit) : "—", sub: estTotal > 0 ? `${fmt(totalActual)} costs / ${fmt(estTotal)} est` : "No budget set", color: profit >= 0 ? "#16a34a" : "#dc2626" },
                    { label: "Time Logged", val: `${totalHours}h`, sub: budgetHours > 0 ? `of ${budgetHours}h budget` : "No hours budget" },
                    { label: "Costs", val: fmt(actualMaterials), sub: `of ${fmt(e.materials || 0)} budget` },
                    { label: "Contractors", val: fmt(actualSubs), sub: `of ${fmt(e.subcontractors || 0)} budget` },
                  ];
                })().map((stat,i) => (
                  <div key={i} className={s.statCard}>
                    <div className={s.statLabel}>{stat.label}</div>
                    <div className={s.statValue} style={stat.color ? { color: stat.color } : undefined}>{stat.val}</div>
                    <div className={s.statSub}>{stat.sub}</div>
                  </div>
                ))}
              </div>
              <div>
                <SectionLabel>Job Details</SectionLabel>
                <div className={s.detailsCol}>
                  {(() => {
                    const site = client?.sites?.find(x => x.id === job.siteId);
                    return [
                      [{ label: "Client", val: client?.name || "—" }, { label: "Site", val: site ? site.name : "—" }],
                      [{ label: "Site Contact", val: site?.contactName ? `${site.contactName}${site.contactPhone ? " · " + site.contactPhone : ""}` : "—" }],
                      [{ label: "Priority", val: <span className={s.capitalize}>{job.priority}</span> }],
                      [{ label: "Start Date", val: fmtDate(job.startDate) }, { label: "Due Date", val: fmtDate(job.dueDate) }],
                      [{ label: "Description", val: job.description || "No description" }],
                    ];
                  })().map((row,ri) => (
                    <div key={ri} className={row.length > 1 ? s.detailRowPair : undefined}>
                      {row.map((r,ci) => (
                        <div key={ci} className={s.detailRow}>
                          <span className={s.detailLabel}>{r.label}</span><span className={s.detailValue}>{r.val}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <SectionLabel>Team</SectionLabel>
                {job.assignedTo.length === 0
                  ? <div className={s.emptyText}>No team assigned</div>
                  : <div className={s.teamGrid}>{job.assignedTo.map((w,i) => (
                    <div key={i} className={s.teamRow}>
                      <div className={`avatar ${s.avatarNoMargin}`}>{w.split(" ").map(p=>p[0]).join("")}</div>
                      <span className={s.teamName}>{w}</span>
                      <span className={s.teamHours}>{jobTime.filter(t=>t.worker===w).reduce((sum,t)=>sum+t.hours,0)}h</span>
                    </div>
                  ))}</div>
                }
                {job.tags.length > 0 && <>
                  <SectionLabel>Tags</SectionLabel>
                  <div className={s.tagWrap}>{job.tags.map((t,i) => <span key={i} className="tag">{t}</span>)}</div>
                </>}
              </div>
            </div>
          )}

          {/* ── Quotes ── */}
          {tab === "quotes" && (
            <div>
              <div className={s.tabActions}>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.quotes.accent }} onClick={async () => {
                  try {
                    const newQ = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" };
                    const saved = await createQuote(newQ);
                    setQuotes(qs => [...qs, saved]);
                    setEditingQuote(saved);
                    setInlineQuoteMode("edit");
                  } catch (err) { console.error('Failed to create quote:', err); }
                }}><Icon name="plus" size={12} />New Quote</button>
              </div>
              {jobQuotes.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No quotes yet</div><div className="empty-state-sub">Create a quote to send to the client</div></div>
                : jobQuotes.map(q => {
                  const sub = q.lineItems.reduce((s,l) => s + l.qty * l.rate, 0);
                  const alreadyInvoiced = invoices.some(i => i.fromQuoteId === q.id);
                  return (
                    <div key={q.id} className={s.itemCard}>
                      <div className={s.cardHeader}>
                        <div>
                          <div className={s.cardNumber}>{q.number}</div>
                          <div className={s.cardDate}>{fmtDate(q.createdAt)}</div>
                        </div>
                        <div className={s.cardActions}>
                          <StatusBadge status={q.status} />
                          {q.status !== "accepted" && <button className="btn btn-secondary btn-xs" onClick={() => acceptQuote(q.id)}>Accept</button>}
                          {q.status === "accepted" && !alreadyInvoiced && (
                            <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => { quoteToInvoice(q); setTab("invoices"); }}>
                              <Icon name="invoices" size={11} />→ Invoice
                            </button>
                          )}
                          {alreadyInvoiced && <span className={s.invoicedCheck}>Invoiced ✓</span>}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingQuote(q); setInlineQuoteMode("view"); }}><Icon name="edit" size={11} /></button>
                          <button className={`btn btn-ghost btn-xs ${s.dangerBtn}`} onClick={() => delQuote(q.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <div className={s.totalsRow}>
                        <span className={s.totalsMuted}>{q.lineItems.length} item{q.lineItems.length !== 1 ? "s" : ""}</span>
                        <span className={s.totalsGrand}>Total {fmt(calcQuoteTotal(q))}</span>
                      </div>
                      {q.notes && <div className={s.itemNotes}>{q.notes}</div>}
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Invoices ── */}
          {tab === "invoices" && (
            <div>
              <div className={s.tabHeader}>
                <div className={s.summaryText}>
                  {jobInvoices.length > 0 && <span><strong className={s.strongDark}>{fmt(totalPaid)}</strong> paid of <strong className={s.strongDark}>{fmt(totalInvoiced)}</strong> invoiced</span>}
                </div>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.invoices.accent }} onClick={async () => {
                  try {
                    const newInv = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" };
                    const saved = await createInvoice(newInv);
                    setInvoices(is => [...is, saved]);
                    setEditingInvoice(saved);
                    setInlineInvMode("edit");
                  } catch (err) { console.error('Failed to create invoice:', err); }
                }}><Icon name="plus" size={12} />New Invoice</button>
              </div>
              {jobInvoices.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices yet</div><div className="empty-state-sub">Create an invoice or convert an accepted quote</div></div>
                : jobInvoices.map(inv => {
                  const sub = inv.lineItems.reduce((s,l) => s + l.qty * l.rate, 0);
                  const fromQuote = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
                  return (
                    <div key={inv.id} className={s.itemCard}>
                      <div className={s.cardHeader}>
                        <div>
                          <div className={s.cardNumber}>{inv.number}</div>
                          <div className={s.cardDate}>
                            {fmtDate(inv.createdAt)}
                            {fromQuote && <span className={s.fromRef}>from {fromQuote.number}</span>}
                            {inv.dueDate && <span className={s.dueDateRef}>· Due {fmtDate(inv.dueDate)}</span>}
                          </div>
                        </div>
                        <div className={s.cardActions}>
                          <StatusBadge status={inv.status} />
                          <XeroSyncBadge syncStatus={inv.xeroSyncStatus} xeroId={inv.xeroInvoiceId} />
                          {inv.status !== "paid" && inv.status !== "void" && (
                            <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => markInvPaid(inv.id)}>Mark Paid</button>
                          )}
                          {!inv.xeroInvoiceId && inv.status !== "draft" && (
                            <button className={`btn btn-ghost btn-xs ${s.xeroBtn}`} onClick={() => xeroSyncInvoice("push", inv.id)} title="Send to Xero"><Icon name="send" size={11} /> Xero</button>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingInvoice(inv); setInlineInvMode("view"); }}><Icon name="edit" size={11} /></button>
                          <button className={`btn btn-ghost btn-xs ${s.dangerBtn}`} onClick={() => delInvoice(inv.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table className={s.lineTable}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} className={s.lineTableTh}>{h}</th>)}</tr></thead>
                        <tbody>
                          {inv.lineItems.map((l,i) => (
                            <tr key={i}><td className={s.lineCell}>{l.desc}</td><td className={s.lineCellMuted}>{l.qty}</td><td className={s.lineCellMuted}>{l.unit}</td><td className={s.lineCellMuted}>{fmt(l.rate)}</td><td className={s.lineCellBold}>{fmt(l.qty*l.rate)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <div className={s.totalsRow}>
                        <span className={s.totalsMuted}>Subtotal <strong className={s.strongDark}>{fmt(sub)}</strong></span>
                        <span className={s.totalsMuted}>GST <strong className={s.strongDark}>{fmt(sub * inv.tax / 100)}</strong></span>
                        <span className={s.totalsGrand}>Total {fmt(calcQuoteTotal(inv))}</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Time ── */}
          {tab === "time" && (
            <div>
              <div className={s.tabHeader}>
                <div className={s.summaryText}>
                  {totalHours > 0 && <span><strong className={s.strongDark}>{jobTime.filter(t=>t.billable).reduce((sum,t)=>sum+t.hours,0)}h</strong> billable · <strong className={s.strongDark}>{totalHours}h</strong> total</span>}
                </div>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.time.accent }} onClick={() => setShowTimeForm(v => !v)}><Icon name="plus" size={12} />Log Time</button>
              </div>
              {showTimeForm && (
                <div className={s.timeFormBox}>
                  <div className={`grid-3 ${s.timeFormGrid}`}>
                    <div className={`form-group ${s.formGroupNoMb}`}>
                      <label className="form-label">Worker</label>
                      <select className="form-control" value={timeForm.worker} onChange={e => setTimeForm(f => ({ ...f, worker: e.target.value }))}>
                        {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className={`form-group ${s.formGroupNoMb}`}>
                      <label className="form-label">Date</label>
                      <input type="date" className="form-control" value={timeForm.date} onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className={`form-group ${s.formGroupNoMb}`}>
                      <label className="form-label">Hours</label>
                      <div className={`${s.hoursDisplay} ${quickHours > 0 ? s.hoursActive : s.hoursEmpty}`}>
                        {quickHours > 0 ? `${quickHours.toFixed(1)}h` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className={`grid-2 ${s.timeFormGrid}`}>
                    <div className={`form-group ${s.formGroupNoMb}`}>
                      <label className="form-label">Start Time</label>
                      <input type="time" className="form-control" value={timeForm.startTime}
                        onChange={e => setTimeForm(f => ({ ...f, startTime: e.target.value, endTime: f.endTime || addMinsToTime(e.target.value, 60) }))} />
                    </div>
                    <div className={`form-group ${s.formGroupNoMb}`}>
                      <label className="form-label">End Time</label>
                      <input type="time" className="form-control" value={timeForm.endTime}
                        onChange={e => setTimeForm(f => ({ ...f, endTime: e.target.value }))} />
                    </div>
                  </div>
                  <div className={`form-group ${s.timeFormGrid}`}>
                    <label className="form-label">Description</label>
                    <input className="form-control" value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))} placeholder="Work description" />
                  </div>
                  <div className={s.timeFormActions}>
                    <label className="checkbox-label"><input type="checkbox" checked={timeForm.billable} onChange={e => setTimeForm(f => ({ ...f, billable: e.target.checked }))} /><span>Billable</span></label>
                    <div className={s.flexGap8}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowTimeForm(false)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.time.accent }} onClick={saveTime} disabled={quickHours <= 0}><Icon name="check" size={12} />Save</button>
                    </div>
                  </div>
                </div>
              )}
              {jobTime.length === 0 && !showTimeForm
                ? <div className="empty-state"><div className="empty-state-icon">⏱</div><div className="empty-state-text">No time logged yet</div></div>
                : <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr><th>Worker</th><th>Date</th><th>Hours</th><th>Billable</th><th>Description</th><th></th></tr></thead>
                    <tbody>
                      {[...jobTime].sort((a,b) => b.date > a.date ? 1 : -1).map(t => (
                        <tr key={t.id}>
                          <td><div className={s.workerCell}><div className={`avatar ${s.workerAvatar}`}>{t.worker.split(" ").map(w=>w[0]).join("")}</div><span className={s.workerName}>{t.worker}</span></div></td>
                          <td className={s.dateCell}>{fmtDate(t.date)}</td>
                          <td><span className={s.hoursBold}>{t.hours}h</span></td>
                          <td><span className="badge" style={{ background: t.billable ? "#111" : "#f0f0f0", color: t.billable ? "#fff" : "#999" }}>{t.billable ? "Billable" : "Non-bill"}</span></td>
                          <td className={s.descCell}>{t.description}</td>
                          <td><button className={`btn btn-ghost btn-xs ${s.dangerBtn}`} onClick={() => delTime(t.id)}><Icon name="trash" size={11} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></div>
              }
            </div>
          )}

          {/* ── Costs / Bills ── */}
          {tab === "costs" && (
            <div>
              <div className={s.tabHeader}>
                <div className={s.summaryText}>
                  {jobBills.length > 0 && (
                    <span>
                      <strong className={s.strongDark}>{fmt(jobBills.filter(b=>b.status==="posted"||b.status==="approved").reduce((sum,b)=>sum+b.amount,0))}</strong> approved
                      {jobBills.filter(b=>b.status==="inbox"||b.status==="linked").length > 0 && (
                        <span> · <strong className={s.strongDark}>{fmt(jobBills.filter(b=>b.status==="inbox"||b.status==="linked").reduce((sum,b)=>sum+b.amount,0))}</strong> pending</span>
                      )}
                    </span>
                  )}
                </div>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setEditingBill({})}><Icon name="plus" size={12} />Capture Bill</button>
              </div>
              {jobBills.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills captured for this job</div><div className="empty-state-sub">Capture receipts and supplier invoices here</div></div>
                : <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr><th>Supplier</th><th>Invoice #</th><th>Category</th><th>Date</th><th>Ex-GST</th><th>Total</th><th>Markup</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {jobBills.map(b => {
                        const exGst = b.hasGst !== false ? (b.amount||0) / 1.1 : (b.amount||0);
                        const onCharge = exGst * (1 + (b.markup||0) / 100);
                        return (
                          <tr key={b.id}>
                            <td>
                              <div className={s.supplierName}>{b.supplier || <span className={s.supplierEmpty}>—</span>}</div>
                              {b.description && <div className={s.billDesc}>{b.description.slice(0,40)}{b.description.length>40?"…":""}</div>}
                            </td>
                            <td><span className={s.monoRef}>{b.invoiceNo || "—"}</span></td>
                            <td><span className="chip">{b.category}</span></td>
                            <td className={s.dateCell}>{fmtDate(b.date)}</td>
                            <td className={s.fontSize13}>{fmt(exGst)}</td>
                            <td className={s.billAmount}>{fmt(b.amount||0)}</td>
                            <td className={s.fontSize12}>
                              {(b.markup||0) > 0
                                ? <span className={s.markupText}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span>
                                : <span className={s.markupEmpty}>—</span>}
                            </td>
                            <td><BillStatusBadge status={b.status} /> <XeroSyncBadge syncStatus={b.xeroSyncStatus} xeroId={b.xeroBillId} /></td>
                            <td>
                              <div className={s.flexGap4}>
                                {!b.xeroBillId && (b.status === "approved" || b.status === "posted") && (
                                  <button className={`btn btn-ghost btn-xs ${s.xeroBtn}`} title="Send to Xero" onClick={() => xeroSyncBill("push", b.id)}><Icon name="send" size={11} /></button>
                                )}
                                {b.status === "linked" && (
                                  <button className={`btn btn-ghost btn-xs ${s.approveBtn}`} title="Approve"
                                    onClick={async () => {
                                      try {
                                        const saved = await updateBill(b.id, { ...b, status: "approved" });
                                        setBills(bs => bs.map(x => x.id === saved.id ? saved : x));
                                        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill from ${b.supplier} approved`) } : j));
                                      } catch (err) { console.error('Failed to approve bill:', err); }
                                    }}>
                                    <Icon name="check" size={11} />
                                  </button>
                                )}
                                <button className="btn btn-ghost btn-xs" onClick={() => setEditingBill(b)}><Icon name="edit" size={11} /></button>
                                <button className={`btn btn-ghost btn-xs ${s.dangerBtn}`} onClick={() => delBill(b.id)}><Icon name="trash" size={11} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div></div>
              }
            </div>
          )}

          {/* ── Schedule ── */}
          {tab === "schedule" && (
            <div>
              <div className={s.tabHeader}>
                <div className={s.summaryText}>{jobSchedule.length} schedule entr{jobSchedule.length === 1 ? "y" : "ies"}</div>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.schedule.accent }} onClick={() => setShowSchedForm(v => !v)}><Icon name="plus" size={12} />{showSchedForm ? "Cancel" : "Schedule Day"}</button>
              </div>
              {showSchedForm && (
                <div className={s.quickForm}>
                  <div className={s.grid2Fixed}>
                    <div className="form-group">
                      <label className="form-label">Date *</label>
                      <input type="date" className="form-control" value={schedForm.date} onChange={e => setSchedForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <input className="form-control" value={schedForm.notes} onChange={e => setSchedForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assigned Team</label>
                    <div className="multi-select">
                      {(staff && staff.length > 0 ? staff.map(st => st.name) : TEAM).map(t => (
                        <span key={t} className={`multi-option ${schedForm.assignedTo.includes(t) ? "selected" : ""}`}
                          onClick={() => setSchedForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.schedule.accent }} onClick={saveScheduleEntry} disabled={!schedForm.date}><Icon name="check" size={12} /> Add to Schedule</button>
                </div>
              )}
              {jobSchedule.length === 0 && !showSchedForm
                ? <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No schedule entries</div><div className="empty-state-sub">Click "Schedule Day" to add one</div></div>
                : jobSchedule.map(sch => {
                  const schClient = clients.find(c => c.id === job.clientId);
                  const schSite = schClient?.sites?.find(st => st.id === job.siteId);
                  return (
                    <div key={sch.id} className={s.scheduleItem}>
                      <div className={s.dateBadge}>
                        <div className={s.dateBadgeMonth}>{new Date(sch.date+"T12:00:00").toLocaleString("en", { month: "short" })}</div>
                        <div className={s.dateBadgeDay}>{new Date(sch.date+"T12:00:00").getDate()}</div>
                      </div>
                      <div className={s.scheduleFlex}>
                        <div className={s.scheduleTitle}>{fmtDate(sch.date)} · {new Date(sch.date+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long"})}</div>
                        {schSite && <div className={s.scheduleMeta}>📍 {schSite.name}</div>}
                        {schSite?.contactName && <div className={s.scheduleMetaPlain}>👤 {schSite.contactName} {schSite.contactPhone && `· ${schSite.contactPhone}`}</div>}
                        {sch.notes && <div className={s.scheduleNotes}>{sch.notes}</div>}
                        {(sch.assignedTo||[]).length > 0 && <div className={s.scheduleTeam}><AvatarGroup names={sch.assignedTo} max={4} /></div>}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Activity ── */}
          {tab === "orders" && (
            <div>
              <div className={s.tabHeader}>
                <div className={s.summaryText}>
                  {jobWOs.length + jobPOs.length > 0
                    ? <span><strong className={s.strongDark}>{jobWOs.length}</strong> WO{jobWOs.length !== 1 ? "s" : ""} · <strong className={s.strongDark}>{jobPOs.length}</strong> PO{jobPOs.length !== 1 ? "s" : ""}</span>
                    : "No orders yet"}
                </div>
                <div className={s.ordersActions}>
                  <button className="btn btn-primary btn-sm" style={{ background: "#2563eb" }} onClick={() => {
                    setOrderModal({ type: "wo", order: null });
                  }}><Icon name="plus" size={12} />New WO</button>
                  <button className="btn btn-primary btn-sm" style={{ background: "#16a34a" }} onClick={() => {
                    setOrderModal({ type: "po", order: null });
                  }}><Icon name="plus" size={12} />New PO</button>
                </div>
              </div>
              {jobWOs.length + jobPOs.length === 0
                ? <div className={s.ordersEmpty}>No work orders or purchase orders linked to this job yet.</div>
                : <div className="order-cards-grid">
                    {[...jobWOs.map(o => ({ ...o, _type: "wo" })), ...jobPOs.map(o => ({ ...o, _type: "po" }))].sort((a,b) => b.id - a.id).map(o => (
                      <OrderCard key={o.id} type={o._type} order={o} jobs={jobs} onOpen={() => setOrderModal({ type: o._type, order: o })} onDelete={() => {
                        if (o._type === "wo") setWorkOrders(prev => prev.filter(x => x.id !== o.id));
                        else setPurchaseOrders(prev => prev.filter(x => x.id !== o.id));
                      }} />
                    ))}
                  </div>
              }
              {orderModal && <OrderDrawer type={orderModal.type} order={orderModal.order} initialMode={orderModal.order ? "view" : "edit"} presetJobId={job.id} onSave={(order) => {
                const target = orderModal.type === "wo" ? setWorkOrders : setPurchaseOrders;
                target(prev => { const exists = prev.find(o => o.id === order.id); return exists ? prev.map(o => o.id === order.id ? order : o) : [...prev, order]; });
                setOrderModal(m => m ? { ...m, order } : null);
              }} onClose={() => setOrderModal(null)} jobs={jobs} companyInfo={companyInfo} onTransition={(updated) => {
                (orderModal.type === "wo" ? setWorkOrders : setPurchaseOrders)(prev => prev.map(o => o.id === updated.id ? updated : o));
                setOrderModal(m => m ? { ...m, order: updated } : null);
              }} />}
            </div>
          )}

          {tab === "pnl" && <JobPnL job={job} client={client} />}

          {/* ── Gantt Tab ── */}
          {tab === "gantt" && <JobGantt job={job} />}

          {/* ── Tasks Tab ── */}
          {tab === "tasks" && <JobTasks job={job} />}

          {tab === "notes" && <JobNotes job={job} />}


          {tab === "activity" && (
            <div>
              <div className={s.activityHeader}>
                <div className={s.summaryText}>{(job.activityLog||[]).length} event{(job.activityLog||[]).length !== 1 ? "s" : ""} recorded</div>
              </div>
              <ActivityLog entries={job.activityLog || []} />
            </div>
          )}

        </div>
        )}
    </SectionDrawer>

    {/* ── Inline Quote Drawer ─────────────────────────────────────────── */}
    {editingQuote && (() => {
      const qTotal = calcQuoteTotal(editingQuote);
      const qSub = (editingQuote.lineItems||[]).reduce((s,li) => s + (li.qty||0)*(li.rate||0), 0);
      const qGst = qSub * ((editingQuote.tax||0)/100);
      const qAccent = SECTION_COLORS.quotes.accent;
      return (
      <SectionDrawer
        accent={qAccent}
        icon={<Icon name="quotes" size={16} />}
        typeLabel="Quote"
        title={editingQuote.number || "New Quote"}
        statusBadge={<StatusBadge status={editingQuote.status} />}
        mode={inlineQuoteMode} setMode={setInlineQuoteMode}
        showToggle={true}
        statusStrip={inlineQuoteMode === "edit" ?
          <div className={s.statusStripSmall} style={{ background: SECTION_COLORS.quotes.light }}>
            {["draft","sent","accepted","declined"].filter(st => st !== editingQuote.status).map(st => (
              <button key={st} className={`btn btn-xs ${s.statusBtn}`}
                onClick={() => setEditingQuote(q => ({ ...q, status: st }))}>{st.charAt(0).toUpperCase()+st.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineQuoteMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingQuote(null)}>Close</button>
          <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: qAccent }} onClick={() => setInlineQuoteMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineQuoteMode("view")}>Cancel</button>
          <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: qAccent }} onClick={() => saveQuote(editingQuote)}>
            <Icon name="check" size={13} /> Save Quote
          </button>
        </>}
        onClose={() => setEditingQuote(null)}
        zIndex={1060}
      >
        {inlineQuoteMode === "view" ? (
        <div className={s.sectionPad}>
          <div className={s.viewGrid2}>
            <ViewField label="Status" value={editingQuote.status?.charAt(0).toUpperCase() + editingQuote.status?.slice(1)} />
            <ViewField label="GST" value={`${editingQuote.tax}%`} />
          </div>
          <div className={s.lineItemsSection}>
            <div className={s.sectionHeading}>Line Items</div>
            <table className={s.viewTable}>
              <thead><tr className={s.viewTableHeadRow}>
                <th className={s.viewTableThLeft}>Description</th>
                <th className={s.viewTableThRight}>Qty</th>
                <th className={s.viewTableThLeft}>Unit</th>
                <th className={s.viewTableThRight}>Rate</th>
                <th className={s.viewTableThRight}>Amount</th>
              </tr></thead>
              <tbody>
                {(editingQuote.lineItems||[]).map((li, i) => (
                  <tr key={i} className={s.viewTableBodyRow}>
                    <td className={s.viewTableTdBold}>{li.desc || '—'}</td>
                    <td className={s.viewTableTdRight}>{li.qty}</td>
                    <td className={s.viewTableTd}>{li.unit}</td>
                    <td className={s.viewTableTdRight}>{fmt(li.rate)}</td>
                    <td className={s.viewTableTdRightBold}>{fmt(li.qty * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.totalsBox}>
            <div className={s.totalsLine}><span className={s.totalsLabel}>Subtotal</span><span className={s.totalsAmount}>{fmt(qSub)}</span></div>
            <div className={s.totalsLine}><span className={s.totalsLabel}>GST ({editingQuote.tax}%)</span><span className={s.totalsAmount}>{fmt(qGst)}</span></div>
            <div className={s.totalsLineFinal}><span className={s.totalsFinalLabel}>Total</span><span className={s.totalsFinalAmount} style={{ color: qAccent }}>{fmt(qTotal)}</span></div>
          </div>
          {editingQuote.notes && <ViewField label="Notes / Terms" value={editingQuote.notes} />}
        </div>
        ) : (
        <div className={s.sectionPad}>
          <div className={`grid-2 ${s.editGridMb}`}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={editingQuote.status}
                onChange={e => setEditingQuote(q => ({ ...q, status: e.target.value }))}>
                {["draft","sent","accepted","declined"].map(st => <option key={st} value={st}>{st.charAt(0).toUpperCase()+st.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">GST %</label>
              <input type="number" className="form-control" value={editingQuote.tax}
                onChange={e => setEditingQuote(q => ({ ...q, tax: parseFloat(e.target.value)||0 }))} min="0" max="100" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Line Items</label>
            <LineItemsEditor items={editingQuote.lineItems}
              onChange={items => setEditingQuote(q => ({ ...q, lineItems: items }))} />
          </div>
          <div className={s.editTotalsBar}>
            <span className={s.editTotalSm}>Subtotal <strong>{fmt(qSub)}</strong></span>
            <span className={s.editTotalSm}>GST <strong>{fmt(qGst)}</strong></span>
            <span className={s.editTotalLg}>Total {fmt(qTotal)}</span>
          </div>
          <div className={`form-group ${s.editFormMt}`}>
            <label className="form-label">Notes / Terms</label>
            <textarea className="form-control" value={editingQuote.notes||""}
              onChange={e => setEditingQuote(q => ({ ...q, notes: e.target.value }))}
              placeholder="Payment terms, inclusions/exclusions, validity period…" />
          </div>
        </div>
        )}
      </SectionDrawer>
      );
    })()}

    {/* ── Inline Invoice Drawer ───────────────────────────────────────── */}
    {editingInvoice && (() => {
      const iSub = (editingInvoice.lineItems||[]).reduce((s,li) => s + (li.qty||0)*(li.rate||0), 0);
      const iGst = iSub * ((editingInvoice.tax||0)/100);
      const iTotal = iSub + iGst;
      const iAccent = SECTION_COLORS.invoices.accent;
      return (
      <SectionDrawer
        accent={iAccent}
        icon={<Icon name="invoices" size={16} />}
        typeLabel="Invoice"
        title={editingInvoice.number || "New Invoice"}
        statusBadge={<StatusBadge status={editingInvoice.status} />}
        mode={inlineInvMode} setMode={setInlineInvMode}
        showToggle={true}
        statusStrip={inlineInvMode === "edit" ?
          <div className={s.statusStripSmall} style={{ background: SECTION_COLORS.invoices.light }}>
            {["draft","sent","paid","overdue","void"].filter(st => st !== editingInvoice.status).map(st => (
              <button key={st} className={`btn btn-xs ${s.statusBtn}`}
                onClick={() => setEditingInvoice(i => ({ ...i, status: st }))}>{st.charAt(0).toUpperCase()+st.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineInvMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingInvoice(null)}>Close</button>
          <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: iAccent }} onClick={() => setInlineInvMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineInvMode("view")}>Cancel</button>
          <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: iAccent }} onClick={() => saveInvoice(editingInvoice)}>
            <Icon name="check" size={13} /> Save Invoice
          </button>
        </>}
        onClose={() => setEditingInvoice(null)}
        zIndex={1060}
      >
        {inlineInvMode === "view" ? (
        <div className={s.sectionPad}>
          <div className={s.viewGrid3}>
            <ViewField label="Status" value={editingInvoice.status?.charAt(0).toUpperCase() + editingInvoice.status?.slice(1)} />
            <ViewField label="Due Date" value={fmtDate(editingInvoice.dueDate)} />
            <ViewField label="GST" value={`${editingInvoice.tax}%`} />
          </div>
          <div className={s.lineItemsSection}>
            <div className={s.sectionHeading}>Line Items</div>
            <table className={s.viewTable}>
              <thead><tr className={s.viewTableHeadRow}>
                <th className={s.viewTableThLeft}>Description</th>
                <th className={s.viewTableThRight}>Qty</th>
                <th className={s.viewTableThLeft}>Unit</th>
                <th className={s.viewTableThRight}>Rate</th>
                <th className={s.viewTableThRight}>Amount</th>
              </tr></thead>
              <tbody>
                {(editingInvoice.lineItems||[]).map((li, i) => (
                  <tr key={i} className={s.viewTableBodyRow}>
                    <td className={s.viewTableTdBold}>{li.desc || '—'}</td>
                    <td className={s.viewTableTdRight}>{li.qty}</td>
                    <td className={s.viewTableTd}>{li.unit}</td>
                    <td className={s.viewTableTdRight}>{fmt(li.rate)}</td>
                    <td className={s.viewTableTdRightBold}>{fmt(li.qty * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.totalsBox}>
            <div className={s.totalsLine}><span className={s.totalsLabel}>Subtotal</span><span className={s.totalsAmount}>{fmt(iSub)}</span></div>
            <div className={s.totalsLine}><span className={s.totalsLabel}>GST ({editingInvoice.tax}%)</span><span className={s.totalsAmount}>{fmt(iGst)}</span></div>
            <div className={s.totalsLineFinal}><span className={s.totalsFinalLabel}>Total</span><span className={s.totalsFinalAmount} style={{ color: iAccent }}>{fmt(iTotal)}</span></div>
          </div>
          {editingInvoice.notes && <ViewField label="Notes" value={editingInvoice.notes} />}
        </div>
        ) : (
        <div className={s.sectionPad}>
          <div className={`grid-3 ${s.editGridMb}`}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={editingInvoice.status}
                onChange={e => setEditingInvoice(i => ({ ...i, status: e.target.value }))}>
                {["draft","sent","paid","overdue","void"].map(st => <option key={st} value={st}>{st.charAt(0).toUpperCase()+st.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input type="date" className="form-control" value={editingInvoice.dueDate||""}
                onChange={e => setEditingInvoice(i => ({ ...i, dueDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">GST %</label>
              <input type="number" className="form-control" value={editingInvoice.tax}
                onChange={e => setEditingInvoice(i => ({ ...i, tax: parseFloat(e.target.value)||0 }))} min="0" max="100" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Line Items</label>
            <LineItemsEditor items={editingInvoice.lineItems}
              onChange={items => setEditingInvoice(i => ({ ...i, lineItems: items }))} />
          </div>
          <div className={s.editTotalsBar}>
            <span className={s.editTotalSm}>Subtotal <strong>{fmt(iSub)}</strong></span>
            <span className={s.editTotalSm}>GST <strong>{fmt(iGst)}</strong></span>
            <span className={s.editTotalLg}>Total {fmt(iTotal)}</span>
          </div>
          <div className={`form-group ${s.editFormMt}`}>
            <label className="form-label">Notes</label>
            <textarea className="form-control" value={editingInvoice.notes||""}
              onChange={e => setEditingInvoice(i => ({ ...i, notes: e.target.value }))}
              placeholder="Payment instructions, bank details, thank you note…" />
          </div>
        </div>
        )}
      </SectionDrawer>
      );
    })()}

    {/* ── Inline Bill Capture / Edit Modal ───────────────────────────────── */}
    {editingBill !== null && (
      <BillModal
        bill={editingBill?.id ? editingBill : null}
        jobs={jobs || []}
        onSave={saveBillFromJob}
        onClose={() => setEditingBill(null)}
        defaultJobId={job.id}
      />
    )}
    </>
  );
};

export default JobDetail;
