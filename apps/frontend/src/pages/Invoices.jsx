import { useState, memo } from "react";
import { useAppStore } from '../lib/store';
import { createInvoice, updateInvoice, deleteInvoice } from '../lib/db';
import { sendEmail, xeroSyncInvoice } from '../lib/supabase';
import { buildInvoicePdfHtml, htmlToPdfBase64 } from '../lib/pdf';
import { fmt, calcQuoteTotal } from '../utils/helpers';
import { SECTION_COLORS, ViewField } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import {
  StatusBadge, XeroSyncBadge, SectionProgressBar, SectionDrawer, LineItemsEditor,
} from '../components/shared';

const INV_STATUSES = ["all", "draft", "sent", "paid", "overdue", "void"];

const Invoices = () => {
  const { invoices, setInvoices, jobs, clients, quotes, templates, companyInfo } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [invMode, setInvMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [view, setView] = useState("list");
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  const handleSendInvoiceEmail = async (inv) => {
    const job = jobs.find(j => j.id === inv.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    if (!client?.email) { alert("No client email address found. Please add an email to the client record."); return; }
    if (!window.confirm(`Send invoice ${inv.number} to ${client.name} (${client.email})?`)) return;
    setEmailSending(true); setEmailStatus(null);
    try {
      const tpl = templates.find(t => t.type === "invoice" && t.isDefault) || templates.find(t => t.type === "invoice");
      const pdfHtml = buildInvoicePdfHtml({ invoice: inv, job, client, company: companyInfo, template: tpl });
      let pdfBase64;
      try { pdfBase64 = await htmlToPdfBase64(pdfHtml, `${inv.number}.pdf`); } catch (e) { console.warn("PDF generation failed:", e); }
      const attachments = pdfBase64 ? [{ filename: `${inv.number}.pdf`, content: pdfBase64 }] : [];
      await sendEmail("invoice", client.email, { ...inv, clientName: client.name, jobTitle: job?.title }, { attachments });
      setEmailStatus({ type: "success", msg: `Invoice sent to ${client.email}` });
      setTimeout(() => setEmailStatus(null), 4000);
    } catch (err) {
      setEmailStatus({ type: "error", msg: err.message || "Failed to send email" });
    } finally { setEmailSending(false); }
  };

  const handleSendPaymentReminder = async (inv) => {
    const job = jobs.find(j => j.id === inv.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    if (!client?.email) { alert("No client email address found."); return; }
    const dueDate = inv.dueDate;
    const daysOverdue = dueDate ? Math.ceil((new Date() - new Date(dueDate + "T00:00:00")) / 86400000) : 0;
    const total = inv.lineItems.reduce((s, l) => s + l.qty * l.rate, 0) * (1 + (inv.tax || 0) / 100);
    if (!window.confirm(`Send payment reminder for ${inv.number} to ${client.name}? (${daysOverdue} days overdue)`)) return;
    setEmailSending(true); setEmailStatus(null);
    try {
      await sendEmail("payment_reminder", client.email, { clientName: client.name, invoiceRef: inv.number, amount: total, dueDate, daysOverdue });
      setEmailStatus({ type: "success", msg: `Payment reminder sent to ${client.email}` });
      setTimeout(() => setEmailStatus(null), 4000);
    } catch (err) {
      setEmailStatus({ type: "error", msg: err.message || "Failed to send reminder" });
    } finally { setEmailSending(false); }
  };

  const openNew = () => { setEditInvoice(null); setInvMode("edit"); setForm({ jobId: jobs[0]?.id || "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" }); setShowModal(true); };
  const openEdit = (inv) => { setEditInvoice(inv); setInvMode("view"); setForm(inv); setShowModal(true); };
  const fromQuote = (q) => {
    setEditInvoice(null);
    setForm({ jobId: q.jobId, status: "draft", lineItems: [...q.lineItems], tax: q.tax, dueDate: "", notes: q.notes });
    setShowModal(true);
  };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editInvoice) {
        const saved = await updateInvoice(editInvoice.id, data);
        setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
        setEditInvoice(saved);
        setForm(saved);
        setInvMode("view");
        // Auto-sync to Xero when invoice status changes to "sent"
        if (data.status === "sent" && editInvoice.status !== "sent") {
          xeroSyncInvoice("push", editInvoice.id).catch(() => {});
        }
      } else {
        const saved = await createInvoice(data);
        setInvoices(is => [...is, saved]);
        setShowModal(false);
      }
    } catch (err) { console.error('Failed to save invoice:', err); }
  };
  const del = async (id) => {
    try {
      await deleteInvoice(id);
      setInvoices(is => is.filter(i => i.id !== id));
    } catch (err) { console.error('Failed to delete invoice:', err); }
  };
  const markPaid = async (id) => {
    const inv = invoices.find(i => i.id === id);
    try {
      const saved = await updateInvoice(id, { ...inv, status: "paid" });
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      // Auto-sync to Xero if connected and invoice is synced
      if (saved.xeroInvoiceId) {
        xeroSyncInvoice("push", id).catch(() => {});
      }
    } catch (err) { console.error('Failed to mark invoice paid:', err); }
  };

  const filtered = invoices.filter(inv => {
    const job = jobs.find(j => j.id === inv.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    const q = search.toLowerCase();
    const matchSearch = !search ||
      (inv.number || "").toLowerCase().includes(q) ||
      (job?.title || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (inv.notes || "").toLowerCase().includes(q) ||
      (inv.items || []).some(i => (i.description || "").toLowerCase().includes(q)) ||
      (inv.dueDate || "").includes(q) ||
      String(inv.total || "").includes(q);
    const matchStatus = filterStatus === "all" || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const invStatusColors = { draft: "#888", sent: "#2563eb", paid: "#16a34a", overdue: "#dc2626", void: "#555" };
  const invStatusLabels = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", void: "Void" };

  return (
    <div>
      {/* -- Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        {Object.entries(invStatusLabels).map(([key, label]) => {
          const statusInvs = invoices.filter(i => i.status === key);
          const count = statusInvs.length;
          const total = statusInvs.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
          const color = invStatusColors[key];
          return (
            <div key={key} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}`, cursor: "pointer" }}
              onClick={() => { setFilterStatus(key); setView("list"); }}>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{count}</div>
              <div className="stat-sub">{fmt(total)}</div>
            </div>
          );
        })}
      </div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices, jobs, clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {INV_STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        {quotes.filter(q => q.status === "accepted").length > 0 && (
          <select className="form-control" style={{ width: "auto" }} onChange={e => { const q = quotes.find(q => String(q.id) === e.target.value); if (q) fromQuote(q); e.target.value = ""; }}>
            <option value="">From Quote...</option>
            {quotes.filter(q => q.status === "accepted").map(q => <option key={q.id} value={q.id}>{q.number}</option>)}
          </select>
        )}
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: SECTION_COLORS.invoices.accent }} onClick={openNew}><Icon name="plus" size={14} />New Invoice</button></div>
      </div>

      {view === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(5, minmax(200px,1fr))" }}>
          {["draft", "sent", "paid", "overdue", "void"].map(col => {
            const colInvoices = filtered.filter(i => i.status === col);
            const labels = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", void: "Void" };
            const colTotal = colInvoices.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colInvoices.length}</span>
                </div>
                {colTotal > 0 && <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 600 }}>{fmt(colTotal)}</div>}
                {colInvoices.map(inv => {
                  const job = jobs.find(j => j.id === inv.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  const total = calcQuoteTotal(inv);
                  return (
                    <div key={inv.id} className="kanban-card" onClick={() => openEdit(inv)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>{inv.number}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{job?.title || "\u2014"}</div>
                      <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{client?.name || "\u2014"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(total)}</span>
                        <span style={{ fontSize: 10, color: inv.dueDate ? "#111" : "#ccc" }}>{inv.dueDate || "No due"}</span>
                      </div>
                      {inv.status !== "paid" && inv.status !== "void" && (
                        <div style={{ display: "flex", gap: 4, marginTop: 8, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#2a7" }} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {view === "grid" && (
        <div className="order-cards-grid">
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices found</div></div>}
          {filtered.map(inv => {
            const job = jobs.find(j => j.id === inv.jobId);
            const client = clients.find(c => c.id === job?.clientId);
            const total = calcQuoteTotal(inv);
            const lineCount = inv.lineItems.length;
            const fromQuoteRef = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
            return (
              <div key={inv.id} className="order-card" onClick={() => openEdit(inv)}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: SECTION_COLORS.invoices.light, color: SECTION_COLORS.invoices.accent }}>
                      <Icon name="invoices" size={15} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace" }}>{inv.number}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{inv.createdAt || "\u2014"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job?.title || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>No job</span>}
                </div>
                {client && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{client.name}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{fmt(total)}</span>
                  <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{lineCount} item{lineCount !== 1 ? "s" : ""}</span>
                  {fromQuoteRef && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>from {fromQuoteRef.number}</span>}
                </div>
                <SectionProgressBar status={inv.status} section="invoices" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: inv.dueDate ? "#334155" : "#ccc" }}>{inv.dueDate ? `Due ${inv.dueDate}` : "No due date"}</span>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    {inv.status !== "paid" && inv.status !== "void" && <button className="btn btn-ghost btn-xs" style={{ color: "#2a7" }} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>}
                    <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(inv.id)}><Icon name="trash" size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Job</th><th>Client</th><th>Status</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Due Date</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9}><div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices found</div></div></td></tr>}
              {filtered.map(inv => {
                const job = jobs.find(j => j.id === inv.jobId);
                const client = clients.find(c => c.id === job?.clientId);
                const sub = inv.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
                const fromQuoteRef = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
                return (
                  <tr key={inv.id} style={{ cursor: "pointer" }} onClick={() => openEdit(inv)}>
                    <td><span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{inv.number}</span>{fromQuoteRef && <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>from {fromQuoteRef.number}</div>}</td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{job?.title}</td>
                    <td style={{ fontSize: 13, color: "#666" }}>{client?.name}</td>
                    <td><StatusBadge status={inv.status} /> <XeroSyncBadge syncStatus={inv.xeroSyncStatus} xeroId={inv.xeroInvoiceId} /></td>
                    <td>{fmt(sub)}</td>
                    <td>{fmt(sub * inv.tax / 100)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(sub * (1 + inv.tax / 100))}</td>
                    <td style={{ fontSize: 12, color: inv.dueDate ? "#111" : "#ccc" }}>{inv.dueDate || "\u2014"}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {inv.status !== "paid" && inv.status !== "void" && <button className="btn btn-ghost btn-xs" style={{ color: "#2a7" }} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>}
                        {!inv.xeroInvoiceId && inv.status !== "draft" && <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} onClick={() => xeroSyncInvoice("push", inv.id)} title="Send to Xero"><Icon name="send" size={12} /></button>}
                        <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(inv.id)}><Icon name="trash" size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {showModal && (() => {
        const isNewInv = !editInvoice;
        const iJob = jobs.find(j => j.id === form.jobId);
        const iClient = clients.find(c => c.id === iJob?.clientId);
        const iSub = form.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
        const iTax = iSub * (form.tax || 0) / 100;
        const iTotal = iSub + iTax;
        const accent = SECTION_COLORS.invoices.accent;
        return (
        <SectionDrawer
          accent={accent}
          icon={<Icon name="invoices" size={16} />}
          typeLabel="Invoice"
          title={editInvoice ? editInvoice.number : "New Invoice"}
          statusBadge={editInvoice ? <StatusBadge status={editInvoice.status} /> : null}
          mode={invMode} setMode={setInvMode}
          showToggle={!isNewInv}
          isNew={isNewInv}
          footer={invMode === "view" && !isNewInv ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <div style={{ display: "flex", gap: 6 }}>
              {(form.status === "sent" || form.status === "overdue") && <button className="btn btn-sm" style={{ background: "#dc2626", color: "#fff", border: "none" }} disabled={emailSending} onClick={() => handleSendPaymentReminder(form)}>
                <Icon name="notification" size={13} /> {emailSending ? "Sending..." : "Payment Reminder"}
              </button>}
              <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} disabled={emailSending} onClick={() => handleSendInvoiceEmail(form)}>
                <Icon name="send" size={13} /> {emailSending ? "Sending..." : "Send to Client"}
              </button>
              <button className="btn btn-sm" style={{ background: accent, color: "#fff", border: "none" }} onClick={() => setInvMode("edit")}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => { if (isNewInv) setShowModal(false); else { setForm(editInvoice); setInvMode("view"); } }}>Cancel</button>
            <button className="btn btn-sm" style={{ background: accent, color: "#fff", border: "none" }} onClick={save}>
              <Icon name="check" size={13} /> {isNewInv ? "Create Invoice" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {invMode === "view" && !isNewInv ? (
          <div style={{ padding: "20px 24px" }}>
            {emailStatus && <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, background: emailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: emailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${emailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{emailStatus.msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <ViewField label="Job" value={iJob?.title} />
              <ViewField label="Client" value={iClient?.name} />
              <ViewField label="Status" value={form.status?.charAt(0).toUpperCase() + form.status?.slice(1)} />
              <ViewField label="Due Date" value={form.dueDate || "\u2014"} />
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
                  {form.lineItems.map((li, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 8px', fontWeight: 500 }}>{li.desc || '\u2014'}</td>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>GST ({form.tax}%)</span><span style={{ fontWeight: 600 }}>{fmt(iTax)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e5e7eb', fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: accent }}>{fmt(iTotal)}</span></div>
            </div>
            {form.notes && <ViewField label="Notes" value={form.notes} />}
          </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="grid-3" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Job</label>
                <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {["draft","sent","paid","overdue","void"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Due Date</label><input type="date" className="form-control" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
            <div className="form-group">
              <label className="form-label">Line Items</label>
              <LineItemsEditor items={form.lineItems} onChange={items => setForm(f => ({ ...f, lineItems: items }))} />
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment instructions, bank details, thank you note..." /></div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}
    </div>
  );
};

export default memo(Invoices);
