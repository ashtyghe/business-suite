import { useState, useRef, memo } from "react";
import { useAppStore } from "../lib/store";
import { fmt, daysUntil, COMPLIANCE_DOC_TYPES, COMPLIANCE_STATUS_COLORS, getComplianceStatus, getDaysUntilExpiry, getContractorComplianceCount, hexToRgba } from "../utils/helpers";
import { Icon } from "../components/Icon";
import { StatusBadge, OrderStatusBadge, SectionDrawer, BILL_STATUS_LABELS } from "../components/shared";
import { ORDER_TERMINAL, SECTION_COLORS, ViewField, CONTRACTOR_TRADES, STATUS_COLORS } from "../fixtures/seedData.jsx";
import { extractDocumentFromImage, sendEmail } from "../lib/supabase";
import { createContractor, updateContractor, deleteContractor as dbDeleteContractor, createContractorDoc, updateContractorDoc, deleteContractorDoc } from "../lib/db";
import s from './Contractors.module.css';

const Contractors = () => {
  const { contractors, setContractors, workOrders, bills, sectionView: rawView, setSectionView: setView } = useAppStore();
  const view = rawView === "kanban" ? "list" : rawView;
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [mode, setMode] = useState("edit");
  const [form, setForm] = useState({ name: "", contact: "", email: "", phone: "", trade: "Other", abn: "", notes: "" });
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState("all");
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
    return matchSearch && matchTrade;
  });
  const trades = [...new Set(contractors.map(c => c.trade).filter(Boolean))].sort();

  const openNew = () => { setEditItem(null); setMode("edit"); setForm({ name: "", contact: "", email: "", phone: "", trade: "Other", abn: "", notes: "" }); setShowDocForm(false); setShowModal(true); };
  const openEdit = (c) => { setEditItem(c); setMode("view"); setForm(c); setShowDocForm(false); setShowModal(true); };
  const save = async () => {
    try {
      if (editItem) {
        await updateContractor(editItem.id, form);
        setContractors(cs => cs.map(c => c.id === editItem.id ? { ...c, ...form } : c));
      } else {
        const saved = await createContractor(form);
        setContractors(cs => [...cs, { ...saved, documents: [] }]);
      }
      setShowModal(false);
    } catch (err) {
      console.error('Failed to save contractor:', err);
      alert('Failed to save contractor: ' + err.message);
    }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this contractor?")) return;
    try {
      await dbDeleteContractor(id);
      setContractors(cs => cs.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to delete contractor:', err);
      alert('Failed to delete contractor: ' + err.message);
    }
  };
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

  const saveDoc = async () => {
    const contractorId = editItem?.id;
    if (!contractorId) return;
    try {
      let savedDoc;
      if (editDoc) {
        savedDoc = await updateContractorDoc(editDoc.id, { ...docForm, docType: docForm.type }, contractorId);
      } else {
        savedDoc = await createContractorDoc(contractorId, { ...docForm, docType: docForm.type });
      }
      setContractors(cs => cs.map(c => {
        if (c.id !== contractorId) return c;
        const docs = [...(c.documents || [])];
        if (editDoc) {
          const idx = docs.findIndex(d => d.id === editDoc.id);
          if (idx >= 0) docs[idx] = savedDoc;
        } else {
          docs.push(savedDoc);
        }
        const updated = { ...c, documents: docs };
        setEditItem(updated);
        setForm(updated);
        return updated;
      }));
    } catch (err) {
      console.error('Failed to save document:', err);
    }
    setShowDocForm(false);
  };

  const deleteDoc = async (docId) => {
    if (!editItem || !window.confirm("Delete this document?")) return;
    try {
      await deleteContractorDoc(docId);
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
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
    if (issues === 0) return <span className={`badge ${s.badgeCompliant}`}>Compliant</span>;
    return <span className={`badge ${s.badgeIssues}`}>{issues} issue{issues > 1 ? "s" : ""}</span>;
  };

  return (
    <div>
      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contractors..." />
        </div>
        <select className={`form-control ${s.autoWidth}`} value={filterTrade} onChange={e => setFilterTrade(e.target.value)}>
          <option value="all">All Trades</option>
          {CONTRACTOR_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
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
                  <tr key={c.id} className={s.rowPointer} onClick={() => openEdit(c)}>
                    <td className={s.nameCell}>{c.name}</td>
                    <td>{c.contact || "—"}<div className={s.contactSub}>{c.phone}</div></td>
                    <td><span className={`chip ${s.chipSmall}`}>{c.trade}</span></td>
                    <td><ComplianceBadge contractor={c} /></td>
                    <td><span className={s.countActive} style={{ color: getActiveWOs(c).length > 0 ? accent : "#ccc" }}>{getActiveWOs(c).length}</span></td>
                    <td><span className={s.countActive} style={{ color: billCount > 0 ? SECTION_COLORS.bills.accent : "#ccc" }}>{billCount}</span></td>
                    <td className={billTotal > 0 ? s.billTotalCellActive : s.billTotalCell}>{billTotal > 0 ? fmt(billTotal) : "—"}</td>
                    <td onClick={e => e.stopPropagation()}><button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(c.id)}><Icon name="trash" size={12} /></button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && (
        <div className={s.gridLayout}>
          {filtered.length === 0 && <div className={`empty-state ${s.gridFullSpan}`}><div className="empty-state-icon">🏗️</div><div className="empty-state-text">No contractors found</div></div>}
          {filtered.map(c => {
            const activeWOs = getActiveWOs(c);
            const billCount = getContractorBills(c).length;
            const billTotal = getBillTotal(c);
            return (
              <div key={c.id} className={`card ${s.gridCard}`} onClick={() => openEdit(c)}>
                <div className={s.gridCardHeader}>
                  <span className={s.gridCardName}>{c.name}</span>
                  <div className={s.gridCardBadges}>
                    <ComplianceBadge contractor={c} />
                    <span className={`chip ${s.chipSmall}`} style={{ background: hexToRgba(accent, 0.12), color: accent }}>{c.trade}</span>
                  </div>
                </div>
                {c.contact && <div className={s.gridContact}>{c.contact}</div>}
                {c.email && <div className={s.gridEmail}>{c.email}</div>}
                {c.phone && <div className={s.gridPhone}>{c.phone}</div>}
                <div className={s.gridFooter} style={{ marginBottom: billCount > 0 ? 8 : 0 }}>
                  <div className={s.gridChips}>
                    <span className={`chip ${s.chipSmall}`}>{getWOCount(c)} WO{getWOCount(c) !== 1 ? "s" : ""} · {activeWOs.length} active</span>
                    {billCount > 0 && <span className={`chip ${s.chipSmall}`}>{billCount} bill{billCount !== 1 ? "s" : ""}</span>}
                  </div>
                  <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={e => { e.stopPropagation(); del(c.id); }}><Icon name="trash" size={12} /></button>
                </div>
                {billTotal > 0 && <div className={s.gridBillTotal}>Bills total: <span className={s.gridBillAmount}>{fmt(billTotal)}</span></div>}
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
              <div className={s.drawerFooter}>
                {mode === "edit" && <button className="btn btn-primary" style={{ background: accent }} onClick={save}><Icon name="check" size={14} />{isNew ? "Create" : "Save"}</button>}
              </div>
            }
          >
            <div className={s.drawerBody}>
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
                    <div className={s.linkedSection}>
                      <div className={s.sectionLabel}>Linked Work Orders</div>
                      {linkedWOs.map(wo => (
                        <div key={wo.id} className={s.linkedRow}>
                          <span className={s.linkedBold}>{wo.ref}</span>
                          <OrderStatusBadge status={wo.status} />
                          {wo.dueDate && <span className={s.linkedDate}>{wo.dueDate}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {linkedBills.length > 0 && (
                    <div className={s.linkedSection}>
                      <div className={s.billsHeader}>
                        <div className={s.sectionLabel} style={{ marginBottom: 0 }}>Bills</div>
                        <span className={s.billsTotal}>{fmt(linkedBillTotal)}</span>
                      </div>
                      {linkedBills.map(b => {
                        const bsc = BILL_STATUS_COLORS[b.status] || { bg: "#f0f0f0", text: "#666" };
                        return (
                        <div key={b.id} className={s.billRow}>
                          <div className={s.billRowTop}>
                            <div>
                              <span className={s.linkedBold}>{b.supplier}</span>
                              {b.invoiceNo && <span className={s.billInvoiceNo}>{b.invoiceNo}</span>}
                            </div>
                            <span className={s.billAmount}>{fmt(b.amount)}</span>
                          </div>
                          <div className={s.billRowBottom}>
                            <div className={s.billRowMeta}>
                              <span className={`badge ${s.billBadge}`} style={{ background: bsc.bg, color: bsc.text }}>{BILL_STATUS_LABELS[b.status] || b.status}</span>
                              <span className={`chip ${s.chipSmall}`}>{b.category}</span>
                            </div>
                            <span className={s.billDate}>{b.date}</span>
                          </div>
                          {b.description && <div className={s.billDesc}>{b.description}</div>}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Compliance Documents */}
                  <div className={s.complianceSection}>
                    {compEmailStatus && <div className={`${s.complianceAlert} ${compEmailStatus.type === "success" ? s.complianceAlertSuccess : s.complianceAlertError}`}>{compEmailStatus.msg}</div>}
                    <div className={s.complianceHeader}>
                      <div className={s.sectionLabel} style={{ marginBottom: 0 }}>Compliance Documents</div>
                      <ComplianceBadge contractor={editItem} />
                    </div>
                    {COMPLIANCE_DOC_TYPES.map(dt => {
                      const doc = docs.find(d => d.type === dt.id);
                      const status = getComplianceStatus(doc);
                      const sc = COMPLIANCE_STATUS_COLORS[status];
                      const days = doc?.expiryDate ? getDaysUntilExpiry(doc.expiryDate) : null;
                      return (
                        <div key={dt.id} className={s.docRow} style={{ borderLeft: `3px solid ${sc.text}` }} onClick={() => openDocForm(dt.id, doc)}>
                          <div className={s.docRowTop} style={{ marginBottom: doc ? 6 : 0 }}>
                            <div className={s.docRowLeft}>
                              <span className={s.docLabel}>{dt.label}</span>
                              <span className={`badge ${s.billBadge}`} style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                            </div>
                            <div className={s.docRowRight}>
                              {doc && (status === "expired" || status === "expiring_soon") && <button className={`btn btn-ghost btn-xs ${s.reminderBtn}`} disabled={compEmailSending === doc.id} onClick={e => { e.stopPropagation(); handleSendComplianceReminder(editItem, doc, dt); }} title="Send Reminder"><Icon name="send" size={10} />{compEmailSending === doc.id ? "..." : ""}</button>}
                              {doc && <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }}><Icon name="trash" size={10} /></button>}
                            </div>
                          </div>
                          {doc && (
                            <div className={s.docDetails}>
                              {doc.policyNumber && <div>Policy: <span className={s.docDetailValue}>{doc.policyNumber}</span></div>}
                              {doc.licenseNumber && <div>License: <span className={s.docDetailValue}>{doc.licenseNumber}</span></div>}
                              {doc.cardNumber && <div>Card: <span className={s.docDetailValue}>{doc.cardNumber}</span></div>}
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
                          {!doc && <div className={s.docNotUploaded}>Not uploaded</div>}
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
          <div className={s.docModalOverlay} onClick={() => setShowDocForm(false)}>
            <div className={s.docModalContent} onClick={e => e.stopPropagation()}>
              <div className={s.docModalHeader}>
                <span className={s.docModalTitle}>{editDoc ? "Edit" : "Add"} {dt?.label || "Document"}</span>
                <button className="btn btn-ghost btn-xs" onClick={() => setShowDocForm(false)}><Icon name="close" size={14} /></button>
              </div>
              <div className={s.docModalBody}>
                {/* AI Capture */}
                <div className={s.dropZone}
                  onClick={() => docFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && (f.type.startsWith("image/") || f.type === "application/pdf")) handleDocFile(f); }}
                >
                  <input ref={docFileRef} type="file" accept="image/*,application/pdf" capture="environment" className={s.dropZoneHidden} onChange={e => { const f = e.target.files?.[0]; if (f) handleDocFile(f); }} />
                  {docExtracting ? (
                    <div className={s.extractingSpinner}>
                      <div className={s.spinner} style={{ borderTopColor: accent }} />
                      <span className={s.extractingText}>Extracting document details...</span>
                    </div>
                  ) : docImagePreview ? (
                    <div>
                      <img src={docImagePreview} alt="Document" className={s.previewImg} />
                      <div className={s.previewReplace}>Tap to replace</div>
                    </div>
                  ) : (
                    <div className={s.dropZoneIcon}>
                      <div className={s.dropZoneIconEmoji}>📷</div>
                      <div className={s.dropZoneText}>Take photo or upload document</div>
                      <div className={s.dropZoneSub}>AI will extract key details</div>
                    </div>
                  )}
                </div>
                {docExtractError && <div className={s.extractError}>{docExtractError}</div>}

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
              <div className={s.docModalFooter}>
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


export default memo(Contractors);
