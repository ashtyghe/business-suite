import { useState, useCallback, memo } from "react";
import { useAppStore } from '../lib/store';
import { createInvoice, updateInvoice, deleteInvoice } from '../lib/db';
import { sendEmail, xeroSyncInvoice } from '../lib/supabase';
import { useKanbanDnD } from '../hooks/useKanbanDnD';
import { buildInvoicePdfHtml, htmlToPdfBase64 } from '../lib/pdf';
import { fmt, fmtDate, calcQuoteTotal } from '../utils/helpers';
import { subtotal, gstOnSubtotal, totalWithGst, calcDocumentTotal, lineItemTotal, sumWith } from '../utils/calcEngine';
import { SECTION_COLORS, ViewField } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import {
  StatusBadge, XeroSyncBadge, SectionProgressBar, SectionDrawer, LineItemsEditor,
} from '../components/shared';
import s from './Invoices.module.css';

const INV_STATUSES = ["all", "draft", "sent", "paid", "overdue", "void"];

const Invoices = () => {
  const { invoices, setInvoices, jobs, clients, quotes, templates, companyInfo, sectionView: view, setSectionView: setView } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [invMode, setInvMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
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
    const total = calcDocumentTotal(inv.lineItems, inv.tax || 0);
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
  const handleKanbanDrop = useCallback(async (itemId, newStatus) => {
    const inv = invoices.find(i => String(i.id) === itemId);
    if (!inv || inv.status === newStatus) return;
    try {
      const saved = await updateInvoice(inv.id, { ...inv, status: newStatus });
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      if (newStatus === "sent" && inv.status !== "sent" && saved.xeroInvoiceId) {
        xeroSyncInvoice("push", inv.id).catch(() => {});
      }
    } catch (err) { console.error('Failed to update invoice status:', err); }
  }, [invoices, setInvoices]);
  const { dragOverCol, cardDragProps, colDragProps } = useKanbanDnD(handleKanbanDrop);

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
  const invStatusLabels = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue" };

  return (
    <div>
      {/* -- Summary strip */}
      <div className={s.summaryGrid}>
        {Object.entries(invStatusLabels).map(([key, label]) => {
          const statusInvs = invoices.filter(i => i.status === key);
          const count = statusInvs.length;
          const total = sumWith(statusInvs, inv => calcDocumentTotal(inv.lineItems, inv.tax));
          const color = invStatusColors[key];
          return (
            <div key={key} className={`stat-card ${s.summaryCard}`} style={{ borderTop: `3px solid ${color}` }}
              onClick={() => { setFilterStatus(key); setView("list"); }}>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{count}</div>
              <div className="stat-sub">{fmt(total)}</div>
            </div>
          );
        })}
      </div>
      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBarWrap}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices, jobs, clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {INV_STATUSES.map(st => <option key={st} value={st}>{st === "all" ? "All Statuses" : st.charAt(0).toUpperCase() + st.slice(1)}</option>)}
        </select>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: SECTION_COLORS.invoices.accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: SECTION_COLORS.invoices.accent }} onClick={openNew}><Icon name="plus" size={14} />New Invoice</button></div>
      </div>

      {view === "kanban" && (
        <div className={`kanban ${s.kanbanCols}`}>
          {["draft", "sent", "paid", "overdue", "void"].map(col => {
            const colInvoices = filtered.filter(i => i.status === col);
            const labels = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", void: "Void" };
            const colTotal = sumWith(colInvoices, inv => calcDocumentTotal(inv.lineItems, inv.tax));
            return (
              <div key={col} className={`kanban-col${dragOverCol === col ? ' drag-over' : ''}`} {...colDragProps(col)}>
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span className={s.kanbanBadge}>{colInvoices.length}</span>
                </div>
                {colTotal > 0 && <div className={s.kanbanColTotal}>{fmt(colTotal)}</div>}
                {colInvoices.map(inv => {
                  const job = jobs.find(j => j.id === inv.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  const total = calcDocumentTotal(inv.lineItems, inv.tax);
                  return (
                    <div key={inv.id} className="kanban-card" onClick={() => openEdit(inv)} {...cardDragProps(inv.id)}>
                      <div className={s.kanbanCardHeader}>
                        <span className={s.kanbanCardNumber}>{inv.number}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div className={s.kanbanCardTitle}>{job?.title || "\u2014"}</div>
                      <div className={s.kanbanCardClient}>{client?.name || "\u2014"}</div>
                      <div className={s.kanbanCardFooter}>
                        <span className={s.kanbanCardTotal}>{fmt(total)}</span>
                        <span className={s.kanbanCardDue} style={{ color: inv.dueDate ? "#111" : "#ccc" }}>{inv.dueDate || "No due"}</span>
                      </div>
                      {inv.status !== "paid" && inv.status !== "void" && (
                        <div className={s.kanbanCardActions} onClick={e => e.stopPropagation()}>
                          <button className={`btn btn-ghost btn-xs ${s.btnGreen}`} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>
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
          {filtered.length === 0 && <div className={`empty-state ${s.gridEmpty}`}><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices found</div></div>}
          {filtered.map(inv => {
            const job = jobs.find(j => j.id === inv.jobId);
            const client = clients.find(c => c.id === job?.clientId);
            const total = calcDocumentTotal(inv.lineItems, inv.tax);
            const lineCount = inv.lineItems.length;
            const fromQuoteRef = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
            return (
              <div key={inv.id} className="order-card" onClick={() => openEdit(inv)}>
                <div className={s.cardHeader}>
                  <div className={s.cardHeaderLeft}>
                    <div className={s.cardIcon} style={{ background: SECTION_COLORS.invoices.light, color: SECTION_COLORS.invoices.accent }}>
                      <Icon name="invoices" size={15} />
                    </div>
                    <div>
                      <div className={s.cardNumber}>{inv.number}</div>
                      <div className={s.cardDate}>{fmtDate(inv.createdAt)}</div>
                    </div>
                  </div>
                  <div className={s.cardStatusWrap}>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
                <div className={s.cardTitle}>
                  {job?.title || <span className={s.cardTitleEmpty}>No job</span>}
                </div>
                {client && <div className={s.cardClient}>{client.name}</div>}
                <div className={s.cardMeta}>
                  <span className={s.cardTotal}>{fmt(total)}</span>
                  <span className={s.cardPill}>{lineCount} item{lineCount !== 1 ? "s" : ""}</span>
                  {fromQuoteRef && <span className={s.cardPill}>from {fromQuoteRef.number}</span>}
                </div>
                <SectionProgressBar status={inv.status} section="invoices" />
                <div className={s.cardFooter}>
                  <span className={s.cardDue} style={{ color: inv.dueDate ? "#334155" : "#ccc" }}>{inv.dueDate ? `Due ${fmtDate(inv.dueDate)}` : "No due date"}</span>
                  <div className={s.cardActions} onClick={e => e.stopPropagation()}>
                    {inv.status !== "paid" && inv.status !== "void" && <button className={`btn btn-ghost btn-xs ${s.btnGreen}`} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>}
                    <button className={`btn btn-ghost btn-xs ${s.btnRed}`} onClick={() => del(inv.id)}><Icon name="trash" size={12} /></button>
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
                const sub = subtotal(inv.lineItems);
                const fromQuoteRef = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
                return (
                  <tr key={inv.id} className={s.rowPointer} onClick={() => openEdit(inv)}>
                    <td><span className={s.listNumber}>{inv.number}</span>{fromQuoteRef && <div className={s.listQuoteRef}>from {fromQuoteRef.number}</div>}</td>
                    <td className={s.listJobCell}>{job?.title}</td>
                    <td className={s.listClientCell}>{client?.name}</td>
                    <td><StatusBadge status={inv.status} /> <XeroSyncBadge syncStatus={inv.xeroSyncStatus} xeroId={inv.xeroInvoiceId} /></td>
                    <td>{fmt(sub)}</td>
                    <td>{fmt(gstOnSubtotal(sub, inv.tax))}</td>
                    <td className={s.listTotalCell}>{fmt(totalWithGst(sub, inv.tax))}</td>
                    <td className={s.listDueCell} style={{ color: inv.dueDate ? "#111" : "#ccc" }}>{inv.dueDate || "\u2014"}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className={s.listActions}>
                        {inv.status !== "paid" && inv.status !== "void" && <button className={`btn btn-ghost btn-xs ${s.btnGreen}`} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>}
                        {!inv.xeroInvoiceId && inv.status !== "draft" && <button className={`btn btn-ghost btn-xs ${s.btnBlue}`} onClick={() => xeroSyncInvoice("push", inv.id)} title="Send to Xero"><Icon name="send" size={12} /></button>}
                        <button className={`btn btn-ghost btn-xs ${s.btnRed}`} onClick={() => del(inv.id)}><Icon name="trash" size={12} /></button>
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
        const iSub = subtotal(form.lineItems);
        const iTax = gstOnSubtotal(iSub, form.tax || 0);
        const iTotal = totalWithGst(iSub, form.tax || 0);
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
            <div className={s.drawerFooterActions}>
              {(form.status === "sent" || form.status === "overdue") && <button className={`btn btn-sm ${s.btnDanger}`} disabled={emailSending} onClick={() => handleSendPaymentReminder(form)}>
                <Icon name="notification" size={13} /> {emailSending ? "Sending..." : "Payment Reminder"}
              </button>}
              <button className={`btn btn-sm ${s.btnPrimary}`} disabled={emailSending} onClick={() => handleSendInvoiceEmail(form)}>
                <Icon name="send" size={13} /> {emailSending ? "Sending..." : "Send to Client"}
              </button>
              <button className={`btn btn-sm ${s.btnAccent}`} style={{ background: accent }} onClick={() => setInvMode("edit")}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => { if (isNewInv) setShowModal(false); else { setForm(editInvoice); setInvMode("view"); } }}>Cancel</button>
            <button className={`btn btn-sm ${s.btnAccent}`} style={{ background: accent }} onClick={save}>
              <Icon name="check" size={13} /> {isNewInv ? "Create Invoice" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {invMode === "view" && !isNewInv ? (
          <div className={s.drawerViewPad}>
            {emailStatus && <div className={`${s.emailAlert} ${emailStatus.type === "success" ? s.emailAlertSuccess : s.emailAlertError}`}>{emailStatus.msg}</div>}
            <div className={s.viewGrid}>
              <ViewField label="Job" value={iJob?.title} />
              <ViewField label="Client" value={iClient?.name} />
              <ViewField label="Status" value={form.status?.charAt(0).toUpperCase() + form.status?.slice(1)} />
              <ViewField label="Due Date" value={form.dueDate || "\u2014"} />
            </div>
            <div className={s.lineItemsSection}>
              <div className={s.sectionHeading}>Line Items</div>
              <table className={s.lineItemsTable}>
                <thead><tr className={s.lineItemsHeaderRow}>
                  <th className={s.lineItemsTh}>Description</th>
                  <th className={s.lineItemsThRight}>Qty</th>
                  <th className={s.lineItemsTh}>Unit</th>
                  <th className={s.lineItemsThRight}>Rate</th>
                  <th className={s.lineItemsThRight}>Amount</th>
                </tr></thead>
                <tbody>
                  {form.lineItems.map((li, i) => (
                    <tr key={i} className={s.lineItemRow}>
                      <td className={s.lineItemCell}>{li.desc || '\u2014'}</td>
                      <td className={s.lineItemCellRight}>{li.qty}</td>
                      <td className={s.lineItemCellPlain}>{li.unit}</td>
                      <td className={s.lineItemCellRight}>{fmt(li.rate)}</td>
                      <td className={s.lineItemCellRightBold}>{fmt(lineItemTotal(li.qty, li.rate))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={s.totalsBox}>
              <div className={s.totalsRow}><span className={s.totalsLabel}>Subtotal</span><span className={s.totalsValue}>{fmt(iSub)}</span></div>
              <div className={s.totalsRow}><span className={s.totalsLabel}>GST ({form.tax}%)</span><span className={s.totalsValue}>{fmt(iTax)}</span></div>
              <div className={s.totalsFinalRow}><span className={s.totalsFinalLabel}>Total</span><span className={s.totalsFinalValue} style={{ color: accent }}>{fmt(iTotal)}</span></div>
            </div>
            {form.notes && <ViewField label="Notes" value={form.notes} />}
          </div>
          ) : (
          <div className={s.editPad}>
            <div className={`grid-3 ${s.editFormGrid}`}>
              <div className="form-group">
                <label className="form-label">Job</label>
                <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {["draft","sent","paid","overdue","void"].map(st => <option key={st} value={st}>{st.charAt(0).toUpperCase() + st.slice(1)}</option>)}
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
