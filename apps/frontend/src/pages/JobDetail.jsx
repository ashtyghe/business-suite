import { useState, useRef } from "react";
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
  SectionProgressBar, FileIconBadge, BillStatusBadge, BILL_CATEGORIES,
  SectionLabel, SectionDrawer, LineItemsEditor, ActivityLog,
} from "../components/shared";
import { PhotoMarkupEditor } from "../components/PhotoMarkupEditor";
import { PlanDrawingEditor } from "../components/PlanDrawingEditor";
import { FormFillerModal } from "../components/FormFillerModal";
import { BillModal } from "../components/BillModal";
import { PdfFormFiller } from "../components/PdfFormFiller";
import { OrderCard } from "../components/OrderCard";
import {
  TEAM, NOTE_CATEGORIES, FORM_TEMPLATES, SECTION_COLORS, ViewField,
  ORDER_CONTRACTORS, ORDER_SUPPLIERS, ORDER_UNITS,
  ORDER_STATUSES, ORDER_TRANSITIONS, ORDER_TERMINAL,
} from "../fixtures/seedData.jsx";
import {
  fmt, calcQuoteTotal, uid, addLog, fmtFileSize,
  genId, makeLogEntry, orderAddDays, orderToday, orderFmtDate,
  orderFmtTs, orderAddLog, applyTransition, orderJobDisplay,
  daysUntil, calcHoursFromTimes, addMinsToTime, hexToRgba,
  COMPLIANCE_DOC_TYPES, COMPLIANCE_STATUS_COLORS,
  getComplianceStatus, getDaysUntilExpiry, getContractorComplianceCount,
  ORDER_STATUS_TRIGGERS,
} from "../utils/helpers";

import JobPnL from './JobDetail/JobPnL';
import JobGantt from './JobDetail/JobGantt';
import JobTasks from './JobDetail/JobTasks';

