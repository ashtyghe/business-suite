import { useState, useCallback, memo } from "react";
import { useAppStore } from '../lib/store';
import { createQuote, updateQuote, deleteQuote } from '../lib/db';
import { sendEmail } from '../lib/supabase';
import { useKanbanDnD } from '../hooks/useKanbanDnD';
import { buildQuotePdfHtml, htmlToPdfBase64 } from '../lib/pdf';
import { fmt, fmtDate, calcQuoteTotal } from '../utils/helpers';
import { subtotal, gstOnSubtotal, totalWithGst, calcDocumentTotal, lineItemTotal, sumWith } from '../utils/calcEngine';
import { SECTION_COLORS, ViewField } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import {
  StatusBadge, SectionDrawer, LineItemsEditor, SectionProgressBar,
} from '../components/shared';
import s from './Quotes.module.css';

const QUOTE_STATUSES = ["all", "draft", "sent", "accepted", "declined"];

const Quotes = () => {
  const { quotes, setQuotes, jobs, clients, invoices, templates, companyInfo, sectionView: view, setSectionView: setView } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editQuote, setEditQuote] = useState(null);
  const [quoteMode, setQuoteMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
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

  const handleKanbanDrop = useCallback(async (itemId, newStatus) => {
    const quote = quotes.find(q => String(q.id) === itemId);
    if (!quote || quote.status === newStatus) return;
    try {
      const saved = await updateQuote(quote.id, { ...quote, status: newStatus });
      setQuotes(qs => qs.map(q => q.id === saved.id ? saved : q));
    } catch (err) { console.error('Failed to update quote status:', err); }
  }, [quotes, setQuotes]);
  const { dragOverCol, cardDragProps, colDragProps } = useKanbanDnD(handleKanbanDrop);
  const quoteStatusColors = { draft: "#888", sent: "#2563eb", accepted: "#16a34a", declined: "#dc2626" };
  const quoteStatusLabels = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };

  return (
    <div>
      {/* ── Summary strip */}
      <div className={s.summaryGrid}>
        {Object.entries(quoteStatusLabels).map(([key, label]) => {
          const statusQuotes = quotes.filter(q => q.status === key);
          const count = statusQuotes.length;
          const total = sumWith(statusQuotes, q => calcDocumentTotal(q.lineItems, q.tax));
          const color = quoteStatusColors[key];
          return (
            <div key={key} className={`stat-card ${s.statCard}`} style={{ borderTop: `3px solid ${color}` }}
              onClick={() => { setFilterStatus(key); setView("list"); }}>
              <div className="stat-label">{label}</div>
              <div className={`stat-value ${s.statValue}`} style={{ color }}>{count}</div>
              <div className="stat-sub">{fmt(total)}</div>
            </div>
          );
        })}
      </div>

      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBarFlex}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotes, jobs, clients..." />
        </div>
        <select className={`form-control ${s.filterSelect}`} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: SECTION_COLORS.quotes.accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: SECTION_COLORS.quotes.accent }} onClick={openNew}><Icon name="plus" size={14} />New Quote</button></div>
      </div>

      {view === "kanban" && (
        <div className={`kanban ${s.kanbanGrid}`}>
          {["draft", "sent", "accepted", "declined"].map(col => {
            const colQuotes = filtered.filter(q => q.status === col);
            const labels = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
            return (
              <div key={col} className={`kanban-col${dragOverCol === col ? ' drag-over' : ''}`} {...colDragProps(col)}>
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span className={s.kanbanBadge}>{colQuotes.length}</span>
                </div>
                {colQuotes.map(q => {
                  const job = jobs.find(j => j.id === q.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  return (
                    <div key={q.id} className="kanban-card" onClick={() => openEdit(q)} {...cardDragProps(q.id)}>
                      <div className={s.kanbanCardHeader}>
                        <span className={s.kanbanCardNumber}>{q.number}</span>
                      </div>
                      <div className={s.kanbanCardTitle}>{job?.title || "\u2014"}</div>
                      <div className={s.kanbanCardClient}>{client?.name || "\u2014"}</div>
                      <div className={s.kanbanCardFooter}>
                        <span className={s.kanbanCardTotal}>{fmt(calcDocumentTotal(q.lineItems, q.tax))}</span>
                        <span className={s.kanbanCardDate}>{fmtDate(q.createdAt)}</span>
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
          {filtered.length === 0 && <div className={`empty-state ${s.emptyGridCol}`}><div className="empty-state-icon">{"\ud83d\udccb"}</div><div className="empty-state-text">No quotes found</div></div>}
          {filtered.map(q => {
            const job = jobs.find(j => j.id === q.jobId);
            const client = clients.find(c => c.id === job?.clientId);
            const total = calcDocumentTotal(q.lineItems, q.tax);
            const lineCount = q.lineItems.length;
            return (
              <div key={q.id} className="order-card" onClick={() => openEdit(q)}>
                <div className={s.gridCardHeader}>
                  <div className={s.gridCardLeft}>
                    <div className={s.gridCardIcon} style={{ background: SECTION_COLORS.quotes.light, color: SECTION_COLORS.quotes.accent }}>
                      <Icon name="quotes" size={15} />
                    </div>
                    <div>
                      <div className={s.gridCardNumber}>{q.number}</div>
                      <div className={s.gridCardDate}>{fmtDate(q.createdAt)}</div>
                    </div>
                  </div>
                  <div className={s.gridCardBadge}>
                    <StatusBadge status={q.status} />
                  </div>
                </div>
                <div className={s.gridCardTitle}>
                  {job?.title || <span className={s.gridCardNoJob}>No job</span>}
                </div>
                {client && <div className={s.gridCardClient}>{client.name}</div>}
                <div className={s.gridCardTotals}>
                  <span className={s.gridCardTotalValue}>{fmt(total)}</span>
                  <span className={s.gridCardPill}>{lineCount} item{lineCount !== 1 ? "s" : ""}</span>
                  {q.tax > 0 && <span className={s.gridCardPill}>{q.tax}% GST</span>}
                </div>
                <SectionProgressBar status={q.status} section="quotes" />
                <div className={s.gridCardFooter}>
                  <span className={s.gridCardFooterLabel}>{lineCount} line item{lineCount !== 1 ? "s" : ""}</span>
                  <div className={s.actionBtns} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-xs" onClick={() => duplicate(q)} title="Duplicate"><Icon name="copy" size={12} /></button>
                    <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(q.id)}><Icon name="trash" size={12} /></button>
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
                const sub = subtotal(q.lineItems);
                const linkedInv = invoices.filter(i => i.fromQuoteId === q.id);
                return (
                  <tr key={q.id} className={s.cursorPointer} onClick={() => openEdit(q)}>
                    <td><span className={s.tableNumber}>{q.number}</span></td>
                    <td>
                      <div className={s.tableJobTitle}>{job?.title}</div>
                      {linkedInv.length > 0 && <div className={s.tableLinkedInv}>{"\u2192"} {linkedInv.map(i=>i.number).join(", ")}</div>}
                    </td>
                    <td className={s.tableClient}>{client?.name}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td>{fmt(sub)}</td>
                    <td>{fmt(gstOnSubtotal(sub, q.tax))}</td>
                    <td className={s.tableTotal}>{fmt(totalWithGst(sub, q.tax))}</td>
                    <td className={s.tableDate}>{fmtDate(q.createdAt)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className={s.actionBtns}>
                        <button className="btn btn-ghost btn-xs" onClick={() => duplicate(q)} title="Duplicate"><Icon name="copy" size={12} /></button>
                        <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(q.id)}><Icon name="trash" size={12} /></button>
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
        const qSub = subtotal(form.lineItems || []);
        const qTax = gstOnSubtotal(qSub, form.tax || 10);
        const qTotal = totalWithGst(qSub, form.tax || 10);
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
            <div className={s.footerActions}>
              <button className={`btn btn-sm ${s.footerBtnSend}`} disabled={emailSending} onClick={() => handleSendQuoteEmail(form)}>
                <Icon name="send" size={13} /> {emailSending ? "Sending..." : "Send to Client"}
              </button>
              <button className={`btn btn-sm ${s.footerBtnAccent}`} style={{ background: SECTION_COLORS.quotes.accent }} onClick={() => setQuoteMode("edit")}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editQuote ? setQuoteMode("view") : setShowModal(false)}>{editQuote ? "Cancel" : "Cancel"}</button>
            <button className={`btn btn-sm ${s.footerBtnAccent}`} style={{ background: SECTION_COLORS.quotes.accent }} onClick={() => { save(); if (editQuote) setQuoteMode("view"); }}>
              <Icon name="check" size={13} /> {isNewQ ? "Create Quote" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {quoteMode === "view" ? (
            <div className={s.viewPanel}>
              {emailStatus && <div className={emailStatus.type === "success" ? s.emailAlertSuccess : s.emailAlertError}>{emailStatus.msg}</div>}
              <div className="grid-2">
                <ViewField label="Job" value={qJob?.title} />
                <ViewField label="Client" value={qClient?.name} />
              </div>
              <ViewField label="Status" value={form.status?.charAt(0).toUpperCase() + form.status?.slice(1)} />
              <div className={s.lineItemsSection}>
                <div className={s.lineItemsSectionLabel}>Line Items</div>
                <table className={s.lineItemsTable}>
                  <thead><tr><th className={s.lineItemsThLeft}>Description</th><th className={s.lineItemsThRight}>Qty</th><th className={s.lineItemsThRight}>Rate</th><th className={s.lineItemsThRight}>Total</th></tr></thead>
                  <tbody>
                    {(form.lineItems || []).map((l, i) => (
                      <tr key={i}><td className={s.lineItemTd}>{l.desc || "\u2014"}</td><td className={s.lineItemTdRight}>{l.qty} {l.unit}</td><td className={s.lineItemTdRight}>{fmt(l.rate)}</td><td className={s.lineItemTdTotal}>{fmt(lineItemTotal(l.qty, l.rate))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={`totals-box ${s.totalsBoxWrap}`}>
                <div className="totals-row"><span>Subtotal</span><span>{fmt(qSub)}</span></div>
                <div className="totals-row"><span>GST ({form.tax}%)</span><span>{fmt(qTax)}</span></div>
                <div className="totals-row total"><span>Total</span><span>{fmt(qTotal)}</span></div>
              </div>
              {form.notes && <div className={s.notesWrap}><ViewField label="Notes / Terms" value={form.notes} /></div>}
            </div>
          ) : (
          <div className={s.editPanel}>
            <div className={`grid-2 ${s.editGrid}`}>
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
