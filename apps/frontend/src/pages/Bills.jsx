import { useState } from "react";
import { useAppStore } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { createBill, updateBill, deleteBill } from '../lib/db';
import { xeroSyncBill } from '../lib/supabase';
import { fmt, addLog } from '../utils/helpers';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import {
  BillStatusBadge, XeroSyncBadge, SectionProgressBar, SectionDrawer,
  BILL_STATUSES, BILL_STATUS_LABELS, BILL_CATEGORIES,
} from '../components/shared';
import { BillModal } from '../components/BillModal';

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

  const exGst = bill.hasGst ? bill.amount / 1.1 : bill.amount;
  const withMarkup = exGst * (1 + (parseFloat(markup) || 0) / 100);

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
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.bills.accent, color: "#fff", border: "none" }} onClick={() => onPost(jobId, category, parseFloat(markup)||0)} disabled={!jobId}>
          <Icon name="check" size={13} /> Post to Job
        </button>
      </>}
      onClose={onClose}
      zIndex={1060}
    >
      <div style={{ padding: "20px 24px" }}>
        <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{bill.supplier}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{bill.invoiceNo && `${bill.invoiceNo} · `}{bill.description}</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{fmt(bill.amount)} <span style={{ fontSize: 11, fontWeight: 400, color: "#aaa" }}>inc. GST</span></div>
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
          <div style={{ position: "relative" }}>
            <input type="number" className="form-control" style={{ paddingRight: 32 }} value={markup}
              onChange={e => setMarkup(e.target.value)} min="0" max="200" placeholder="0" />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>%</span>
          </div>
        </div>

        {/* Cost summary */}
        <div style={{ background: "#111", color: "#fff", borderRadius: 8, padding: "14px 16px", marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#666", marginBottom: 10 }}>Cost Summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Ex-GST cost</span><span>{fmt(exGst)}</span>
            </div>
            {parseFloat(markup) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888" }}>Markup ({markup}%)</span><span>+ {fmt(exGst * (parseFloat(markup)||0) / 100)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #2a2a2a", paddingTop: 6, marginTop: 2, fontWeight: 800, fontSize: 15 }}>
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
  const { bills, setBills, jobs, setJobs, clients } = useAppStore();
  const auth = useAuth();
  const canApprove = auth.isAdmin || auth.isLocalDev;
  const canDelete = auth.isAdmin || auth.isLocalDev;
  const [tab, setTab] = useState("kanban");
  const [showBillModal, setShowBillModal] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [postBill, setPostBill] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterJob, setFilterJob] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  // ── Stats
  const inbox    = bills.filter(b => b.status === "inbox");
  const linked   = bills.filter(b => b.status === "linked");
  const approved = bills.filter(b => b.status === "approved");
  const posted   = bills.filter(b => b.status === "posted");
  const totalAll = bills.reduce((s,b) => s + (b.amount||0), 0);
  const totalPending = [...inbox, ...linked, ...approved].reduce((s,b) => s + (b.amount||0), 0);
  const totalPosted  = posted.reduce((s,b) => s + (b.amount||0), 0);

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
    const matchCategory = filterCategory === "all" || b.category === filterCategory;
    const matchJob      = filterJob === "all"      || String(b.jobId) === filterJob;
    return matchSearch && matchStatus && matchCategory && matchJob;
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
    const exGst = bill.hasGst ? bill.amount / 1.1 : bill.amount;
    const onCharge = exGst * (1 + markup / 100);
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

  const toggleSelect = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelectedIds(s => s.length === filtered.length ? [] : filtered.map(b => b.id));

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Inbox",    count: inbox.length,    total: inbox.reduce((s,b)=>s+b.amount,0),    color: "#888" },
          { label: "Linked",   count: linked.length,   total: linked.reduce((s,b)=>s+b.amount,0),   color: "#2c5fa8" },
          { label: "Approved", count: approved.length, total: approved.reduce((s,b)=>s+b.amount,0), color: "#1e7e34" },
          { label: "Posted",   count: posted.length,   total: posted.reduce((s,b)=>s+b.amount,0),   color: "#111" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${s.color}`, cursor: "pointer" }}
            onClick={() => { setFilterStatus(s.label.toLowerCase()); setTab("list"); }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22, color: s.color }}>{s.count}</div>
            <div className="stat-sub">{fmt(s.total)}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar */}
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier, invoice, description…" />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {BILL_STATUSES.map(s => <option key={s} value={s}>{BILL_STATUS_LABELS[s]}</option>)}
        </select>
        <select className="form-control" style={{ width: "auto" }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
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
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills found</div></div>}
          {filtered.map(b => {
            const job = jobs.find(j => j.id === b.jobId);
            const sc = BILL_STATUS_COLORS[b.status];
            return (
              <div key={b.id} className="order-card" onClick={() => openEdit(b)}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: SECTION_COLORS.bills.light, color: SECTION_COLORS.bills.accent }}>
                      <Icon name="bills" size={15} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier}</div>
                      {b.invoiceNo && <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{b.invoiceNo}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: sc.bg, color: sc.text }}>{BILL_STATUS_LABELS[b.status]}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.description || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>No description</span>}
                </div>
                {job && <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><Icon name="jobs" size={10} /> {job.title}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{fmt(b.amount)}</span>
                  <span className="chip" style={{ fontSize: 10 }}>{b.category}</span>
                  {b.hasGst && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>incl. GST</span>}
                </div>
                <SectionProgressBar status={b.status} section="bills" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{b.date}</span>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    {b.status === "inbox" && <button className="btn btn-secondary btn-xs" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}>Link →</button>}
                    {canApprove && b.status === "linked" && <button className="btn btn-secondary btn-xs" style={{ color: "#1e7e34" }} onClick={() => setStatus(b.id, "approved")}>✓</button>}
                    {canApprove && b.status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setPostBill(b)}>Post →</button>}
                    {canDelete && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(b.id)}><Icon name="trash" size={12} /></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ KANBAN VIEW ══ */}
      {tab === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(4, minmax(200px,1fr))" }}>
          {BILL_STATUSES.map(status => {
            const stageBills = filtered.filter(b => b.status === status);
            const sc = BILL_STATUS_COLORS[status];
            return (
              <div key={status} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{BILL_STATUS_LABELS[status]}</span>
                  <span style={{ background: sc.bg, color: sc.text, borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{stageBills.length}</span>
                </div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 600 }}>{fmt(stageBills.reduce((s,b)=>s+b.amount,0))}</div>
                {stageBills.map(b => {
                  const job = jobs.find(j => j.id === b.jobId);
                  return (
                    <div key={b.id} className="kanban-card" onClick={() => openEdit(b)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{b.supplier}</div>
                          {b.invoiceNo && <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: 10 }}>{b.invoiceNo}</span>}
                        </div>
                        <div style={{ fontWeight: 800, color: "#111", fontSize: 13, flexShrink: 0 }}>{fmt(b.amount)}</div>
                      </div>
                      {b.description && <div style={{ color: "#777", marginTop: 3, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.description}</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <span className="chip" style={{ fontSize: 10 }}>{b.category}</span>
                          {job ? <span style={{ fontSize: 10, color: "#888" }}>{job.title}</span> : <span style={{ fontSize: 10, color: "#ccc" }}>Unlinked</span>}
                        </div>
                        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                          {status === "inbox" && <button className="btn btn-secondary btn-xs" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}>Link →</button>}
                          {canApprove && status === "linked" && <button className="btn btn-secondary btn-xs" style={{ color: "#1e7e34" }} onClick={() => setStatus(b.id, "approved")}>✓</button>}
                          {canApprove && status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setPostBill(b)}>Post →</button>}
                          {canDelete && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(b.id)}><Icon name="trash" size={10} /></button>}
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
            <div style={{ display: "flex", gap: 20, marginBottom: 12, fontSize: 13, padding: "10px 16px", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0", flexWrap: "wrap" }}>
              <span style={{ color: "#888" }}>Showing <strong style={{ color: "#111" }}>{filtered.length}</strong> bills</span>
              <span style={{ color: "#888" }}>Total <strong style={{ color: "#111" }}>{fmt(filtered.reduce((s,b)=>s+b.amount,0))}</strong></span>
              <span style={{ color: "#888" }}>Ex-GST <strong style={{ color: "#111" }}>{fmt(filtered.reduce((s,b)=>s+(b.hasGst?b.amount/1.1:b.amount),0))}</strong></span>
              {selectedIds.length > 0 && <span style={{ marginLeft: "auto", color: "#2c5fa8", fontWeight: 600 }}>{selectedIds.length} selected · {fmt(bills.filter(b=>selectedIds.includes(b.id)).reduce((s,b)=>s+b.amount,0))}</span>}
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
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
                    const exGst = b.hasGst ? b.amount / 1.1 : b.amount;
                    const gst = b.amount - exGst;
                    const onCharge = exGst * (1 + (b.markup||0) / 100);
                    return (
                      <tr key={b.id} style={{ background: selectedIds.includes(b.id) ? "#f5f8ff" : "transparent" }}>
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.includes(b.id)} onChange={() => toggleSelect(b.id)} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier}</div>
                          {b.notes && <div style={{ fontSize: 10, color: "#aaa", marginTop: 1, fontStyle: "italic" }}>{b.notes.slice(0,40)}{b.notes.length>40?"…":""}</div>}
                        </td>
                        <td><span style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}>{b.invoiceNo||"—"}</span></td>
                        <td>
                          {job ? <div style={{ fontSize: 12 }}>{job.title}</div> : <span style={{ color: "#ccc", fontSize: 12 }}>Unlinked</span>}
                        </td>
                        <td><span className="chip">{b.category}</span></td>
                        <td style={{ fontSize: 12, color: "#999" }}>{b.date}</td>
                        <td style={{ fontSize: 13 }}>{fmt(exGst)}</td>
                        <td style={{ fontSize: 12, color: "#999" }}>{b.hasGst ? fmt(gst) : <span style={{ color: "#ddd" }}>—</span>}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(b.amount)}</td>
                        <td style={{ fontSize: 12 }}>
                          {b.markup > 0 ? <span style={{ color: "#555" }}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span> : <span style={{ color: "#ddd" }}>—</span>}
                        </td>
                        <td><BillStatusBadge status={b.status} /> <XeroSyncBadge syncStatus={b.xeroSyncStatus} xeroId={b.xeroBillId} /></td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                            {b.status === "inbox"    && <button className="btn btn-ghost btn-xs" title="Link" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}><Icon name="arrow_right" size={11} /></button>}
                            {canApprove && b.status === "linked"   && <button className="btn btn-ghost btn-xs" style={{ color: "#1e7e34" }} title="Approve" onClick={() => setStatus(b.id, "approved")}><Icon name="check" size={11} /></button>}
                            {canApprove && b.status === "approved" && <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.bills.accent }} title="Post to Job" onClick={() => setPostBill(b)}>Post →</button>}
                            {!b.xeroBillId && (b.status === "approved" || b.status === "posted") && <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} title="Send to Xero" onClick={() => xeroSyncBill("push", b.id)}><Icon name="send" size={11} /></button>}
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(b)}><Icon name="edit" size={11} /></button>
                            {canDelete && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(b.id)}><Icon name="trash" size={11} /></button>}
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

export default Bills;