// ── Job Detail Drawer ─────────────────────────────────────────────────────────
const JobDetail = ({ job, onClose, onEdit }) => {
  const { clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, jobs, setJobs, staff, workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders } = useAppStore();
  const [tab, setTab] = useState("overview");
  const [detailMode, setDetailMode] = useState("view");
  const [detailForm, setDetailForm] = useState({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } });
  const client = clients.find(c => c.id === job.clientId);

  const jobQuotes    = quotes.filter(q => q.jobId === job.id);
  const jobInvoices  = invoices.filter(i => i.jobId === job.id);
  const jobTime      = timeEntries.filter(t => t.jobId === job.id);
  const jobBills     = bills.filter(b => b.jobId === job.id);
  const jobSchedule  = schedule.filter(s => s.jobId === job.id).sort((a,b) => a.date > b.date ? 1 : -1);
  const jobWOs = (workOrders || []).filter(o => o.jobId === job.id);
  const jobPOs = (purchaseOrders || []).filter(o => o.jobId === job.id);

  const totalQuoted   = jobQuotes.filter(q => q.status === "accepted").reduce((s,q) => s + calcQuoteTotal(q), 0);
  const totalInvoiced = jobInvoices.reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalPaid     = jobInvoices.filter(i => i.status === "paid").reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalHours    = jobTime.reduce((s,t) => s + t.hours, 0);
  const totalCosts    = jobBills.filter(b => b.status === "approved").reduce((s,b) => s + b.amount, 0);

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

  // ── Notes state & CRUD ──
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ text: "", category: "general", attachments: [] });
  const [noteFilter, setNoteFilter] = useState("all");
  const [lightboxImg, setLightboxImg] = useState(null);
  const [markupImg, setMarkupImg] = useState(null); // { src, noteId, attachmentId } or { src, target: "new" }
  const [showPlanDrawing, setShowPlanDrawing] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteForm, setEditNoteForm] = useState({ text: "", category: "general", attachments: [] });

  // ── Gantt state ──
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  // ── Tasks state ──
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ text: "", dueDate: "", assignedTo: "" });
  const [showFormFiller, setShowFormFiller] = useState(null);
  const [viewingForm, setViewingForm] = useState(null);
  const [showFormMenu, setShowFormMenu] = useState(false);

  // ── PDF Filler state ──
  const [showPdfFiller, setShowPdfFiller] = useState(null); // { pdfData, fileName, existingFields? }
  const pdfInputRef = useRef(null);

  const handlePdfFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setShowPdfFiller({ pdfData: ev.target.result, fileName: file.name });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handlePdfSave = ({ filledPdfDataUrl, thumbnail, fields: pdfFields, fileName: filledName }) => {
    const note = {
      id: Date.now(), text: `PDF filled: ${filledName}`, category: "general",
      attachments: [{ id: genId(), name: filledName, size: Math.round(filledPdfDataUrl.length * 0.75), type: "application/pdf", dataUrl: filledPdfDataUrl }],
      pdfNote: true, pdfThumbnail: thumbnail, pdfFields: pdfFields, pdfOriginalData: showPdfFiller?.pdfData ? Array.from(new Uint8Array(showPdfFiller.pdfData)) : null,
      createdAt: new Date().toISOString(), createdBy: CURRENT_USER,
    };
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Filled PDF: ${filledName}`) } : j));
    setShowPdfFiller(null);
  };

  const reopenPdfNote = (note) => {
    if (note.pdfOriginalData) {
      const arr = new Uint8Array(note.pdfOriginalData);
      setShowPdfFiller({ pdfData: arr.buffer, fileName: note.attachments?.[0]?.name || "document.pdf", existingFields: note.pdfFields });
    }
  };

  const printFormPdf = (note, tmpl) => {
    const data = note.formData || {};
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${tmpl?.name || "Form"} – ${job.title}</title><style>body{font-family:sans-serif;padding:30px;max-width:700px;margin:0 auto}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:14px;color:#666;margin-top:0}.field{margin-bottom:16px}.label{font-size:11px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:0.05em;margin-bottom:4px}.value{font-size:13px;color:#333;white-space:pre-wrap}.check{display:flex;gap:6px;align-items:center;font-size:13px;margin:2px 0}.check-y{color:#059669;font-weight:700}.check-n{color:#dc2626;font-weight:700}.sig{max-width:300px;height:80px;border:1px solid #ddd;border-radius:4px}.meta{font-size:11px;color:#888;margin-bottom:16px}</style></head><body>`);
    w.document.write(`<h1>${tmpl?.icon || ""} ${tmpl?.name || "Form"}</h1>`);
    w.document.write(`<h2>${job.title}</h2>`);
    w.document.write(`<div class="meta">Completed ${new Date(note.createdAt).toLocaleString()} by ${note.createdBy}</div>`);
    (tmpl?.fields || []).forEach(field => {
      const val = data[field.key];
      w.document.write(`<div class="field"><div class="label">${field.label}</div>`);
      if (field.type === "checklist") {
        (field.options || []).forEach(opt => {
          const checked = (val || []).includes(opt);
          w.document.write(`<div class="check"><span class="${checked ? "check-y" : "check-n"}">${checked ? "✓" : "✗"}</span><span>${opt}</span></div>`);
        });
      } else if (field.type === "signature") {
        w.document.write(val ? `<img class="sig" src="${val}" />` : `<div class="value">No signature</div>`);
      } else {
        w.document.write(`<div class="value">${val || "—"}</div>`);
      }
      w.document.write(`</div>`);
    });
    w.document.write(`</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const addNote = () => {
    if (!noteForm.text.trim() && noteForm.attachments.length === 0) return;
    const note = { id: Date.now(), text: noteForm.text, category: noteForm.category, attachments: noteForm.attachments.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl })), createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
    const catLabel = NOTE_CATEGORIES.find(c => c.id === noteForm.category)?.label || noteForm.category;
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Added note (${catLabel})`) } : j));
    setNoteForm({ text: "", category: "general", attachments: [] });
    setShowNoteForm(false);
  };

  const startEditNote = (note) => {
    setEditingNoteId(note.id);
    setEditNoteForm({ text: note.text, category: note.category, attachments: [...(note.attachments || [])] });
  };

  const saveEditNote = () => {
    if (!editNoteForm.text.trim() && editNoteForm.attachments.length === 0) return;
    const catLabel = NOTE_CATEGORIES.find(c => c.id === editNoteForm.category)?.label || editNoteForm.category;
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: (j.notes || []).map(n => n.id === editingNoteId ? { ...n, text: editNoteForm.text, category: editNoteForm.category, attachments: editNoteForm.attachments.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl })) } : n), activityLog: addLog(j.activityLog, `Edited note (${catLabel})`) } : j));
    setEditingNoteId(null);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditNoteForm({ text: "", category: "general", attachments: [] });
  };

  const handleEditNoteFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { setEditNoteForm(prev => ({ ...prev, attachments: prev.attachments.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x) })); };
        reader.readAsDataURL(m._file);
      }
    });
    setEditNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, ...mapped] }));
    e.target.value = "";
  };

  const deleteNote = (noteId) => {
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: (j.notes || []).filter(n => n.id !== noteId), activityLog: addLog(j.activityLog, "Deleted a note") } : j));
  };

  const handleNoteFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { setNoteForm(prev => ({ ...prev, attachments: prev.attachments.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x) })); };
        reader.readAsDataURL(m._file);
      }
    });
    setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, ...mapped] }));
    e.target.value = "";
  };

  const saveMarkup = (dataUrl) => {
    if (markupImg?.noteId && markupImg?.attachmentId) {
      // Replace existing attachment on a saved note
      setJobs(js => js.map(j => j.id === job.id ? {
        ...j,
        notes: (j.notes || []).map(n => n.id === markupImg.noteId ? {
          ...n,
          attachments: n.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
        } : n),
        activityLog: addLog(j.activityLog, "Photo marked up")
      } : j));
    } else if (markupImg?.target === "new" && markupImg?.attachmentId) {
      // Replace attachment in new note form
      setNoteForm(prev => ({
        ...prev,
        attachments: prev.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
      }));
    } else if (markupImg?.target === "new") {
      // Add marked-up image as new attachment to the current note form (from lightbox)
      const att = { id: genId(), name: "markup_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
      setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, att] }));
    } else if (markupImg?.target === "edit") {
      // Replace attachment in edit form
      setEditNoteForm(prev => ({
        ...prev,
        attachments: prev.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
      }));
    }
    setMarkupImg(null);
  };

  const savePlan = (dataUrl) => {
    const att = { id: genId(), name: "plan_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
    if (showNoteForm) {
      setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, att], text: prev.text || "Plan drawing" }));
    } else {
      // Auto-create a note with the plan
      const newNote = { id: Date.now(), text: "Plan drawing", category: "general", attachments: [att], createdAt: new Date().toISOString(), createdBy: "Alex Jones" };
      setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), newNote], activityLog: addLog(j.activityLog, "Added plan drawing") } : j));
    }
    setShowPlanDrawing(false);
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
    { id: "gantt", label: `Gantt (${jobPhases.length})` },
    { id: "tasks", label: `Tasks${tasksRemaining > 0 ? ` (${tasksRemaining})` : jobTasks.length > 0 ? " ✓" : ""}` },
    { id: "notes", label: `Notes (${jobNotes.length})` },
    { id: "quotes", label: `Quotes (${jobQuotes.length})` },
    { id: "invoices", label: `Invoices (${jobInvoices.length})` },
    { id: "time", label: `Time (${totalHours}h)` },
    { id: "costs", label: `Costs (${jobBills.length})` },
    { id: "schedule", label: `Schedule (${jobSchedule.length})` },
    { id: "orders", label: `Orders (${jobWOs.length + jobPOs.length})` },
    { id: "activity", label: `Activity (${(job.activityLog||[]).length})` },
  ];

  const jobAccent = SECTION_COLORS.jobs.accent;
  const jobLight = SECTION_COLORS.jobs.light;

  const jobStatusStrip = detailMode === "view" ? (
    <div style={{ flexShrink: 0 }}>
      <div style={{ padding: "10px 20px", background: jobLight, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
        {["draft","scheduled","in_progress","completed","cancelled"].filter(s => s !== job.status).map(s => (
          <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => {
            const updated = { ...job, status: s, activityLog: addLog(job.activityLog, `Status → ${s.replace("_"," ")}`) };
            setJobs(js => js.map(j => j.id === job.id ? updated : j));
          }}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</button>
        ))}
      </div>
      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 0, padding: "0 20px", overflowX: "auto", flexShrink: 0 }}>
        {tabs.map(t => <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} style={{ whiteSpace: "nowrap", borderBottomColor: tab === t.id ? jobAccent : "transparent" }}>{t.label}</div>)}
      </div>
    </div>
  ) : null;

  const jobFooter = detailMode === "view" ? <>
    <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => { setDetailForm({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setDetailMode("edit"); }}>
      <Icon name="edit" size={13} /> Edit
    </button>
  </> : <>
    <button className="btn btn-ghost btn-sm" onClick={() => setDetailMode("view")}>Cancel</button>
    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={saveDetailForm} disabled={!detailForm.title}>
      <Icon name="check" size={13} /> Save Changes
    </button>
  </>;

  return (
    <>
    <SectionDrawer
      accent={jobAccent}
      icon={<Icon name="jobs" size={16} />}
      typeLabel="Job"
      title={job.title}
      statusBadge={<StatusBadge status={job.status} />}
      mode={detailMode} setMode={setDetailMode}
      showToggle={true}
      statusStrip={jobStatusStrip}
      footer={jobFooter}
      onClose={onClose}
    >
        {detailMode === "edit" ? (
        <div style={{ padding: "20px 24px" }}>
          <div className="form-group">
            <label className="form-label">Job Title *</label>
            <input className="form-control" value={detailForm.title} onChange={e => setDetailForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Fitout – Level 3" />
          </div>
          <div className="grid-3">
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
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={detailForm.status} onChange={e => setDetailForm(f => ({ ...f, status: e.target.value }))}>
                {["draft","scheduled","quoted","in_progress","completed","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-control" value={detailForm.priority} onChange={e => setDetailForm(f => ({ ...f, priority: e.target.value }))}>
                {["high","medium","low"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tags (comma separated)</label>
              <input className="form-control" value={detailForm.tags} onChange={e => setDetailForm(f => ({ ...f, tags: e.target.value }))} placeholder="fitout, commercial, urgent" />
            </div>
          </div>
          <div className="grid-2">
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
            <label className="form-label">Assigned Team Members</label>
            <div className="multi-select">
              {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                <span key={t} className={`multi-option ${detailForm.assignedTo.includes(t) ? "selected" : ""}`}
                  onClick={() => setDetailForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Estimate</div>
            <div style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Labour ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.labour || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, labour: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Materials ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.materials || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, materials: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Subcontractors ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.subcontractors || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, subcontractors: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Other ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.other || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, other: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              {(() => {
                const t = (detailForm.estimate?.labour || 0) + (detailForm.estimate?.materials || 0) + (detailForm.estimate?.subcontractors || 0) + (detailForm.estimate?.other || 0);
                return <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0", fontSize: 13, fontWeight: 800 }}>Total: {fmt(t)}</div>;
              })()}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={detailForm.description} onChange={e => setDetailForm(f => ({ ...f, description: e.target.value }))} placeholder="Job details, scope of work..." />
          </div>
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div>
              {job.description && <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 20 }}>{job.description}</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Estimate", val: (() => { const e = job.estimate || {}; const t = (e.labour||0)+(e.materials||0)+(e.subcontractors||0)+(e.other||0); return t > 0 ? fmt(t) : "—"; })(), sub: (() => { const e = job.estimate || {}; const t = (e.labour||0)+(e.materials||0)+(e.subcontractors||0)+(e.other||0); return t > 0 ? "Budget set" : "Not set"; })() },
                  { label: "Quoted", val: fmt(totalQuoted), sub: `${jobQuotes.filter(q=>q.status==="accepted").length} accepted` },
                  { label: "Invoiced", val: fmt(totalInvoiced), sub: `${fmt(totalPaid)} paid` },
                  { label: "Time Logged", val: `${totalHours}h`, sub: `${jobTime.filter(t=>t.billable).reduce((s,t)=>s+t.hours,0)}h billable` },
                  { label: "Costs", val: fmt(totalCosts), sub: `${jobBills.filter(b=>b.status==="pending").length} pending` },
                ].map((s,i) => (
                  <div key={i} style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="grid-2">
                <div>
                  <SectionLabel>Job Details</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { label: "Client", val: client?.name },
                      { label: "Site", val: (() => { const s = client?.sites?.find(x => x.id === job.siteId); return s ? s.name : "—"; })() },
                      { label: "Site Contact", val: (() => { const s = client?.sites?.find(x => x.id === job.siteId); return s?.contactName ? `${s.contactName}${s.contactPhone ? " · " + s.contactPhone : ""}` : "—"; })() },
                      { label: "Status", val: <StatusBadge status={job.status} /> },
                      { label: "Priority", val: <span style={{ textTransform: "capitalize" }}>{job.priority}</span> },
                      { label: "Start Date", val: job.startDate || "—" },
                      { label: "Due Date", val: job.dueDate || "—" },
                    ].map((r,i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #f5f5f5", paddingBottom: 6 }}>
                        <span style={{ color: "#888" }}>{r.label}</span><span style={{ fontWeight: 600 }}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel>Team</SectionLabel>
                  {job.assignedTo.length === 0
                    ? <div style={{ fontSize: 13, color: "#bbb" }}>No team assigned</div>
                    : job.assignedTo.map((w,i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div className="avatar" style={{ margin: 0 }}>{w.split(" ").map(p=>p[0]).join("")}</div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{w}</span>
                        <span style={{ fontSize: 11, color: "#bbb", marginLeft: "auto" }}>{jobTime.filter(t=>t.worker===w).reduce((s,t)=>s+t.hours,0)}h</span>
                      </div>
                    ))
                  }
                  {job.tags.length > 0 && <>
                    <SectionLabel>Tags</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{job.tags.map((t,i) => <span key={i} className="tag">{t}</span>)}</div>
                  </>}
                </div>
              </div>
            </div>
          )}

          {/* ── Quotes ── */}
          {tab === "quotes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
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
                    <div key={q.id} style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{q.number}</div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{q.createdAt}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <StatusBadge status={q.status} />
                          {q.status !== "accepted" && <button className="btn btn-secondary btn-xs" onClick={() => acceptQuote(q.id)}>Accept</button>}
                          {q.status === "accepted" && !alreadyInvoiced && (
                            <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => { quoteToInvoice(q); setTab("invoices"); }}>
                              <Icon name="invoices" size={11} />→ Invoice
                            </button>
                          )}
                          {alreadyInvoiced && <span style={{ fontSize: 11, color: "#aaa" }}>Invoiced ✓</span>}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingQuote(q); setInlineQuoteMode("view"); }}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delQuote(q.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} style={{ textAlign: "left", color: "#bbb", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4, borderBottom: "1px solid #f0f0f0" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {q.lineItems.map((l,i) => (
                            <tr key={i}>
                              <td style={{ padding: "5px 0", color: "#444" }}>{l.desc}</td>
                              <td style={{ color: "#666" }}>{l.qty}</td>
                              <td style={{ color: "#666" }}>{l.unit}</td>
                              <td style={{ color: "#666" }}>{fmt(l.rate)}</td>
                              <td style={{ fontWeight: 600 }}>{fmt(l.qty * l.rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 20, fontSize: 13 }}>
                        <span style={{ color: "#999" }}>Subtotal <strong style={{ color: "#111" }}>{fmt(sub)}</strong></span>
                        <span style={{ color: "#999" }}>GST <strong style={{ color: "#111" }}>{fmt(sub * q.tax / 100)}</strong></span>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>Total {fmt(calcQuoteTotal(q))}</span>
                      </div>
                      {q.notes && <div style={{ marginTop: 8, fontSize: 12, color: "#999", fontStyle: "italic", borderTop: "1px solid #f5f5f5", paddingTop: 8 }}>{q.notes}</div>}
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Invoices ── */}
          {tab === "invoices" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobInvoices.length > 0 && <span><strong style={{ color: "#111" }}>{fmt(totalPaid)}</strong> paid of <strong style={{ color: "#111" }}>{fmt(totalInvoiced)}</strong> invoiced</span>}
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
                    <div key={inv.id} style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{inv.number}</div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                            {inv.createdAt}
                            {fromQuote && <span style={{ marginLeft: 8, color: "#bbb" }}>from {fromQuote.number}</span>}
                            {inv.dueDate && <span style={{ marginLeft: 8 }}>· Due {inv.dueDate}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <StatusBadge status={inv.status} />
                          <XeroSyncBadge syncStatus={inv.xeroSyncStatus} xeroId={inv.xeroInvoiceId} />
                          {inv.status !== "paid" && inv.status !== "void" && (
                            <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => markInvPaid(inv.id)}>Mark Paid</button>
                          )}
                          {!inv.xeroInvoiceId && inv.status !== "draft" && (
                            <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} onClick={() => xeroSyncInvoice("push", inv.id)} title="Send to Xero"><Icon name="send" size={11} /> Xero</button>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingInvoice(inv); setInlineInvMode("view"); }}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delInvoice(inv.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} style={{ textAlign: "left", color: "#bbb", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4, borderBottom: "1px solid #f0f0f0" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {inv.lineItems.map((l,i) => (
                            <tr key={i}><td style={{ padding: "5px 0", color: "#444" }}>{l.desc}</td><td style={{ color: "#666" }}>{l.qty}</td><td style={{ color: "#666" }}>{l.unit}</td><td style={{ color: "#666" }}>{fmt(l.rate)}</td><td style={{ fontWeight: 600 }}>{fmt(l.qty*l.rate)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 20, fontSize: 13 }}>
                        <span style={{ color: "#999" }}>Subtotal <strong style={{ color: "#111" }}>{fmt(sub)}</strong></span>
                        <span style={{ color: "#999" }}>GST <strong style={{ color: "#111" }}>{fmt(sub * inv.tax / 100)}</strong></span>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>Total {fmt(calcQuoteTotal(inv))}</span>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {totalHours > 0 && <span><strong style={{ color: "#111" }}>{jobTime.filter(t=>t.billable).reduce((s,t)=>s+t.hours,0)}h</strong> billable · <strong style={{ color: "#111" }}>{totalHours}h</strong> total</span>}
                </div>
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.time.accent }} onClick={() => setShowTimeForm(v => !v)}><Icon name="plus" size={12} />Log Time</button>
              </div>
              {showTimeForm && (
                <div style={{ background: "#f8f8f8", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #e8e8e8" }}>
                  <div className="grid-3" style={{ marginBottom: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Worker</label>
                      <select className="form-control" value={timeForm.worker} onChange={e => setTimeForm(f => ({ ...f, worker: e.target.value }))}>
                        {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Date</label>
                      <input type="date" className="form-control" value={timeForm.date} onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Hours</label>
                      <div style={{ background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: 6, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: quickHours > 0 ? "#111" : "#ccc", textAlign: "center" }}>
                        {quickHours > 0 ? `${quickHours.toFixed(1)}h` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginBottom: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Start Time</label>
                      <input type="time" className="form-control" value={timeForm.startTime}
                        onChange={e => setTimeForm(f => ({ ...f, startTime: e.target.value, endTime: f.endTime || addMinsToTime(e.target.value, 60) }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">End Time</label>
                      <input type="time" className="form-control" value={timeForm.endTime}
                        onChange={e => setTimeForm(f => ({ ...f, endTime: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Description</label>
                    <input className="form-control" value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))} placeholder="Work description" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="checkbox-label"><input type="checkbox" checked={timeForm.billable} onChange={e => setTimeForm(f => ({ ...f, billable: e.target.checked }))} /><span>Billable</span></label>
                    <div style={{ display: "flex", gap: 8 }}>
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
                          <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div className="avatar" style={{ width: 26, height: 26, fontSize: 10, background: "#333", margin: 0 }}>{t.worker.split(" ").map(w=>w[0]).join("")}</div><span style={{ fontWeight: 600, fontSize: 13 }}>{t.worker}</span></div></td>
                          <td style={{ fontSize: 12, color: "#999" }}>{t.date}</td>
                          <td><span style={{ fontWeight: 700 }}>{t.hours}h</span></td>
                          <td><span className="badge" style={{ background: t.billable ? "#111" : "#f0f0f0", color: t.billable ? "#fff" : "#999" }}>{t.billable ? "Billable" : "Non-bill"}</span></td>
                          <td style={{ fontSize: 12, color: "#666" }}>{t.description}</td>
                          <td><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delTime(t.id)}><Icon name="trash" size={11} /></button></td>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobBills.length > 0 && (
                    <span>
                      <strong style={{ color: "#111" }}>{fmt(jobBills.filter(b=>b.status==="posted"||b.status==="approved").reduce((s,b)=>s+b.amount,0))}</strong> approved
                      {jobBills.filter(b=>b.status==="inbox"||b.status==="linked").length > 0 && (
                        <span> · <strong style={{ color: "#111" }}>{fmt(jobBills.filter(b=>b.status==="inbox"||b.status==="linked").reduce((s,b)=>s+b.amount,0))}</strong> pending</span>
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
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier || <span style={{ color: "#ccc" }}>—</span>}</div>
                              {b.description && <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>{b.description.slice(0,40)}{b.description.length>40?"…":""}</div>}
                            </td>
                            <td><span style={{ fontFamily: "monospace", fontSize: 12, color: "#666" }}>{b.invoiceNo || "—"}</span></td>
                            <td><span className="chip">{b.category}</span></td>
                            <td style={{ fontSize: 12, color: "#999" }}>{b.date}</td>
                            <td style={{ fontSize: 13 }}>{fmt(exGst)}</td>
                            <td style={{ fontWeight: 700 }}>{fmt(b.amount||0)}</td>
                            <td style={{ fontSize: 12 }}>
                              {(b.markup||0) > 0
                                ? <span style={{ color: "#555" }}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span>
                                : <span style={{ color: "#ddd" }}>—</span>}
                            </td>
                            <td><BillStatusBadge status={b.status} /> <XeroSyncBadge syncStatus={b.xeroSyncStatus} xeroId={b.xeroBillId} /></td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                {!b.xeroBillId && (b.status === "approved" || b.status === "posted") && (
                                  <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} title="Send to Xero" onClick={() => xeroSyncBill("push", b.id)}><Icon name="send" size={11} /></button>
                                )}
                                {b.status === "linked" && (
                                  <button className="btn btn-ghost btn-xs" style={{ color: "#1e7e34" }} title="Approve"
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
                                <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delBill(b.id)}><Icon name="trash" size={11} /></button>
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
              {jobSchedule.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No schedule entries</div></div>
                : jobSchedule.map(s => {
                  const schClient = clients.find(c => c.id === job.clientId);
                  const schSite = schClient?.sites?.find(st => st.id === job.siteId);
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", borderBottom: "1px solid #f5f5f5", paddingBottom: 14, marginBottom: 14 }}>
                      <div style={{ background: "#111", color: "#fff", borderRadius: 6, padding: "8px 12px", textAlign: "center", minWidth: 68, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{new Date(s.date+"T12:00:00").toLocaleString("en", { month: "short" })}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{new Date(s.date+"T12:00:00").getDate()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.date} · {new Date(s.date+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long"})}</div>
                        {schSite && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>📍 {schSite.name}</div>}
                        {schSite?.contactName && <div style={{ fontSize: 12, color: "#888" }}>👤 {schSite.contactName} {schSite.contactPhone && `· ${schSite.contactPhone}`}</div>}
                        {s.notes && <div style={{ fontSize: 12, color: "#999", fontStyle: "italic", marginTop: 4 }}>{s.notes}</div>}
                        {(s.assignedTo||[]).length > 0 && <div style={{ marginTop: 8 }}><AvatarGroup names={s.assignedTo} max={4} /></div>}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobWOs.length + jobPOs.length > 0
                    ? <span><strong style={{ color: "#111" }}>{jobWOs.length}</strong> WO{jobWOs.length !== 1 ? "s" : ""} · <strong style={{ color: "#111" }}>{jobPOs.length}</strong> PO{jobPOs.length !== 1 ? "s" : ""}</span>
                    : "No orders yet"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-primary btn-sm" style={{ background: "#2563eb" }} onClick={() => {
                    const newWo = { id: genId(), ref: "WO-" + String((workOrders || []).length + 1).padStart(3,"0"), status: "Draft", jobId: job.id, issueDate: orderToday(), dueDate: orderAddDays(14), poLimit: "", contractorId: "", contractorName: "", contractorContact: "", contractorEmail: "", contractorPhone: "", trade: "", scopeOfWork: "", notes: "", internalNotes: "", attachments: [], auditLog: [makeLogEntry("Created","Work order created")] };
                    setWorkOrders(prev => [...prev, newWo]);
                  }}><Icon name="plus" size={12} />New WO</button>
                  <button className="btn btn-primary btn-sm" style={{ background: "#16a34a" }} onClick={() => {
                    const newPo = { id: genId(), ref: "PO-" + String((purchaseOrders || []).length + 1).padStart(3,"0"), status: "Draft", jobId: job.id, issueDate: orderToday(), dueDate: orderAddDays(14), poLimit: "", supplierId: "", supplierName: "", supplierContact: "", supplierEmail: "", supplierAbn: "", deliveryAddress: "", lines: [{ id: genId(), desc: "", qty: 1, unit: "ea" }], notes: "", internalNotes: "", attachments: [], auditLog: [makeLogEntry("Created","Purchase order created")] };
                    setPurchaseOrders(prev => [...prev, newPo]);
                  }}><Icon name="plus" size={12} />New PO</button>
                </div>
              </div>
              {jobWOs.length + jobPOs.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: "#999", fontSize: 13 }}>No work orders or purchase orders linked to this job yet.</div>
                : <div className="order-cards-grid">
                    {[...jobWOs.map(o => ({ ...o, _type: "wo" })), ...jobPOs.map(o => ({ ...o, _type: "po" }))].sort((a,b) => b.id - a.id).map(o => (
                      <OrderCard key={o.id} type={o._type} order={o} jobs={jobs} onOpen={() => {}} onDelete={() => {
                        if (o._type === "wo") setWorkOrders(prev => prev.filter(x => x.id !== o.id));
                        else setPurchaseOrders(prev => prev.filter(x => x.id !== o.id));
                      }} />
                    ))}
                  </div>
              }
            </div>
          )}

          {tab === "pnl" && <JobPnL job={job} client={client} />}

          {/* ── Gantt Tab ── */}
          {tab === "gantt" && <JobGantt job={job} />}

          {/* ── Tasks Tab ── */}
          {tab === "tasks" && <JobTasks job={job} />}

          {tab === "notes" && (
            <div>
              {/* Toolbar */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <select value={noteFilter} onChange={e => setNoteFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", background: "#fff" }}>
                  <option value="all">All Categories</option>
                  {NOTE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div style={{ flex: 1 }} />
                <div style={{ position: "relative" }}>
                  <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} onClick={() => setShowFormMenu(m => !m)}>
                    📋 New Form ▾
                  </button>
                  {showFormMenu && (
                    <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 20, minWidth: 180, overflow: "hidden" }}>
                      {FORM_TEMPLATES.map(tmpl => (
                        <button key={tmpl.id} style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "none", textAlign: "left", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                          onMouseEnter={e => e.target.style.background = "#f8fafc"}
                          onMouseLeave={e => e.target.style.background = "none"}
                          onClick={() => { setShowFormMenu(false); setShowFormFiller(tmpl); }}>
                          {tmpl.icon} {tmpl.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-sm" style={{ background: "#059669", color: "#fff", border: "none" }} onClick={() => setShowPlanDrawing(true)}>
                  📐 Draw Plan
                </button>
                <button className="btn btn-sm" style={{ background: "#7c3aed", color: "#fff", border: "none" }} onClick={() => pdfInputRef.current?.click()}>
                  📄 Fill PDF
                </button>
                <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handlePdfFileSelect} />
                <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => setShowNoteForm(true)}>
                  + Add Note
                </button>
              </div>

              {/* New note form */}
              {showNoteForm && (
                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16 }}>
                  <textarea value={noteForm.text} onChange={e => setNoteForm(prev => ({ ...prev, text: e.target.value }))} placeholder="Write a note…" rows={3} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                  {/* Category pills */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {NOTE_CATEGORIES.map(c => (
                      <button key={c.id} onClick={() => setNoteForm(prev => ({ ...prev, category: c.id }))} style={{ padding: "4px 12px", borderRadius: 20, border: noteForm.category === c.id ? `2px solid ${c.color}` : "1px solid #e2e8f0", background: noteForm.category === c.id ? c.color + "18" : "#fff", color: noteForm.category === c.id ? c.color : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.label}</button>
                    ))}
                  </div>
                  {/* File attachments */}
                  <div style={{ marginTop: 12 }}>
                    {noteForm.attachments.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        {noteForm.attachments.map(f => (
                          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
                            {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                            <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155" }}>{f.name}</span>
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>{fmtFileSize(f.size)}</span>
                            {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => setMarkupImg({ src: f.dataUrl, target: "new", attachmentId: f.id })} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", lineHeight: 1, fontSize: 11 }} title="Mark up">✏️</button>}
                            <button onClick={() => setNoteForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} style={{ padding: 2, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "2px dashed #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
                      <OrderIcon name="upload" size={14} />
                      Attach photos / files
                      <input type="file" multiple style={{ display: "none" }} onChange={handleNoteFiles} accept="*/*" />
                    </label>
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowNoteForm(false); setNoteForm({ text: "", category: "general", attachments: [] }); }}>Cancel</button>
                    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={addNote} disabled={!noteForm.text.trim() && noteForm.attachments.length === 0}>Save Note</button>
                  </div>
                </div>
              )}

              {/* Notes list */}
              {(() => {
                const filtered = [...jobNotes].filter(n => noteFilter === "all" || n.category === noteFilter).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                if (filtered.length === 0) return (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{jobNotes.length === 0 ? "No notes yet" : "No notes match this filter"}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ Add Note" to get started</div>
                  </div>
                );
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {filtered.map(note => {
                      const cat = NOTE_CATEGORIES.find(c => c.id === note.category) || NOTE_CATEGORIES[0];
                      const isEditing = editingNoteId === note.id;
                      if (isEditing) {
                        const eCat = NOTE_CATEGORIES.find(c => c.id === editNoteForm.category) || NOTE_CATEGORIES[0];
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#f8fafc", borderRadius: 10, border: `2px solid ${eCat.color}`, borderLeft: `3px solid ${eCat.color}` }}>
                            <textarea value={editNoteForm.text} onChange={e => setEditNoteForm(prev => ({ ...prev, text: e.target.value }))} rows={3} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                              {NOTE_CATEGORIES.map(c => (
                                <button key={c.id} onClick={() => setEditNoteForm(prev => ({ ...prev, category: c.id }))} style={{ padding: "4px 12px", borderRadius: 20, border: editNoteForm.category === c.id ? `2px solid ${c.color}` : "1px solid #e2e8f0", background: editNoteForm.category === c.id ? c.color + "18" : "#fff", color: editNoteForm.category === c.id ? c.color : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.label}</button>
                              ))}
                            </div>
                            <div style={{ marginTop: 12 }}>
                              {editNoteForm.attachments.length > 0 && (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                                  {editNoteForm.attachments.map(f => (
                                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
                                      {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                                      <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155" }}>{f.name}</span>
                                      {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => setMarkupImg({ src: f.dataUrl, target: "edit", attachmentId: f.id })} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", lineHeight: 1, fontSize: 11 }} title="Mark up">✏️</button>}
                                      <button onClick={() => setEditNoteForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} style={{ padding: 2, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "2px dashed #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
                                <OrderIcon name="upload" size={14} />
                                Attach photos / files
                                <input type="file" multiple style={{ display: "none" }} onChange={handleEditNoteFiles} accept="*/*" />
                              </label>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                              <button className="btn btn-ghost btn-sm" onClick={cancelEditNote}>Cancel</button>
                              <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={saveEditNote} disabled={!editNoteForm.text.trim() && editNoteForm.attachments.length === 0}>Save</button>
                            </div>
                          </div>
                        );
                      }
                      // ── PDF note card ──
                      if (note.pdfNote) {
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: "3px solid #7c3aed" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {note.pdfThumbnail && <img src={note.pdfThumbnail} alt="PDF" style={{ width: 48, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid #e2e8f0" }} />}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <span style={{ padding: "2px 10px", borderRadius: 20, background: "#7c3aed18", color: "#7c3aed", fontSize: 11, fontWeight: 700 }}>PDF</span>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.attachments?.[0]?.name || "Filled PDF"}</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()} · {note.createdBy}</div>
                              </div>
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); reopenPdfNote(note); }} style={{ fontSize: 11 }}>✏️ Edit</button>
                              {note.attachments?.[0]?.dataUrl && (
                                <a href={note.attachments[0].dataUrl} download={note.attachments[0].name} onClick={e => e.stopPropagation()} style={{ padding: "4px 10px", borderRadius: 6, background: "#f1f5f9", border: "none", color: "#3b82f6", fontSize: 11, fontWeight: 600, textDecoration: "none", cursor: "pointer" }}>⬇ Download</a>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete">🗑</button>
                            </div>
                          </div>
                        );
                      }
                      // ── Form note card ──
                      if (note.category === "form" && note.formType) {
                        const tmpl = FORM_TEMPLATES.find(t => t.id === note.formType);
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: `3px solid ${cat.color}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 16 }}>{tmpl?.icon || "📋"}</span>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{tmpl?.name || note.formType}</span>
                              <span style={{ padding: "2px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 11, fontWeight: 700 }}>Form</span>
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()}</span>
                              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{note.createdBy}</span>
                              <div style={{ flex: 1 }} />
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); setViewingForm(note); }} style={{ fontSize: 11 }}>👁 View</button>
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); printFormPdf(note, tmpl); }} style={{ fontSize: 11 }}>🖨️ PDF</button>
                              <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete">🗑</button>
                            </div>
                            {note.text && <div style={{ fontSize: 12, color: "#666" }}>{note.text}</div>}
                          </div>
                        );
                      }
                      // ── Regular note card ──
                      return (
                        <div key={note.id} onClick={() => startEditNote(note)} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: `3px solid ${cat.color}`, cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ padding: "2px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 11, fontWeight: 700 }}>{cat.label}</span>
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()}</span>
                            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{note.createdBy}</span>
                            <div style={{ flex: 1 }} />
                            <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete note">🗑</button>
                          </div>
                          {note.text && <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{note.text}</div>}
                          {note.attachments && note.attachments.length > 0 && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                              {note.attachments.map(att => (
                                att.type && att.type.startsWith("image/") && att.dataUrl ? (
                                  <div key={att.id} style={{ position: "relative", display: "inline-block" }} onClick={e => e.stopPropagation()}>
                                    <img src={att.dataUrl} alt={att.name} onClick={() => setLightboxImg(att.dataUrl)} style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #e2e8f0", cursor: "pointer" }} />
                                    <button onClick={() => setMarkupImg({ src: att.dataUrl, noteId: note.id, attachmentId: att.id })}
                                      style={{ position: "absolute", bottom: 2, right: 2, width: 20, height: 20, borderRadius: 4, background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                                      title="Mark up photo">✏️</button>
                                  </div>
                                ) : (
                                  <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}>
                                    <FileIconBadge name={att.name} />
                                    <span style={{ color: "#334155", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                                  </div>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {tab === "activity" && (
            <div>
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#888" }}>{(job.activityLog||[]).length} event{(job.activityLog||[]).length !== 1 ? "s" : ""} recorded</div>
              </div>
              <ActivityLog entries={job.activityLog || []} />
            </div>
          )}

        </div>
        )}
    </SectionDrawer>

    {/* ── Image Lightbox ────────────────────────────────────────────── */}
    {lightboxImg && (
      <div onClick={() => setLightboxImg(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <img src={lightboxImg} alt="Attachment" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} />
        <button onClick={(e) => { e.stopPropagation(); setMarkupImg({ src: lightboxImg, target: "new" }); setLightboxImg(null); }}
          style={{ position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 8, background: "#0891b2", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
    )}

    {/* ── Photo Markup Editor ──────────────────────────────────────── */}
    {markupImg && (
      <PhotoMarkupEditor
        imageSrc={markupImg.src}
        onSave={saveMarkup}
        onClose={() => setMarkupImg(null)}
      />
    )}

    {/* ── Plan Drawing Editor ────────────────────────────────────────── */}
    {showPlanDrawing && (
      <PlanDrawingEditor
        onSave={savePlan}
        onClose={() => setShowPlanDrawing(false)}
      />
    )}

    {/* ── PDF Form Filler ────────────────────────────────────────────── */}
    {showPdfFiller && (
      <PdfFormFiller
        pdfData={showPdfFiller.pdfData}
        fileName={showPdfFiller.fileName}
        existingFields={showPdfFiller.existingFields}
        onSave={handlePdfSave}
        onClose={() => setShowPdfFiller(null)}
      />
    )}

    {/* ── Form Filler Modal ──────────────────────────────────────────── */}
    {showFormFiller && (() => {
      const tmpl = showFormFiller;
      const client = clients.find(c => c.id === job.clientId);
      const site = client?.sites?.find(s => s.id === job.siteId);
      return <FormFillerModal template={tmpl} job={job} client={client} site={site}
        onSave={(formData, andPrint) => {
          const note = { id: Date.now(), text: `${tmpl.name} completed`, category: "form", formType: tmpl.id, formData, attachments: [], createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
          setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Completed ${tmpl.name} form`) } : j));
          setShowFormFiller(null);
          if (andPrint) printFormPdf(note, tmpl);
        }}
        onClose={() => setShowFormFiller(null)}
      />;
    })()}

    {/* ── Form Viewer Modal ──────────────────────────────────────────── */}
    {viewingForm && (() => {
      const tmpl = FORM_TEMPLATES.find(t => t.id === viewingForm.formType);
      const data = viewingForm.formData || {};
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setViewingForm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>{tmpl?.icon}</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{tmpl?.name || "Form"}</h3>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => { printFormPdf(viewingForm, tmpl); }}>🖨️ Print PDF</button>
              <button onClick={() => setViewingForm(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>✕</button>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 16 }}>Completed {new Date(viewingForm.createdAt).toLocaleString()} by {viewingForm.createdBy}</div>
            {(tmpl?.fields || []).map(field => {
              const val = data[field.key];
              return (
                <div key={field.key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{field.label}</div>
                  {field.type === "checklist" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(field.options || []).map((opt, i) => (
                        <div key={i} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ color: (val || []).includes(opt) ? "#059669" : "#dc2626", fontWeight: 700 }}>{(val || []).includes(opt) ? "✓" : "✗"}</span>
                          <span style={{ color: (val || []).includes(opt) ? "#333" : "#999" }}>{opt}</span>
                        </div>
                      ))}
                    </div>
                  ) : field.type === "signature" ? (
                    val ? <img src={val} alt="Signature" style={{ maxWidth: 300, height: 80, border: "1px solid #e2e8f0", borderRadius: 6 }} /> : <span style={{ fontSize: 13, color: "#999" }}>No signature</span>
                  ) : (
                    <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{val || "—"}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}

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
          <div style={{ padding: "8px 20px", background: SECTION_COLORS.quotes.light, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
            {["draft","sent","accepted","declined"].filter(s => s !== editingQuote.status).map(s => (
              <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8 }}
                onClick={() => setEditingQuote(q => ({ ...q, status: s }))}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineQuoteMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingQuote(null)}>Close</button>
          <button className="btn btn-sm" style={{ background: qAccent, color: "#fff", border: "none" }} onClick={() => setInlineQuoteMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineQuoteMode("view")}>Cancel</button>
          <button className="btn btn-sm" style={{ background: qAccent, color: "#fff", border: "none" }} onClick={() => saveQuote(editingQuote)}>
            <Icon name="check" size={13} /> Save Quote
          </button>
        </>}
        onClose={() => setEditingQuote(null)}
        zIndex={1060}
      >
        {inlineQuoteMode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <ViewField label="Status" value={editingQuote.status?.charAt(0).toUpperCase() + editingQuote.status?.slice(1)} />
            <ViewField label="GST" value={`${editingQuote.tax}%`} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Line Items</div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Description</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Qty</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Unit</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Amount</th>
              </tr></thead>
              <tbody>
                {(editingQuote.lineItems||[]).map((li, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 8px', fontWeight: 500 }}>{li.desc || '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{li.qty}</td>
                    <td style={{ padding: '8px 8px' }}>{li.unit}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{fmt(li.rate)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(li.qty * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(qSub)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>GST ({editingQuote.tax}%)</span><span style={{ fontWeight: 600 }}>{fmt(qGst)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e5e7eb', fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: qAccent }}>{fmt(qTotal)}</span></div>
          </div>
          {editingQuote.notes && <ViewField label="Notes / Terms" value={editingQuote.notes} />}
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={editingQuote.status}
                onChange={e => setEditingQuote(q => ({ ...q, status: e.target.value }))}>
                {["draft","sent","accepted","declined"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
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
          <div style={{ marginTop: 12, padding: "12px 16px", background: "#f8f8f8", borderRadius: 8, display: "flex", justifyContent: "flex-end", gap: 16 }}>
            <span style={{ fontSize: 12, color: "#888" }}>Subtotal <strong>{fmt(qSub)}</strong></span>
            <span style={{ fontSize: 12, color: "#888" }}>GST <strong>{fmt(qGst)}</strong></span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total {fmt(qTotal)}</span>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
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
          <div style={{ padding: "8px 20px", background: SECTION_COLORS.invoices.light, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
            {["draft","sent","paid","overdue","void"].filter(s => s !== editingInvoice.status).map(s => (
              <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8 }}
                onClick={() => setEditingInvoice(i => ({ ...i, status: s }))}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineInvMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingInvoice(null)}>Close</button>
          <button className="btn btn-sm" style={{ background: iAccent, color: "#fff", border: "none" }} onClick={() => setInlineInvMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineInvMode("view")}>Cancel</button>
          <button className="btn btn-sm" style={{ background: iAccent, color: "#fff", border: "none" }} onClick={() => saveInvoice(editingInvoice)}>
            <Icon name="check" size={13} /> Save Invoice
          </button>
        </>}
        onClose={() => setEditingInvoice(null)}
        zIndex={1060}
      >
        {inlineInvMode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <ViewField label="Status" value={editingInvoice.status?.charAt(0).toUpperCase() + editingInvoice.status?.slice(1)} />
            <ViewField label="Due Date" value={editingInvoice.dueDate || "—"} />
            <ViewField label="GST" value={`${editingInvoice.tax}%`} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Line Items</div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Description</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Qty</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Unit</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Amount</th>
              </tr></thead>
              <tbody>
                {(editingInvoice.lineItems||[]).map((li, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 8px', fontWeight: 500 }}>{li.desc || '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{li.qty}</td>
                    <td style={{ padding: '8px 8px' }}>{li.unit}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{fmt(li.rate)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(li.qty * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(iSub)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>GST ({editingInvoice.tax}%)</span><span style={{ fontWeight: 600 }}>{fmt(iGst)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e5e7eb', fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: iAccent }}>{fmt(iTotal)}</span></div>
          </div>
          {editingInvoice.notes && <ViewField label="Notes" value={editingInvoice.notes} />}
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={editingInvoice.status}
                onChange={e => setEditingInvoice(i => ({ ...i, status: e.target.value }))}>
                {["draft","sent","paid","overdue","void"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
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
          <div style={{ marginTop: 12, padding: "12px 16px", background: "#f8f8f8", borderRadius: 8, display: "flex", justifyContent: "flex-end", gap: 16 }}>
            <span style={{ fontSize: 12, color: "#888" }}>Subtotal <strong>{fmt(iSub)}</strong></span>
            <span style={{ fontSize: 12, color: "#888" }}>GST <strong>{fmt(iGst)}</strong></span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total {fmt(iTotal)}</span>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
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
