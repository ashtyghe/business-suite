import { useState, useCallback, memo } from "react";
import { useAppStore } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { createBill, updateBill, deleteBill } from '../lib/db';
import { xeroSyncBill } from '../lib/supabase';
import { useKanbanDnD } from '../hooks/useKanbanDnD';
import { fmt, fmtDate, addLog } from '../utils/helpers';
import { extractGst, applyMarkup, markupAmount, sumAmounts, sumWith } from '../utils/calcEngine';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import {
  BillStatusBadge, XeroSyncBadge, SectionProgressBar, SectionDrawer,
  BILL_STATUSES, BILL_STATUS_LABELS, BILL_CATEGORIES,
} from '../components/shared';
import { BillModal } from '../components/BillModal';
import s from './Bills.module.css';

// Not exported from shared.jsx, so defined locally
const BILL_STATUS_COLORS = {
  inbox:    { bg: "#f5f5f5", text: "#777" },
  linked:   { bg: "#e8f0fe", text: "#2c5fa8" },
  approved: { bg: "#e6f4ea", text: "#1e7e34" },
  posted:   { bg: "#111",    text: "#fff" },
};

// ── Post-to-Job Modal ─────────────────────────────────────────────────────────
const PostToJobModal = ({ bill, jobs, onPost, onClose }) => {
  const [jobId, setJobId]     = useState(bill.jobId ? String(bill.jobId) : "");
  const [category, setCategory] = useState(bill.category || "Materials");
  const [markup, setMarkup]   = useState(bill.markup || 0);

  const exGst = bill.hasGst ? extractGst(bill.amount) : bill.amount;
  const withMarkup = applyMarkup(exGst, parseFloat(markup) || 0);

  return (
    <SectionDrawer
      accent={SECTION_COLORS.bills.accent}
      icon={<Icon name="bills" size={16} />}
      typeLabel="Post to Job"
      title={bill.supplier}
      mode="edit" setMode={() => {}}
      showToggle={false}
      footer={<>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className={`btn btn-sm ${s.drawerBtn}`} style={{ background: SECTION_COLORS.bills.accent }} onClick={() => onPost(jobId, category, parseFloat(markup)||0)} disabled={!jobId}>
          <Icon name="check" size={13} /> Post to Job
        </button>
      </>}
      onClose={onClose}
      zIndex={1060}
    >
      <div className={s.drawerBody}>
        <div className={s.postSummaryCard}>
          <div className={s.postSupplier}>{bill.supplier}</div>
          <div className={s.postMeta}>{bill.invoiceNo && `${bill.invoiceNo} · `}{bill.description}</div>
          <div className={s.postAmount}>{fmt(bill.amount)} <span className={s.postAmountSuffix}>inc. GST</span></div>
        </div>

        <div className="form-group">
          <label className="form-label">Post to Job *</label>
          <select className="form-control" value={jobId} onChange={e => setJobId(e.target.value)}>
            <option value="">— Select a job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Cost Category</label>
          <select className="form-control" value={category} onChange={e => setCategory(e.target.value)}>
            {BILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Markup %</label>
          <div className={s.markupInputWrap}>
            <input type="number" className={`form-control ${s.markupInputControl}`} value={markup}
              onChange={e => setMarkup(e.target.value)} min="0" max="200" placeholder="0" />
            <span className={s.markupPercent}>%</span>
          </div>
        </div>

        {/* Cost summary */}
        <div className={s.costSummaryCard}>
          <div className={s.costSummaryLabel}>Cost Summary</div>
          <div className={s.costSummaryRows}>
            <div className={s.costRow}>
              <span className={s.costRowLabel}>Ex-GST cost</span><span>{fmt(exGst)}</span>
            </div>
            {parseFloat(markup) > 0 && (
              <div className={s.costRow}>
                <span className={s.costRowLabel}>Markup ({markup}%)</span><span>+ {fmt(markupAmount(exGst, parseFloat(markup)||0))}</span>
              </div>
            )}
            <div className={s.costTotalRow}>
              <span>On-charge to client</span><span>{fmt(withMarkup)}</span>
            </div>
          </div>
        </div>
      </div>
    </SectionDrawer>
  );
};

// ── Main Bills Component ───────────────────────────────────────────────────────
const Bills = () => {
  const { bills, setBills, jobs, setJobs, clients, sectionView: tab, setSectionView: setTab } = useAppStore();
  const auth = useAuth();
  const canApprove = auth.isAdmin || auth.isLocalDev;
  const canDelete = auth.isAdmin || auth.isLocalDev;
  const [showBillModal, setShowBillModal] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [postBill, setPostBill] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  // ── Stats
  const inbox    = bills.filter(b => b.status === "inbox");
  const linked   = bills.filter(b => b.status === "linked");
  const approved = bills.filter(b => b.status === "approved");
  const posted   = bills.filter(b => b.status === "posted");
  const totalAll = sumAmounts(bills);
  const totalPending = sumAmounts([...inbox, ...linked, ...approved]);
  const totalPosted  = sumAmounts(posted);

  // ── Filtered list view
  const filtered = bills.filter(b => {
    const job = jobs.find(j => j.id === b.jobId);
    const q = search.toLowerCase();
    const matchSearch = !search ||
      b.supplier.toLowerCase().includes(q) ||
      (b.invoiceNo||"").toLowerCase().includes(q) ||
      (b.description||"").toLowerCase().includes(q) ||
      (job?.title||"").toLowerCase().includes(q) ||
      (b.notes||"").toLowerCase().includes(q) ||
      (b.category||"").toLowerCase().includes(q) ||
      (b.lineItems || []).some(i => (i.description || "").toLowerCase().includes(q)) ||
      String(b.amount || "").includes(q);
    const matchStatus   = filterStatus === "all"   || b.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Actions
  const openNew  = () => { setEditBill(null); setShowBillModal(true); };
  const openEdit = (b) => { setEditBill(b); setShowBillModal(true); };

  const saveBill = async (data) => {
    try {
      if (editBill) {
        const saved = await updateBill(editBill.id, data);
        setBills(bs => bs.map(b => b.id === editBill.id ? saved : b));
      } else {
        const saved = await createBill(data);
        setBills(bs => [...bs, saved]);
        if (data.jobId) {
          setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `Bill captured: ${data.supplier} ${fmt(data.amount)}`) } : j));
        }
      }
    } catch (err) { console.error('Failed to save bill:', err); }
    setShowBillModal(false);
  };

  const del = async (id) => {
    try {
      await deleteBill(id);
      setBills(bs => bs.filter(b => b.id !== id));
    } catch (err) { console.error('Failed to delete bill:', err); }
  };

  const setStatus = async (id, status) => {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    try {
      const saved = await updateBill(id, { ...bill, status });
      setBills(bs => bs.map(b => b.id === saved.id ? saved : b));
      // Auto-sync to Xero when bill is approved or posted
      if ((status === "approved" || status === "posted") && !saved.xeroBillId) {
        xeroSyncBill("push", id).catch(() => {});
      }
    } catch (err) { console.error('Failed to update bill status:', err); }
  };

  const approveSelected = async () => {
    try {
      const toApprove = bills.filter(b => selectedIds.includes(b.id) && (b.status === "inbox" || b.status === "linked"));
      await Promise.all(toApprove.map(b => updateBill(b.id, { ...b, status: "approved" })));
      setBills(bs => bs.map(b => selectedIds.includes(b.id) && (b.status === "inbox" || b.status === "linked") ? { ...b, status: "approved" } : b));
      setSelectedIds([]);
    } catch (err) { console.error('Failed to approve bills:', err); }
  };

  const handlePost = async (billId, jobId, category, markup) => {
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;
    const exGst = bill.hasGst ? extractGst(bill.amount) : bill.amount;
    const onCharge = applyMarkup(exGst, markup);
    try {
      const saved = await updateBill(billId, { ...bill, status: "posted", jobId, category, markup });
      setBills(bs => bs.map(b => b.id === billId ? saved : b));
      setJobs(js => js.map(j => j.id === jobId ? { ...j, activityLog: addLog(j.activityLog, `Bill posted: ${bill.supplier} ${fmt(onCharge)} (ex-GST + ${markup}% markup)`) } : j));
      // Auto-sync to Xero
      if (!saved.xeroBillId) {
        xeroSyncBill("push", billId).catch(() => {});
      }
    } catch (err) { console.error('Failed to post bill:', err); }
    setPostBill(null);
  };

  const handleKanbanDrop = useCallback(async (itemId, newStatus) => {
    const bill = bills.find(b => String(b.id) === itemId);
    if (!bill || bill.status === newStatus) return;
    if (newStatus === "posted") { setPostBill(bill); return; }
    await setStatus(bill.id, newStatus);
  }, [bills]);
  const { dragOverCol, cardDragProps, colDragProps } = useKanbanDnD(handleKanbanDrop);
  const toggleSelect = (id) => setSelectedIds(si => si.includes(id) ? si.filter(x => x !== id) : [...si, id]);
  const toggleAll = () => setSelectedIds(si => si.length === filtered.length ? [] : filtered.map(b => b.id));

  return (
    <div>
      {/* ── Summary strip */}
      <div className={s.summaryGrid}>
        {[
          { label: "Inbox",    count: inbox.length,    total: sumAmounts(inbox),    color: "#888" },
          { label: "Linked",   count: linked.length,   total: sumAmounts(linked),   color: "#2c5fa8" },
          { label: "Approved", count: approved.length, total: sumAmounts(approved), color: "#1e7e34" },
          { label: "Posted",   count: posted.length,   total: sumAmounts(posted),   color: "#111" },
        ].map(st => (
          <div key={st.label} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${st.color}`, cursor: "pointer" }}
            onClick={() => { setFilterStatus(st.label.toLowerCase()); setTab("list"); }}>
            <div className="stat-label">{st.label}</div>
            <div className="stat-value" style={{ fontSize: 22, color: st.color }}>{st.count}</div>
            <div className="stat-sub">{fmt(st.total)}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar */}
      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier, invoice, description…" />
        </div>
        <select className={`form-control ${s.filterSelect}`} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {BILL_STATUSES.map(st => <option key={st} value={st}>{BILL_STATUS_LABELS[st]}</option>)}
        </select>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${tab === "list" ? "" : "btn-ghost"}`} style={tab === "list" ? { background: SECTION_COLORS.bills.accent, color: '#fff' } : undefined} onClick={() => setTab("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${tab === "grid" ? "" : "btn-ghost"}`} style={tab === "grid" ? { background: SECTION_COLORS.bills.accent, color: '#fff' } : undefined} onClick={() => setTab("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${tab === "kanban" ? "" : "btn-ghost"}`} style={tab === "kanban" ? { background: SECTION_COLORS.bills.accent, color: '#fff' } : undefined} onClick={() => setTab("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns">
          {canApprove && selectedIds.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={approveSelected}>
              <Icon name="check" size={12} />Approve {selectedIds.length}
            </button>
          )}
          <button className="btn btn-primary" style={{ background: SECTION_COLORS.bills.accent }} onClick={openNew}><Icon name="plus" size={14} />Capture Bill</button>
        </div>
      </div>

      {/* ══ GRID VIEW ══ */}
      {tab === "grid" && (
        <div className="order-cards-grid">
          {filtered.length === 0 && <div className={`empty-state ${s.emptyStateFull}`}><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills found</div></div>}
          {filtered.map(b => {
            const job = jobs.find(j => j.id === b.jobId);
            const sc = BILL_STATUS_COLORS[b.status];
            return (
              <div key={b.id} className="order-card" onClick={() => openEdit(b)}>
                <div className={s.cardHeader}>
                  <div className={s.cardHeaderLeft}>
                    <div className={s.cardIcon} style={{ background: SECTION_COLORS.bills.light, color: SECTION_COLORS.bills.accent }}>
                      <Icon name="bills" size={15} />
                    </div>
                    <div>
                      <div className={s.cardTitle}>{b.supplier}</div>
                      {b.invoiceNo && <div className={s.cardSubtitle}>{b.invoiceNo}</div>}
                    </div>
                  </div>
                  <div className={s.statusWrap}>
                    <span className={s.statusBadgeInline} style={{ background: sc.bg, color: sc.text }}>{BILL_STATUS_LABELS[b.status]}</span>
                  </div>
                </div>
                <div className={s.cardDescription}>
                  {b.description || <span className={s.noDescText}>No description</span>}
                </div>
                {job && <div className={s.jobRow}><Icon name="jobs" size={10} /> {job.title}</div>}
                <div className={s.amountRow}>
                  <span className={s.amountValue}>{fmt(b.amount)}</span>
                  <span className={`chip ${s.chipSmall}`}>{b.category}</span>
                  {b.hasGst && <span className={s.gstChip}>incl. GST</span>}
                </div>
                <SectionProgressBar status={b.status} section="bills" />
                <div className={s.cardFooter}>
                  <span className={s.cardDate}>{fmtDate(b.date)}</span>
                  <div className={s.actionRow} onClick={e => e.stopPropagation()}>
                    {b.status === "inbox" && <button className="btn btn-secondary btn-xs" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}>Link →</button>}
                    {canApprove && b.status === "linked" && <button className={`btn btn-secondary btn-xs ${s.approveColor}`} onClick={() => setStatus(b.id, "approved")}>✓</button>}
                    {canApprove && b.status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setPostBill(b)}>Post →</button>}
                    {canDelete && <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(b.id)}><Icon name="trash" size={12} /></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ KANBAN VIEW ══ */}
      {tab === "kanban" && (
        <div className={`kanban ${s.kanban4Col}`}>
          {BILL_STATUSES.map(status => {
            const stageBills = filtered.filter(b => b.status === status);
            const sc = BILL_STATUS_COLORS[status];
            return (
              <div key={status} className={`kanban-col${dragOverCol === status ? ' drag-over' : ''}`} {...colDragProps(status)}>
                <div className="kanban-col-header">
                  <span>{BILL_STATUS_LABELS[status]}</span>
                  <span className={s.kanbanBadge} style={{ background: sc.bg, color: sc.text }}>{stageBills.length}</span>
                </div>
                <div className={s.kanbanColTotal}>{fmt(sumAmounts(stageBills))}</div>
                {stageBills.map(b => {
                  const job = jobs.find(j => j.id === b.jobId);
                  return (
                    <div key={b.id} className="kanban-card" onClick={() => openEdit(b)} {...cardDragProps(b.id)}>
                      <div className={s.kanbanCardHeader}>
                        <div className={s.kanbanCardLeft}>
                          <div className={s.kanbanSupplier}>{b.supplier}</div>
                          {b.invoiceNo && <span className={s.kanbanInvoiceNo}>{b.invoiceNo}</span>}
                        </div>
                        <div className={s.kanbanAmount}>{fmt(b.amount)}</div>
                      </div>
                      {b.description && <div className={s.kanbanDesc}>{b.description}</div>}
                      <div className={s.kanbanFooter}>
                        <div className={s.kanbanMeta}>
                          <span className={`chip ${s.chipSmall}`}>{b.category}</span>
                          {job ? <span className={s.kanbanJobTitle}>{job.title}</span> : <span className={s.kanbanUnlinked}>Unlinked</span>}
                        </div>
                        <div className={s.actionRow} onClick={e => e.stopPropagation()}>
                          {status === "inbox" && <button className="btn btn-secondary btn-xs" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}>Link →</button>}
                          {canApprove && status === "linked" && <button className={`btn btn-secondary btn-xs ${s.approveColor}`} onClick={() => setStatus(b.id, "approved")}>✓</button>}
                          {canApprove && status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setPostBill(b)}>Post →</button>}
                          {canDelete && <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(b.id)}><Icon name="trash" size={10} /></button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ LIST VIEW ══ */}
      {tab === "list" && (
        <div>

          {/* Totals bar */}
          {filtered.length > 0 && (
            <div className={s.totalsBar}>
              <span className={s.totalsLabel}>Showing <strong className={s.totalsValue}>{filtered.length}</strong> bills</span>
              <span className={s.totalsLabel}>Total <strong className={s.totalsValue}>{fmt(sumAmounts(filtered))}</strong></span>
              <span className={s.totalsLabel}>Ex-GST <strong className={s.totalsValue}>{fmt(sumWith(filtered, b => b.hasGst ? extractGst(b.amount) : b.amount))}</strong></span>
              {selectedIds.length > 0 && <span className={s.totalsSelection}>{selectedIds.length} selected · {fmt(sumAmounts(bills.filter(b=>selectedIds.includes(b.id))))}</span>}
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className={s.checkboxCol}>
                      <input type="checkbox" checked={filtered.length > 0 && selectedIds.length === filtered.length} onChange={toggleAll} />
                    </th>
                    <th>Supplier</th><th>Invoice #</th><th>Job</th><th>Category</th>
                    <th>Date</th><th>Ex-GST</th><th>GST</th><th>Total</th><th>Markup</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={12}><div className="empty-state"><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills match your filters</div></div></td></tr>
                  )}
                  {filtered.map(b => {
                    const job = jobs.find(j => j.id === b.jobId);
                    const exGst = b.hasGst ? extractGst(b.amount) : b.amount;
                    const gst = b.hasGst ? b.amount - exGst : 0;
                    const onCharge = applyMarkup(exGst, b.markup || 0);
                    return (
                      <tr key={b.id} onClick={() => openEdit(b)} style={{ background: selectedIds.includes(b.id) ? "#f5f8ff" : "transparent", cursor: "pointer" }}>
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.includes(b.id)} onChange={() => toggleSelect(b.id)} />
                        </td>
                        <td>
                          <div className={s.listSupplier}>{b.supplier}</div>
                          {b.notes && <div className={s.listNotes}>{b.notes.slice(0,40)}{b.notes.length>40?"…":""}</div>}
                        </td>
                        <td><span className={s.listInvoiceNo}>{b.invoiceNo||"—"}</span></td>
                        <td>
                          {job ? <div className={s.listJobTitle}>{job.title}</div> : <span className={s.listUnlinked}>Unlinked</span>}
                        </td>
                        <td><span className="chip">{b.category}</span></td>
                        <td className={s.listDate}>{fmtDate(b.date)}</td>
                        <td className={s.listExGst}>{fmt(exGst)}</td>
                        <td className={s.listGst}>{b.hasGst ? fmt(gst) : <span className={s.listGstDash}>—</span>}</td>
                        <td className={s.listTotal}>{fmt(b.amount)}</td>
                        <td className={s.listMarkup}>
                          {b.markup > 0 ? <span className={s.markupValue}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span> : <span className={s.markupDash}>—</span>}
                        </td>
                        <td><BillStatusBadge status={b.status} /> <XeroSyncBadge syncStatus={b.xeroSyncStatus} xeroId={b.xeroBillId} /></td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className={s.listActions}>
                            {b.status === "inbox"    && <button className="btn btn-ghost btn-xs" title="Link" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}><Icon name="arrow_right" size={11} /></button>}
                            {canApprove && b.status === "linked"   && <button className={`btn btn-ghost btn-xs ${s.approveColor}`} title="Approve" onClick={() => setStatus(b.id, "approved")}><Icon name="check" size={11} /></button>}
                            {canApprove && b.status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} title="Post to Job" onClick={() => setPostBill(b)}>Post →</button>}
                            {!b.xeroBillId && (b.status === "approved" || b.status === "posted") && <button className={`btn btn-ghost btn-xs ${s.xeroBtn}`} title="Send to Xero" onClick={() => xeroSyncBill("push", b.id)}><Icon name="send" size={11} /></button>}
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(b)}><Icon name="edit" size={11} /></button>
                            {canDelete && <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(b.id)}><Icon name="trash" size={11} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals */}
      {showBillModal && (
        <BillModal bill={editBill} jobs={jobs} onSave={saveBill} onClose={() => setShowBillModal(false)} />
      )}
      {postBill && (
        <PostToJobModal
          bill={postBill}
          jobs={jobs}
          onPost={(jobId, category, markup) => handlePost(postBill.id, jobId, category, markup)}
          onClose={() => setPostBill(null)}
        />
      )}
    </div>
  );
};

export default memo(Bills);
