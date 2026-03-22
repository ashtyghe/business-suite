import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "../lib/store";
import { fmt, daysUntil, COMPLIANCE_DOC_TYPES, COMPLIANCE_STATUS_COLORS, getComplianceStatus, getDaysUntilExpiry, getContractorComplianceCount, hexToRgba } from "../utils/helpers";
import { Icon } from "../components/Icon";
import { StatusBadge, OrderStatusBadge, SectionDrawer, BILL_STATUS_LABELS } from "../components/shared";
import { ORDER_TERMINAL, SECTION_COLORS, ViewField, CONTRACTOR_TRADES, STATUS_COLORS } from "../fixtures/seedData.jsx";
import { extractDocumentFromImage, sendEmail } from "../lib/supabase";

const Contractors = () => {
  const { contractors, setContractors, workOrders, bills } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [mode, setMode] = useState("edit");
  const [form, setForm] = useState({ name: "", contact: "", email: "", phone: "", trade: "Other", abn: "", notes: "" });
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState("all");
  const [filterCompliance, setFilterCompliance] = useState("all");
  const [view, setView] = useState("list");
  const [showDocForm, setShowDocForm] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [docForm, setDocForm] = useState({ type: "workers_comp" });
  const [docImagePreview, setDocImagePreview] = useState(null);
  const [docExtracting, setDocExtracting] = useState(false);
  const [docExtractError, setDocExtractError] = useState(null);
  const [compEmailSending, setCompEmailSending] = useState(null);
  const [compEmailStatus, setCompEmailStatus] = useState(null);
  const docFileRef = useRef(null);

  const handleSendComplianceReminder = async (contractor, doc, docType) => {
    if (!contractor.email) { alert("No email address for this contractor. Please add one first."); return; }
    const days = doc?.expiryDate ? getDaysUntilExpiry(doc.expiryDate) : null;
    if (!window.confirm(`Send compliance reminder to ${contractor.name} (${contractor.email}) about ${docType.label}?`)) return;
    setCompEmailSending(doc.id); setCompEmailStatus(null);
    try {
      await sendEmail("compliance_expiry", contractor.email, { contractorName: contractor.name, docType: docType.label, expiryDate: doc.expiryDate, daysUntil: days });
      setCompEmailStatus({ type: "success", msg: `Reminder sent to ${contractor.email}`, docId: doc.id });
      setTimeout(() => setCompEmailStatus(null), 4000);
    } catch (err) {
      setCompEmailStatus({ type: "error", msg: err.message || "Failed to send", docId: doc.id });
    } finally { setCompEmailSending(null); }
  };

  const filtered = contractors.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !search || c.name.toLowerCase().includes(q) || (c.contact || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.trade || "").toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q) || (c.abn || "").toLowerCase().includes(q) || (c.notes || "").toLowerCase().includes(q) || (c.complianceDocs || []).some(d => (d.name || d.type || "").toLowerCase().includes(q));
    const matchTrade = filterTrade === "all" || c.trade === filterTrade;
    if (!matchSearch || !matchTrade) return false;
    if (filterCompliance === "all") return true;
    const issues = getContractorComplianceCount(c);
    if (filterCompliance === "compliant") return issues === 0;
    if (filterCompliance === "issues") return issues > 0;
    return true;
  });
  const trades = [...new Set(contractors.map(c => c.trade).filter(Boolean))].sort();

  const openNew = () => { setEditItem(null); setMode("edit"); setForm({ name: "", contact: "", email: "", phone: "", trade: "Other", abn: "", notes: "" }); setShowDocForm(false); setShowModal(true); };
  const openEdit = (c) => { setEditItem(c); setMode("view"); setForm(c); setShowDocForm(false); setShowModal(true); };
  const save = () => {
    if (editItem) {
      setContractors(cs => cs.map(c => c.id === editItem.id ? { ...c, ...form } : c));
    } else {
      setContractors(cs => [...cs, { ...form, id: "c" + Date.now(), documents: [] }]);
    }
    setShowModal(false);
  };
  const del = (id) => { if (window.confirm("Delete this contractor?")) setContractors(cs => cs.filter(c => c.id !== id)); };
  const accent = SECTION_COLORS.contractors.accent;

  const getWOCount = (c) => workOrders.filter(wo => wo.contractorName === c.name || wo.contractorId === c.id).length;
  const getActiveWOs = (c) => workOrders.filter(wo => (wo.contractorName === c.name || wo.contractorId === c.id) && !ORDER_TERMINAL.includes(wo.status));
  const getContractorBills = (c) => bills.filter(b => b.supplier === c.name);
  const getBillTotal = (c) => getContractorBills(c).reduce((s, b) => s + (b.amount || 0), 0);

  // Document management
  const openDocForm = (docType, existingDoc) => {
    if (existingDoc) {
      setEditDoc(existingDoc);
      setDocForm({ ...existingDoc });
    } else {
      setEditDoc(null);
      setDocForm({ type: docType });
    }
    setDocImagePreview(null);
    setDocExtractError(null);
    setShowDocForm(true);
  };

  const saveDoc = () => {
    const contractorId = editItem?.id;
    if (!contractorId) return;
    setContractors(cs => cs.map(c => {
      if (c.id !== contractorId) return c;
      const docs = [...(c.documents || [])];
      if (editDoc) {
        const idx = docs.findIndex(d => d.id === editDoc.id);
        if (idx >= 0) docs[idx] = { ...docForm, id: editDoc.id };
      } else {
        docs.push({ ...docForm, id: "d" + Date.now(), uploadedAt: new Date().toISOString().slice(0, 10) });
      }
      const updated = { ...c, documents: docs };
      setEditItem(updated);
      setForm(updated);
      return updated;
    }));
    setShowDocForm(false);
  };

  const deleteDoc = (docId) => {
    if (!editItem || !window.confirm("Delete this document?")) return;
    setContractors(cs => cs.map(c => {
      if (c.id !== editItem.id) return c;
      const updated = { ...c, documents: (c.documents || []).filter(d => d.id !== docId) };
      setEditItem(updated);
      setForm(updated);
      return updated;
    }));
  };

  const handleDocFile = async (file) => {
    if (!file) return;
    setDocExtractError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setDocImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      setDocExtracting(true);
      try {
        const data = await extractDocumentFromImage(base64, mimeType, docForm.type);
        if (data) {
          setDocForm(f => ({ ...f, ...data }));
        } else {
          setDocExtractError("AI extraction not available — fill in manually.");
        }
      } catch (err) {
        setDocExtractError(err.message || "Extraction failed — fill in manually.");
      } finally {
        setDocExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const ComplianceBadge = ({ contractor }) => {
    const issues = getContractorComplianceCount(contractor);
    if (issues === 0) return <span className="badge" style={{ background: "#ecfdf5", color: "#059669", fontSize: 10 }}>Compliant</span>;
    return <span className="badge" style={{ background: "#fef2f2", color: "#dc2626", fontSize: 10 }}>{issues} issue{issues > 1 ? "s" : ""}</span>;
  };

  return (
    <div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contractors..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterTrade} onChange={e => setFilterTrade(e.target.value)}>
          <option value="all">All Trades</option>
          {CONTRACTOR_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="form-control" style={{ width: "auto" }} value={filterCompliance} onChange={e => setFilterCompliance(e.target.value)}>
          <option value="all">All Compliance</option>
          <option value="compliant">Compliant</option>
          <option value="issues">Has Issues</option>
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: accent }} onClick={openNew}><Icon name="plus" size={14} />New Contractor</button></div>
      </div>

      {view === "list" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Trade</th><th>Compliance</th><th>Active WOs</th><th>Bills</th><th>Bill Total</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">🏗️</div><div className="empty-state-text">No contractors found</div></div></td></tr>}
                {filtered.map(c => {
                  const billCount = getContractorBills(c).length;
                  const billTotal = getBillTotal(c);
                  const compIssues = getContractorComplianceCount(c);
                  return (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => openEdit(c)}>
                    <td style={{ fontWeight: 700 }}>{c.name}</td>
                    <td>{c.contact || "—"}<div style={{ fontSize: 11, color: "#999" }}>{c.phone}</div></td>
                    <td><span className="chip" style={{ fontSize: 10 }}>{c.trade}</span></td>
                    <td><ComplianceBadge contractor={c} /></td>
                    <td><span style={{ fontWeight: 600, color: getActiveWOs(c).length > 0 ? accent : "#ccc" }}>{getActiveWOs(c).length}</span></td>
                    <td><span style={{ fontWeight: 600, color: billCount > 0 ? SECTION_COLORS.bills.accent : "#ccc" }}>{billCount}</span></td>
                    <td style={{ fontWeight: billTotal > 0 ? 600 : 400, color: billTotal > 0 ? "#111" : "#ccc" }}>{billTotal > 0 ? fmt(billTotal) : "—"}</td>
                    <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(c.id)}><Icon name="trash" size={12} /></button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">🏗️</div><div className="empty-state-text">No contractors found</div></div>}
          {filtered.map(c => {
            const activeWOs = getActiveWOs(c);
            const billCount = getContractorBills(c).length;
            const billTotal = getBillTotal(c);
            return (
              <div key={c.id} className="card" onClick={() => openEdit(c)} style={{ cursor: "pointer", padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <ComplianceBadge contractor={c} />
                    <span className="chip" style={{ fontSize: 10, background: hexToRgba(accent, 0.12), color: accent }}>{c.trade}</span>
                  </div>
                </div>
                {c.contact && <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{c.contact}</div>}
                {c.email && <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{c.email}</div>}
                {c.phone && <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>{c.phone}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: billCount > 0 ? 8 : 0 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span className="chip" style={{ fontSize: 10 }}>{getWOCount(c)} WO{getWOCount(c) !== 1 ? "s" : ""} · {activeWOs.length} active</span>
                    {billCount > 0 && <span className="chip" style={{ fontSize: 10 }}>{billCount} bill{billCount !== 1 ? "s" : ""}</span>}
                  </div>
                  <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={e => { e.stopPropagation(); del(c.id); }}><Icon name="trash" size={12} /></button>
                </div>
                {billTotal > 0 && <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>Bills total: <span style={{ color: "#111" }}>{fmt(billTotal)}</span></div>}
              </div>
            );
          })}
        </div>
      )}

      {view === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${trades.length || 1}, minmax(200px,1fr))` }}>
          {(trades.length > 0 ? trades : ["Other"]).map(trade => {
            const colItems = filtered.filter(c => c.trade === trade);
            return (
              <div key={trade} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{trade}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colItems.length}</span>
                </div>
                {colItems.map(c => {
                  const activeWOs = getActiveWOs(c);
                  const billCount = getContractorBills(c).length;
                  return (
                    <div key={c.id} className="kanban-card" onClick={() => openEdit(c)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{c.name}</div>
                        <ComplianceBadge contractor={c} />
                      </div>
                      {c.contact && <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>{c.contact}</div>}
                      {c.phone && <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{c.phone}</div>}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {activeWOs.length > 0 && <span className="chip" style={{ fontSize: 10 }}>{activeWOs.length} active WO{activeWOs.length > 1 ? "s" : ""}</span>}
                        {billCount > 0 && <span className="chip" style={{ fontSize: 10 }}>{billCount} bill{billCount > 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (() => {
        const isNew = !editItem;
        const linkedWOs = editItem ? workOrders.filter(wo => wo.contractorName === editItem.name || wo.contractorId === editItem.id) : [];
        const linkedBills = editItem ? bills.filter(b => b.supplier === editItem.name) : [];
        const linkedBillTotal = linkedBills.reduce((s, b) => s + (b.amount || 0), 0);
        const docs = editItem?.documents || [];
        return (
          <SectionDrawer
            accent={accent}
            icon={<Icon name="contractors" size={16} />}
            typeLabel="Contractor"
            title={editItem ? editItem.name : "New Contractor"}
            mode={mode} setMode={setMode}
            showToggle={!isNew} isNew={isNew}
            onClose={() => { setShowModal(false); setShowDocForm(false); }}
            footer={
              <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {mode === "edit" && <button className="btn btn-primary" style={{ background: accent }} onClick={save}><Icon name="check" size={14} />{isNew ? "Create" : "Save"}</button>}
              </div>
            }
          >
            <div style={{ padding: 20 }}>
              {mode === "view" ? (
                <>
                  <ViewField label="Name" value={form.name} />
                  <ViewField label="Contact Person" value={form.contact} />
                  <ViewField label="Email" value={form.email} />
                  <ViewField label="Phone" value={form.phone} />
                  <ViewField label="Trade" value={form.trade} />
                  <ViewField label="ABN" value={form.abn} />
                  <ViewField label="Notes" value={form.notes} />

                  {linkedWOs.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Linked Work Orders</div>
                      {linkedWOs.map(wo => (
                        <div key={wo.id} style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <span style={{ fontWeight: 700 }}>{wo.ref}</span>
                          <OrderStatusBadge status={wo.status} />
                          {wo.dueDate && <span style={{ float: "right", color: "#888" }}>{wo.dueDate}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {linkedBills.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Bills</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{fmt(linkedBillTotal)}</span>
                      </div>
                      {linkedBills.map(b => {
                        const bsc = BILL_STATUS_COLORS[b.status] || { bg: "#f0f0f0", text: "#666" };
                        return (
                        <div key={b.id} style={{ padding: "10px 12px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <div>
                              <span style={{ fontWeight: 700 }}>{b.supplier}</span>
                              {b.invoiceNo && <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: 11, marginLeft: 8 }}>{b.invoiceNo}</span>}
                            </div>
                            <span style={{ fontWeight: 700 }}>{fmt(b.amount)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span className="badge" style={{ background: bsc.bg, color: bsc.text, fontSize: 10 }}>{BILL_STATUS_LABELS[b.status] || b.status}</span>
                              <span className="chip" style={{ fontSize: 10 }}>{b.category}</span>
                            </div>
                            <span style={{ fontSize: 11, color: "#999" }}>{b.date}</span>
                          </div>
                          {b.description && <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>{b.description}</div>}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Compliance Documents */}
                  <div style={{ marginTop: 24 }}>
                    {compEmailStatus && <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600, background: compEmailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: compEmailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${compEmailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{compEmailStatus.msg}</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Compliance Documents</div>
                      <ComplianceBadge contractor={editItem} />
                    </div>
                    {COMPLIANCE_DOC_TYPES.map(dt => {
                      const doc = docs.find(d => d.type === dt.id);
                      const status = getComplianceStatus(doc);
                      const sc = COMPLIANCE_STATUS_COLORS[status];
                      const days = doc?.expiryDate ? getDaysUntilExpiry(doc.expiryDate) : null;
                      return (
                        <div key={dt.id} style={{ padding: "12px 14px", background: "#f8f8f8", borderRadius: 8, marginBottom: 8, borderLeft: `3px solid ${sc.text}`, cursor: "pointer" }} onClick={() => openDocForm(dt.id, doc)}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: doc ? 6 : 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{dt.label}</span>
                              <span className="badge" style={{ background: sc.bg, color: sc.text, fontSize: 10 }}>{sc.label}</span>
                            </div>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              {doc && (status === "expired" || status === "expiring_soon") && <button className="btn btn-ghost btn-xs" style={{ color: "#d97706" }} disabled={compEmailSending === doc.id} onClick={e => { e.stopPropagation(); handleSendComplianceReminder(editItem, doc, dt); }} title="Send Reminder"><Icon name="send" size={10} />{compEmailSending === doc.id ? "..." : ""}</button>}
                              {doc && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }}><Icon name="trash" size={10} /></button>}
                            </div>
                          </div>
                          {doc && (
                            <div style={{ fontSize: 11, color: "#666" }}>
                              {doc.policyNumber && <div>Policy: <span style={{ fontWeight: 600, color: "#333" }}>{doc.policyNumber}</span></div>}
                              {doc.licenseNumber && <div>License: <span style={{ fontWeight: 600, color: "#333" }}>{doc.licenseNumber}</span></div>}
                              {doc.cardNumber && <div>Card: <span style={{ fontWeight: 600, color: "#333" }}>{doc.cardNumber}</span></div>}
                              {doc.insurer && <div>Insurer: {doc.insurer}</div>}
                              {doc.coverAmount && <div>Cover: {doc.coverAmount}</div>}
                              {doc.licenseClass && <div>Class: {doc.licenseClass}</div>}
                              {doc.issuingBody && <div>Issued by: {doc.issuingBody}</div>}
                              {doc.holderName && <div>Holder: {doc.holderName}</div>}
                              {doc.title && <div>Title: {doc.title}</div>}
                              {doc.revision && <div>Revision: {doc.revision}</div>}
                              {doc.approvedBy && <div>Approved by: {doc.approvedBy}</div>}
                              {doc.expiryDate && (
                                <div style={{ marginTop: 4, fontWeight: 600, color: status === "expired" ? "#dc2626" : status === "expiring_soon" ? "#d97706" : "#059669" }}>
                                  Expires: {doc.expiryDate} {days !== null && `(${days < 0 ? Math.abs(days) + "d overdue" : days + "d remaining"})`}
                                </div>
                              )}
                              {doc.periodFrom && doc.periodTo && <div>Period: {doc.periodFrom} to {doc.periodTo}</div>}
                              {doc.issueDate && <div>Issued: {doc.issueDate}</div>}
                              {doc.approvalDate && <div>Approved: {doc.approvalDate}</div>}
                            </div>
                          )}
                          {!doc && <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>Not uploaded</div>}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="form-group"><label>Contact Person</label><input className="form-control" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
                  <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div className="form-group"><label>Trade</label><select className="form-control" value={form.trade} onChange={e => setForm(f => ({ ...f, trade: e.target.value }))}>{CONTRACTOR_TRADES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div className="form-group"><label>ABN</label><input className="form-control" value={form.abn} onChange={e => setForm(f => ({ ...f, abn: e.target.value }))} /></div>
                  <div className="form-group"><label>Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                </>
              )}
            </div>
          </SectionDrawer>
        );
      })()}

      {/* Document Add/Edit Modal */}
      {showDocForm && (() => {
        const dt = COMPLIANCE_DOC_TYPES.find(t => t.id === docForm.type);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowDocForm(false)}>
            <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e8e8e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{editDoc ? "Edit" : "Add"} {dt?.label || "Document"}</span>
                <button className="btn btn-ghost btn-xs" onClick={() => setShowDocForm(false)}><Icon name="close" size={14} /></button>
              </div>
              <div style={{ padding: 20 }}>
                {/* AI Capture */}
                <div style={{ marginBottom: 16, padding: 16, border: "2px dashed #d0d0d0", borderRadius: 8, textAlign: "center", background: "#fafafa", cursor: "pointer" }}
                  onClick={() => docFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && (f.type.startsWith("image/") || f.type === "application/pdf")) handleDocFile(f); }}
                >
                  <input ref={docFileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleDocFile(f); }} />
                  {docExtracting ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 12 }}>
                      <div style={{ width: 24, height: 24, border: "3px solid #e8e8e8", borderTopColor: accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      <span style={{ fontSize: 12, color: "#888" }}>Extracting document details...</span>
                    </div>
                  ) : docImagePreview ? (
                    <div>
                      <img src={docImagePreview} alt="Document" style={{ maxWidth: "100%", maxHeight: 120, borderRadius: 6, marginBottom: 8 }} />
                      <div style={{ fontSize: 11, color: "#888" }}>Tap to replace</div>
                    </div>
                  ) : (
                    <div style={{ padding: 8 }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
                      <div style={{ fontSize: 12, color: "#888" }}>Take photo or upload document</div>
                      <div style={{ fontSize: 11, color: "#bbb" }}>AI will extract key details</div>
                    </div>
                  )}
                </div>
                {docExtractError && <div style={{ fontSize: 11, color: "#d97706", background: "#fffbeb", padding: "6px 10px", borderRadius: 6, marginBottom: 12 }}>{docExtractError}</div>}

                {/* Document type selector (only for new) */}
                {!editDoc && (
                  <div className="form-group">
                    <label>Document Type</label>
                    <select className="form-control" value={docForm.type} onChange={e => setDocForm(f => ({ ...f, type: e.target.value }))}>
                      {COMPLIANCE_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                )}

                {/* Dynamic fields based on doc type */}
                {(docForm.type === "workers_comp" || docForm.type === "public_liability") && (
                  <>
                    <div className="form-group"><label>Policy Number</label><input className="form-control" value={docForm.policyNumber || ""} onChange={e => setDocForm(f => ({ ...f, policyNumber: e.target.value }))} /></div>
                    <div className="form-group"><label>Insurer</label><input className="form-control" value={docForm.insurer || ""} onChange={e => setDocForm(f => ({ ...f, insurer: e.target.value }))} /></div>
                    {docForm.type === "public_liability" && (
                      <div className="form-group"><label>Cover Amount</label><input className="form-control" value={docForm.coverAmount || ""} onChange={e => setDocForm(f => ({ ...f, coverAmount: e.target.value }))} /></div>
                    )}
                    <div className="form-group"><label>Expiry Date</label><input className="form-control" type="date" value={docForm.expiryDate || ""} onChange={e => setDocForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
                  </>
                )}
                {docForm.type === "white_card" && (
                  <>
                    <div className="form-group"><label>Card Number</label><input className="form-control" value={docForm.cardNumber || ""} onChange={e => setDocForm(f => ({ ...f, cardNumber: e.target.value }))} /></div>
                    <div className="form-group"><label>Holder Name</label><input className="form-control" value={docForm.holderName || ""} onChange={e => setDocForm(f => ({ ...f, holderName: e.target.value }))} /></div>
                    <div className="form-group"><label>Issue Date</label><input className="form-control" type="date" value={docForm.issueDate || ""} onChange={e => setDocForm(f => ({ ...f, issueDate: e.target.value }))} /></div>
                  </>
                )}
                {docForm.type === "trade_license" && (
                  <>
                    <div className="form-group"><label>License Number</label><input className="form-control" value={docForm.licenseNumber || ""} onChange={e => setDocForm(f => ({ ...f, licenseNumber: e.target.value }))} /></div>
                    <div className="form-group"><label>License Class</label><input className="form-control" value={docForm.licenseClass || ""} onChange={e => setDocForm(f => ({ ...f, licenseClass: e.target.value }))} /></div>
                    <div className="form-group"><label>Issuing Body</label><input className="form-control" value={docForm.issuingBody || ""} onChange={e => setDocForm(f => ({ ...f, issuingBody: e.target.value }))} /></div>
                    <div className="form-group"><label>Expiry Date</label><input className="form-control" type="date" value={docForm.expiryDate || ""} onChange={e => setDocForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
                  </>
                )}
                {docForm.type === "subcontractor_statement" && (
                  <>
                    <div className="form-group"><label>Period From</label><input className="form-control" type="date" value={docForm.periodFrom || ""} onChange={e => setDocForm(f => ({ ...f, periodFrom: e.target.value }))} /></div>
                    <div className="form-group"><label>Period To</label><input className="form-control" type="date" value={docForm.periodTo || ""} onChange={e => setDocForm(f => ({ ...f, periodTo: e.target.value }))} /></div>
                    <div className="form-group"><label>ABN</label><input className="form-control" value={docForm.abn || ""} onChange={e => setDocForm(f => ({ ...f, abn: e.target.value }))} /></div>
                  </>
                )}
                {docForm.type === "swms" && (
                  <>
                    <div className="form-group"><label>Title</label><input className="form-control" value={docForm.title || ""} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))} /></div>
                    <div className="form-group"><label>Revision</label><input className="form-control" value={docForm.revision || ""} onChange={e => setDocForm(f => ({ ...f, revision: e.target.value }))} /></div>
                    <div className="form-group"><label>Approved By</label><input className="form-control" value={docForm.approvedBy || ""} onChange={e => setDocForm(f => ({ ...f, approvedBy: e.target.value }))} /></div>
                    <div className="form-group"><label>Approval Date</label><input className="form-control" type="date" value={docForm.approvalDate || ""} onChange={e => setDocForm(f => ({ ...f, approvalDate: e.target.value }))} /></div>
                  </>
                )}
              </div>
              <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowDocForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" style={{ background: accent }} onClick={saveDoc}><Icon name="check" size={14} />{editDoc ? "Update" : "Add"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ── Suppliers ─────────────────────────────────────────────────────────────────


export default Contractors;
