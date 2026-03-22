import { useState, memo } from "react";
import { useAppStore } from '../lib/store';
import { createQuote, updateQuote, deleteQuote } from '../lib/db';
import { sendEmail } from '../lib/supabase';
import { buildQuotePdfHtml, htmlToPdfBase64 } from '../lib/pdf';
import { fmt, calcQuoteTotal } from '../utils/helpers';
import { SECTION_COLORS, ViewField } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import {
  StatusBadge, SectionDrawer, LineItemsEditor, SectionProgressBar,
} from '../components/shared';

const QUOTE_STATUSES = ["all", "draft", "sent", "accepted", "declined"];

const Quotes = () => {
  const { quotes, setQuotes, jobs, clients, invoices, templates, companyInfo } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editQuote, setEditQuote] = useState(null);
  const [quoteMode, setQuoteMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [view, setView] = useState("list");
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  const filtered = quotes.filter(q => {
    const job = jobs.find(j => j.id === q.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    const query = search.toLowerCase();
    const matchSearch = !search ||
      (q.number || "").toLowerCase().includes(query) ||
      (job?.title || "").toLowerCase().includes(query) ||
      (client?.name || "").toLowerCase().includes(query) ||
      (q.notes || "").toLowerCase().includes(query) ||
      (q.items || []).some(i => (i.description || "").toLowerCase().includes(query)) ||
      String(q.total || "").includes(query);
    const matchStatus = filterStatus === "all" || q.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleSendQuoteEmail = async (q) => {
    const job = jobs.find(j => j.id === q.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    if (!client?.email) { alert("No client email address found. Please add an email to the client record."); return; }
    if (!window.confirm(`Send quote ${q.number} to ${client.name} (${client.email})?`)) return;
    setEmailSending(true); setEmailStatus(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const acceptUrl = q.acceptToken ? `${supabaseUrl}/functions/v1/accept-document?token=${q.acceptToken}&type=quote` : undefined;
      const tpl = templates.find(t => t.type === "quote" && t.isDefault) || templates.find(t => t.type === "quote");
      // Generate PDF
      const pdfHtml = buildQuotePdfHtml({ quote: q, job, client, company: companyInfo, template: tpl, acceptUrl });
      let pdfBase64;
      try { pdfBase64 = await htmlToPdfBase64(pdfHtml, `${q.number}.pdf`); } catch (e) { console.warn("PDF generation failed:", e); }
      const attachments = pdfBase64 ? [{ filename: `${q.number}.pdf`, content: pdfBase64 }] : [];
      await sendEmail("quote", client.email, { ...q, clientName: client.name, jobTitle: job?.title, jobReference: job?.title, acceptUrl }, { attachments });
      setEmailStatus({ type: "success", msg: `Quote sent to ${client.email}` });
      setTimeout(() => setEmailStatus(null), 4000);
    } catch (err) {
      setEmailStatus({ type: "error", msg: err.message || "Failed to send email" });
    } finally { setEmailSending(false); }
  };

  const openNew = () => { setEditQuote(null); setQuoteMode("edit"); setForm({ jobId: jobs[0]?.id || "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" }); setShowModal(true); };
  const openEdit = (q) => { setEditQuote(q); setQuoteMode("view"); setForm(q); setShowModal(true); };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editQuote) {
        const saved = await updateQuote(editQuote.id, data);
        setQuotes(qs => qs.map(q => q.id === saved.id ? saved : q));
      } else {
        const saved = await createQuote(data);
        setQuotes(qs => [...qs, saved]);
      }
    } catch (err) { console.error('Failed to save quote:', err); }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteQuote(id);
      setQuotes(qs => qs.filter(q => q.id !== id));
    } catch (err) { console.error('Failed to delete quote:', err); }
  };
  const duplicate = async (q) => {
    try {
      const saved = await createQuote({ ...q, status: "draft" });
      setQuotes(qs => [...qs, saved]);
    } catch (err) { console.error('Failed to duplicate quote:', err); }
  };

  const quoteStatusColors = { draft: "#888", sent: "#2563eb", accepted: "#16a34a", declined: "#dc2626" };
  const quoteStatusLabels = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
        {Object.entries(quoteStatusLabels).map(([key, label]) => {
          const statusQuotes = quotes.filter(q => q.status === key);
          const count = statusQuotes.length;
          const total = statusQuotes.reduce((s, q) => s + calcQuoteTotal(q), 0);
          const color = quoteStatusColors[key];
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
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotes, jobs, clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: SECTION_COLORS.quotes.accent }} onClick={openNew}><Icon name="plus" size={14} />New Quote</button></div>
      </div>

      {view === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(4, minmax(200px,1fr))" }}>
          {["draft", "sent", "accepted", "declined"].map(col => {
            const colQuotes = filtered.filter(q => q.status === col);
            const labels = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colQuotes.length}</span>
                </div>
                {colQuotes.map(q => {
                  const job = jobs.find(j => j.id === q.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
                  return (
                    <div key={q.id} className="kanban-card" onClick={() => openEdit(q)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>{q.number}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{job?.title || "\u2014"}</div>
                      <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{client?.name || "\u2014"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(sub * (1 + q.tax / 100))}</span>
                        <span style={{ fontSize: 10, color: "#bbb" }}>{q.createdAt}</span>
                      </div>
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
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">{"\ud83d\udccb"}</div><div className="empty-state-text">No quotes found</div></div>}
          {filtered.map(q => {
            const job = jobs.find(j => j.id === q.jobId);
            const client = clients.find(c => c.id === job?.clientId);
            const total = calcQuoteTotal(q);
            const lineCount = q.lineItems.length;
            return (
              <div key={q.id} className="order-card" onClick={() => openEdit(q)}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: SECTION_COLORS.quotes.light, color: SECTION_COLORS.quotes.accent }}>
                      <Icon name="quotes" size={15} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace" }}>{q.number}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{q.createdAt}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusBadge status={q.status} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job?.title || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>No job</span>}
                </div>
                {client && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{client.name}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{fmt(total)}</span>
                  <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{lineCount} item{lineCount !== 1 ? "s" : ""}</span>
                  {q.tax > 0 && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{q.tax}% GST</span>}
                </div>
                <SectionProgressBar status={q.status} section="quotes" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{lineCount} line item{lineCount !== 1 ? "s" : ""}</span>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-xs" onClick={() => duplicate(q)} title="Duplicate"><Icon name="copy" size={12} /></button>
                    <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(q.id)}><Icon name="trash" size={12} /></button>
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
            <thead><tr><th>Number</th><th>Job</th><th>Client</th><th>Status</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9}><div className="empty-state"><div className="empty-state-icon">{"\ud83d\udccb"}</div><div className="empty-state-text">No quotes found</div></div></td></tr>}
              {filtered.map(q => {
                const job = jobs.find(j => j.id === q.jobId);
                const client = clients.find(c => c.id === job?.clientId);
                const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
                const linkedInv = invoices.filter(i => i.fromQuoteId === q.id);
                return (
                  <tr key={q.id} style={{ cursor: "pointer" }} onClick={() => openEdit(q)}>
                    <td><span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{q.number}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{job?.title}</div>
                      {linkedInv.length > 0 && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{"\u2192"} {linkedInv.map(i=>i.number).join(", ")}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: "#666" }}>{client?.name}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td>{fmt(sub)}</td>
                    <td>{fmt(sub * q.tax / 100)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(sub * (1 + q.tax / 100))}</td>
                    <td style={{ fontSize: 12, color: "#999" }}>{q.createdAt}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => duplicate(q)} title="Duplicate"><Icon name="copy" size={12} /></button>
                        <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(q.id)}><Icon name="trash" size={12} /></button>
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
        const isNewQ = !editQuote;
        const qJob = jobs.find(j => String(j.id) === String(form.jobId));
        const qClient = clients.find(c => c.id === qJob?.clientId);
        const qSub = (form.lineItems || []).reduce((s, l) => s + l.qty * l.rate, 0);
        const qTax = qSub * (form.tax || 10) / 100;
        const qTotal = qSub + qTax;
        return (
        <SectionDrawer
          accent={SECTION_COLORS.quotes.accent}
          icon={<Icon name="quotes" size={16} />}
          typeLabel="Quote"
          title={editQuote ? editQuote.number : "New Quote"}
          statusBadge={editQuote ? <StatusBadge status={form.status} /> : null}
          mode={quoteMode} setMode={setQuoteMode}
          showToggle={!isNewQ}
          isNew={isNewQ}
          footer={quoteMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} disabled={emailSending} onClick={() => handleSendQuoteEmail(form)}>
                <Icon name="send" size={13} /> {emailSending ? "Sending..." : "Send to Client"}
              </button>
              <button className="btn btn-sm" style={{ background: SECTION_COLORS.quotes.accent, color: "#fff", border: "none" }} onClick={() => setQuoteMode("edit")}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editQuote ? setQuoteMode("view") : setShowModal(false)}>{editQuote ? "Cancel" : "Cancel"}</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.quotes.accent, color: "#fff", border: "none" }} onClick={() => { save(); if (editQuote) setQuoteMode("view"); }}>
              <Icon name="check" size={13} /> {isNewQ ? "Create Quote" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {quoteMode === "view" ? (
            <div style={{ padding: "20px 24px" }}>
              {emailStatus && <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, background: emailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: emailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${emailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{emailStatus.msg}</div>}
              <div className="grid-2">
                <ViewField label="Job" value={qJob?.title} />
                <ViewField label="Client" value={qClient?.name} />
              </div>
              <ViewField label="Status" value={form.status?.charAt(0).toUpperCase() + form.status?.slice(1)} />
              <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 4, paddingTop: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Line Items</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr><th style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", borderBottom: "1px solid #f0f0f0" }}>Description</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#999", borderBottom: "1px solid #f0f0f0" }}>Qty</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#999", borderBottom: "1px solid #f0f0f0" }}>Rate</th><th style={{ textAlign: "right", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#999", borderBottom: "1px solid #f0f0f0" }}>Total</th></tr></thead>
                  <tbody>
                    {(form.lineItems || []).map((l, i) => (
                      <tr key={i}><td style={{ padding: "8px" }}>{l.desc || "\u2014"}</td><td style={{ textAlign: "right", padding: "8px" }}>{l.qty} {l.unit}</td><td style={{ textAlign: "right", padding: "8px" }}>{fmt(l.rate)}</td><td style={{ textAlign: "right", padding: "8px", fontWeight: 600 }}>{fmt(l.qty * l.rate)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="totals-box" style={{ marginLeft: "auto", maxWidth: 260 }}>
                <div className="totals-row"><span>Subtotal</span><span>{fmt(qSub)}</span></div>
                <div className="totals-row"><span>GST ({form.tax}%)</span><span>{fmt(qTax)}</span></div>
                <div className="totals-row total"><span>Total</span><span>{fmt(qTotal)}</span></div>
              </div>
              {form.notes && <div style={{ marginTop: 16 }}><ViewField label="Notes / Terms" value={form.notes} /></div>}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="grid-2" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Job</label>
                <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {["draft","sent","accepted","declined"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Line Items</label>
              <LineItemsEditor items={form.lineItems} onChange={items => setForm(f => ({ ...f, lineItems: items }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes / Terms</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment terms, inclusions/exclusions, validity period..." />
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}
    </div>
  );
};

export default memo(Quotes);
