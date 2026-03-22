import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { genId, orderToday, orderAddDays, orderFmtDate, daysUntil, fmtFileSize, orderFmtTs, makeLogEntry, orderAddLog, applyTransition, orderJobDisplay, ORDER_STATUS_TRIGGERS } from "../utils/helpers";
import { Icon } from "../components/Icon";
import { StatusBadge, OrderIcon, OrderStatusBadge, DueDateChip, OrderProgressBar, FileIconBadge, SectionDrawer } from "../components/shared";
import { ORDER_CONTRACTORS, ORDER_SUPPLIERS, ORDER_UNITS, ORDER_STATUSES, ORDER_TRANSITIONS, ORDER_TERMINAL, ORDER_ACTIVE, ORDER_BAR_COLORS, SECTION_COLORS } from "../fixtures/seedData.jsx";
import { sendEmail } from "../lib/supabase";
import { buildOrderPdfHtml, htmlToPdfBase64 } from "../lib/pdf";
import s from './OrderDrawer.module.css';

const OrderFileAttachments = ({ files, onChange, onMarkup, onLightbox }) => {
  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { onChange(prev => prev.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x)); };
        reader.readAsDataURL(m._file);
      }
    });
    onChange(prev => [...prev, ...mapped]);
    e.target.value = "";
  };
  return (
    <div className={s.fileAttachmentWrap}>
      {files.length > 0 && files.map(f => (
        <div key={f.id} className={s.fileRow}>
          {f.dataUrl ? <img src={f.dataUrl} alt={f.name} className={s.fileThumbnail} onClick={() => onLightbox && onLightbox(f.dataUrl)} />
            : <div className={s.fileIconWrap}><FileIconBadge name={f.name} /></div>}
          <div className={s.fileInfo}>
            <div className={s.fileName}>{f.name}</div>
            <div className={s.fileSize}>{fmtFileSize(f.size)}</div>
          </div>
          {f.dataUrl && f.type?.startsWith("image/") && onMarkup && <button onClick={() => onMarkup(f.dataUrl, f.id)} className={s.markupBtn} title="Mark up">✏️</button>}
          <button onClick={() => onChange(prev => prev.filter(x => x.id !== f.id))} className={s.removeBtn}>
            <OrderIcon name="x" size={14} />
          </button>
        </div>
      ))}
      <label className={s.uploadLabel}>
        <OrderIcon name="upload" size={16} />
        {files.length > 0 ? "Add more files" : "Attach files — drawings, specs, photos…"}
        <input type="file" multiple className={s.hiddenInput} onChange={handleFiles} accept="*/*" />
      </label>
    </div>
  );
};

const OrderLineItems = ({ lines, onChange }) => {
  const add = () => onChange([...lines, { id: genId(), desc: "", qty: "1", unit: "ea" }]);
  const remove = (id) => onChange(lines.filter(l => l.id !== id));
  const update = (id, field, val) => onChange(lines.map(l => l.id === id ? { ...l, [field]: val } : l));
  return (
    <div className={s.lineItemsWrap}>
      <div className={s.lineItemsHeader}>
        <span>Description</span><span>Qty</span><span>Unit</span><span></span>
      </div>
      {lines.map(l => (
        <div key={l.id} className={s.lineItemRow}>
          <input className={`form-control ${s.lineItemInput}`} placeholder="Description" value={l.desc} onChange={e => update(l.id, "desc", e.target.value)} />
          <input className={`form-control ${s.lineItemInput}`} type="number" min="0" placeholder="Qty" value={l.qty} onChange={e => update(l.id, "qty", e.target.value)} />
          <select className={`form-control ${s.lineItemInput}`} value={l.unit} onChange={e => update(l.id, "unit", e.target.value)}>
            {ORDER_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
          <button onClick={() => remove(l.id)} className={s.removeBtn}><OrderIcon name="x" size={14} /></button>
        </div>
      ))}
      <button onClick={add} className={s.addLineBtn}>
        <OrderIcon name="plus" size={14} /> Add line item
      </button>
    </div>
  );
};

const OrderAuditLog = ({ log }) => {
  if (!log || log.length === 0) return <div className={s.auditEmpty}>No activity recorded yet.</div>;
  const getColor = (action) => {
    if (action.startsWith("Created")) return { bg: "#f1f5f9", text: "#64748b" };
    if (action.startsWith("Status")) return { bg: "#dbeafe", text: "#2563eb" };
    if (action.startsWith("Emailed")) return { bg: "#ede9fe", text: "#7c3aed" };
    if (action.startsWith("Edited")) return { bg: "#fef3c7", text: "#d97706" };
    return { bg: "#f1f5f9", text: "#64748b" };
  };
  return (
    <div>
      {[...log].reverse().map((entry, i) => (
        <div key={entry.id} className={`${s.auditEntry} ${i < log.length - 1 ? s.auditEntryBorder : ''}`}>
          <div className={s.auditIcon} style={{ background: getColor(entry.action).bg, color: getColor(entry.action).text }}>
            <OrderIcon name={entry.auto ? "zap" : "activity"} size={10} />
          </div>
          <div className={s.auditBody}>
            <div className={s.auditHeader}>
              <span className={s.auditAction}>{entry.action}</span>
              <div className={s.auditMeta}>
                {entry.auto && <span className={s.auditAuto}>auto</span>}
                <span className={s.auditTs}>{orderFmtTs(entry.ts)}</span>
              </div>
            </div>
            {entry.detail && <div className={s.auditDetail}>{entry.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Orders: PDF + Acceptance Page ─────────────────────────────────────────────
const printOrderPdf = (type, order, jobs) => {
  const job = jobs.find(j => j.id === order.jobId);
  const html = buildOrderPdfHtml({ type, order, job });
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow pop-ups to generate PDF."); return; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 400);
};

// ── Orders: Email Modal ───────────────────────────────────────────────────────
const OrderEmailModal = ({ type, order, jobs, companyInfo, onClose, onSent }) => {
  const isWO = type === "wo";
  const partyEmail = isWO ? order.contractorEmail : order.supplierEmail;
  const partyName = isWO ? order.contractorName : order.supplierName;
  const partyContact = isWO ? order.contractorContact : order.supplierContact;
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const job = jobs.find(j => j.id === order.jobId);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const docType = isWO ? "work_order" : "purchase_order";
  const acceptUrl = order.acceptToken
    ? `${supabaseUrl}/functions/v1/accept-document?token=${order.acceptToken}&type=${docType}`
    : null;
  const [includeAcceptLink, setIncludeAcceptLink] = useState(true);
  const [includePdf, setIncludePdf] = useState(true);
  const [to, setTo] = useState(partyEmail || "");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(null);
  const accent = isWO ? "#2563eb" : "#059669";
  const ToggleBtn = ({ on, onChange, accentCol }) => (
    <button className={`order-toggle ${on ? "on" : ""}`} style={{ background: on ? (accentCol || accent) : "#e2e8f0" }} onClick={() => onChange(!on)}>
      <div className="order-toggle-knob" />
    </button>
  );
  const handleSend = async () => {
    if (!to) return;
    setSending(true); setSendError(null);
    try {
      // Generate PDF attachment
      let attachments = [];
      if (includePdf) {
        const pdfHtml = buildOrderPdfHtml({ type, order, job, company: companyInfo, acceptUrl: includeAcceptLink ? acceptUrl : null });
        try {
          const pdfBase64 = await htmlToPdfBase64(pdfHtml, `${order.ref}.pdf`);
          attachments.push({ filename: `${order.ref}.pdf`, content: pdfBase64 });
        } catch (e) { console.warn("PDF generation failed:", e); }
      }
      // Send via Resend
      const emailData = {
        number: order.ref,
        jobTitle: jd?.name || "",
        acceptUrl: includeAcceptLink ? acceptUrl : undefined,
        ...(isWO ? { contractorName: partyContact || partyName } : { supplierName: partyContact || partyName }),
      };
      await sendEmail(docType, to, emailData, { cc: cc || undefined, attachments });
      if (onSent) onSent(`Emailed to ${to}${cc ? ", cc: " + cc : ""}${includeAcceptLink ? " · acceptance link included" : ""}`);
      setSent(true);
    } catch (err) {
      setSendError(err.message || "Failed to send email");
    } finally { setSending(false); }
  };
  if (sent) return (
    <div className="order-email-overlay">
      <div className={s.emailSentBox}>
        <div className={s.emailSentIcon}><OrderIcon name="check" size={24} cls="" /></div>
        <h3 className={s.emailSentTitle}>Email Sent</h3>
        <p className={s.emailSentMsg}>{isWO ? "Work order" : "Purchase order"} {order.ref} has been sent to {to}.</p>
        <button className="btn btn-primary" style={{ background: accent }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
  return (
    <div className="order-email-overlay">
      <div className="order-email-modal">
        <div className={s.emailModalHeader} style={{ background: accent }}>
          <div className={s.emailModalHeaderLeft}>
            <OrderIcon name="mail" size={18} />
            <div><div className={s.emailModalSubtitle}>Send via Email</div><div className={s.emailModalRef}>{order.ref}</div></div>
          </div>
          <button onClick={onClose} className={s.emailCloseBtn}><OrderIcon name="x" size={16} /></button>
        </div>
        <div className={s.emailModalBody}>
          {sendError && <div className={s.emailError}>{sendError}</div>}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">To</label><input className="form-control" type="email" placeholder="recipient@example.com" value={to} onChange={e => setTo(e.target.value)} />{partyName && <div className={s.emailHint}>{partyName}</div>}</div>
            <div className="form-group"><label className="form-label">CC <span className={s.ccOptional}>optional</span></label><input className="form-control" type="text" placeholder="cc@example.com" value={cc} onChange={e => setCc(e.target.value)} /></div>
          </div>
          <div className={s.emailOptionsBox}>
            <div className={s.emailOptionsHeader}>Email Options</div>
            <div className={s.emailOptionsBody}>
              <div className={s.emailOptionRow}>
                <ToggleBtn on={includePdf} onChange={v => setIncludePdf(v)} />
                <div className={s.emailOptionFlex}>
                  <div className={s.emailOptionInner}>
                    <span className={s.pdfBadge}>PDF</span>
                    <span className={s.emailOptionLabel}>Attach {order.ref}.pdf</span>
                    <button onClick={() => printOrderPdf(type, order, jobs)} className={s.previewLink}>Preview</button>
                  </div>
                  <div className={s.emailOptionHint}>Professional PDF with all document details attached to the email</div>
                </div>
              </div>
              {acceptUrl && (
                <div className={s.emailAcceptRow}>
                  <ToggleBtn on={includeAcceptLink} onChange={v => setIncludeAcceptLink(v)} />
                  <div className={s.emailOptionFlex}>
                    <div className={s.emailAcceptLabel}>✅ Accept Button</div>
                    <div className={s.emailOptionHint}>HTML button in email + link on PDF — recipient clicks to accept</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className={s.emailPreview}>
            <strong className={s.emailPreviewStrong}>Email preview:</strong> Branded HTML email with {isWO ? "work order" : "purchase order"} details, {includePdf ? "PDF attachment" : "no attachment"}{includeAcceptLink && acceptUrl ? ", and Accept button" : ""}. Sent from <strong>FieldOps</strong> via Resend.
          </div>
        </div>
        <div className={s.emailModalFooter}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ background: accent, opacity: sending ? 0.6 : 1 }} disabled={!to || sending} onClick={handleSend}>
            <OrderIcon name="send" size={14} /> {sending ? "Sending..." : `Send ${isWO ? "to Contractor" : "to Supplier"}`}
          </button>
        </div>
      </div>
    </div>
  );
};


// ── Orders: Order Drawer ──────────────────────────────────────────────────────
const OrderDrawer = ({ type, order, initialMode = "view", onSave, onClose, onTransition, jobs, presetJobId, companyInfo }) => {
  const isWO = type === "wo";
  const parties = isWO ? ORDER_CONTRACTORS : ORDER_SUPPLIERS;
  const isNew = !order;
  const baseForm = {
    id: genId(), ref: (isWO ? "WO-" : "PO-") + String(Math.floor(Math.random() * 900) + 100), status: "Draft",
    jobId: presetJobId || "", issueDate: orderToday(), dueDate: orderAddDays(orderToday(), 14), poLimit: "", notes: "", internalNotes: "",
    attachments: [], auditLog: [makeLogEntry("Created", isWO ? "Work order created" : "Purchase order created")],
  };
  const woFields = { contractorId: "", contractorName: "", contractorContact: "", contractorEmail: "", contractorPhone: "", trade: "", scopeOfWork: "" };
  const poFields = { supplierId: "", supplierName: "", supplierContact: "", supplierEmail: "", supplierAbn: "", deliveryAddress: "", lines: [{ id: genId(), desc: "", qty: "1", unit: "ea" }] };
  const [form, setForm] = useState(() => order ? { ...order } : { ...baseForm, ...(isWO ? woFields : poFields) });
  const [mode, setMode] = useState(isNew ? "edit" : initialMode);
  const [dirty, setDirty] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [markupImg, setMarkupImg] = useState(null);
  const [showPlanDrawing, setShowPlanDrawing] = useState(false);
  const [showOrderPdfFiller, setShowOrderPdfFiller] = useState(null);
  const orderPdfInputRef = useRef(null);
  const [orderEmailSending, setOrderEmailSending] = useState(false);
  const [orderEmailStatus, setOrderEmailStatus] = useState(null);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  const handleOrderPdfFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setShowOrderPdfFiller({ pdfData: ev.target.result, fileName: file.name });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleOrderPdfSave = ({ filledPdfDataUrl, thumbnail, fields: pdfFields, fileName: filledName }) => {
    const att = { id: genId(), name: filledName, size: Math.round(filledPdfDataUrl.length * 0.75), type: "application/pdf", dataUrl: filledPdfDataUrl, pdfThumbnail: thumbnail };
    setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
    setDirty(true);
    setShowOrderPdfFiller(null);
  };

  const handleDirectSendOrder = async () => {
    const recipientEmail = isWO ? form.contractorEmail : form.supplierEmail;
    const recipientName = isWO ? form.contractorName : form.supplierName;
    const emailType = isWO ? "work_order" : "purchase_order";
    if (!recipientEmail) { alert(`No ${isWO ? "contractor" : "supplier"} email address found.`); return; }
    const jobTitle = jobs.find(j => j.id === form.jobId)?.title || "";
    if (!window.confirm(`Send ${form.ref} via email to ${recipientName} (${recipientEmail})?`)) return;
    setOrderEmailSending(true); setOrderEmailStatus(null);
    try {
      await sendEmail(emailType, recipientEmail, { ...form, jobTitle, contractorName: form.contractorName, supplierName: form.supplierName });
      setOrderEmailStatus({ type: "success", msg: `Sent to ${recipientEmail}` });
      let u = form;
      u = { ...u, auditLog: [...(u.auditLog || []), { action: "Emailed via Resend", detail: `Sent to ${recipientEmail}`, ts: new Date().toISOString(), user: "System" }] };
      setForm(u); if (onSave) onSave(u);
      setTimeout(() => setOrderEmailStatus(null), 4000);
    } catch (err) {
      setOrderEmailStatus({ type: "error", msg: err.message || "Failed to send" });
    } finally { setOrderEmailSending(false); }
  };

  const saveOrderMarkup = (dataUrl) => {
    if (markupImg?.attachmentId) {
      // Replace existing attachment with marked-up version
      setForm(f => ({ ...f, attachments: f.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a) }));
      setDirty(true);
    } else {
      // Add as new attachment from lightbox markup
      const att = { id: genId(), name: "markup_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
      setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
      setDirty(true);
    }
    setMarkupImg(null);
  };

  const saveOrderPlan = (dataUrl) => {
    const att = { id: genId(), name: "plan_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
    setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
    setDirty(true);
    setShowPlanDrawing(false);
  };
  const selectParty = (id) => {
    const p = parties.find(x => x.id === id);
    if (!p) { set(isWO ? "contractorId" : "supplierId", ""); return; }
    if (isWO) setForm(f => ({ ...f, contractorId: p.id, contractorName: p.name, contractorContact: p.contact, contractorEmail: p.email, contractorPhone: p.phone, trade: p.trade }));
    else setForm(f => ({ ...f, supplierId: p.id, supplierName: p.name, supplierContact: p.contact, supplierEmail: p.email, supplierAbn: p.abn }));
    setDirty(true);
  };
  const handleTransition = (newStatus) => { const updated = applyTransition(form, newStatus); setForm(updated); setDirty(true); if (onTransition) onTransition(updated); };
  const handleSave = () => { const toSave = dirty ? orderAddLog(form, "Edited", "Order details updated") : form; onSave(toSave); setDirty(false); setMode("view"); };
  const availableTransitions = ORDER_TRANSITIONS[form.status] || [];
  const isTerminal = ORDER_TERMINAL.includes(form.status);
  const jd = orderJobDisplay(jobs.find(j => j.id === form.jobId));
  const partyId = isWO ? form.contractorId : form.supplierId;
  const partyName = isWO ? form.contractorName : form.supplierName;
  const accent = isWO ? SECTION_COLORS.wo.accent : SECTION_COLORS.po.accent;
  const lightTint = isWO ? SECTION_COLORS.wo.light : SECTION_COLORS.po.light;

  if (showEmail) return <OrderEmailModal type={type} order={form} jobs={jobs} companyInfo={companyInfo} onClose={() => setShowEmail(false)}
    onSent={(detail) => {
      let u = orderAddLog(form, "Emailed", detail, false);
      if (form.status === "Approved") u = applyTransition(u, "Sent");
      setForm(u); setDirty(false); if (onSave) onSave(u); setShowEmail(false);
    }} />;

  const statusStripEl = (
    <div className={s.statusStrip} style={{ background: lightTint }}>
      <div className={s.statusStripTop}>
        <div className={s.statusBtnGroup}>
          {availableTransitions.map(st => (
            <button key={st} onClick={() => handleTransition(st)} className={`${s.statusTransBtn} ${ORDER_STATUS_TRIGGERS[st] ? s.statusTransBtnTrigger : s.statusTransBtnNormal}`}>
              {ORDER_STATUS_TRIGGERS[st] && <OrderIcon name="zap" size={10} />}{st}
            </button>
          ))}
          {availableTransitions.length === 0 && isTerminal && <span className={s.statusTerminalHint}>No further transitions</span>}
        </div>
        <DueDateChip dateStr={form.dueDate} isTerminal={isTerminal} />
      </div>
      <OrderProgressBar status={form.status} />
      <div className={s.statusLabelRow}>
        {ORDER_STATUSES.filter(st => st !== "Cancelled").map(st => (
          <span key={st} className={`${s.statusLabel} ${form.status === st ? s.statusLabelActive : s.statusLabelInactive}`}>{st}</span>
        ))}
      </div>
    </div>
  );

  const footerEl = <>
    <div className={s.footerGroup}>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      <button className="btn btn-secondary btn-sm" onClick={() => printOrderPdf(type, form, jobs)}><OrderIcon name="file" size={14} /> PDF</button>
    </div>
    <div className={s.footerGroup}>
      {mode === "edit" && dirty && <button className="btn btn-primary" style={{ background: accent }} onClick={handleSave}>Save</button>}
      {mode === "edit" && !isNew && !dirty && <button className="btn btn-secondary" onClick={() => setMode("view")}>Done editing</button>}
      {mode === "view" && <button className={`btn btn-sm ${s.emailDirectBtn}`} disabled={orderEmailSending} onClick={handleDirectSendOrder}><OrderIcon name="send" size={14} /> {orderEmailSending ? "Sending..." : `Email ${isWO ? "Contractor" : "Supplier"}`}</button>}
      {mode === "view" && <button className="btn btn-primary" style={{ background: accent }} onClick={() => setShowEmail(true)}><OrderIcon name="mail" size={14} /> Draft Email</button>}
      {isNew && <button className="btn btn-primary" style={{ background: accent }} onClick={handleSave}>Create {isWO ? "Work Order" : "Purchase Order"}</button>}
    </div>
  </>;

  return (<>
    <SectionDrawer
      accent={accent}
      icon={<OrderIcon name={isWO ? "briefcase" : "shopping"} size={16} />}
      typeLabel={isWO ? "Work Order" : "Purchase Order"}
      title={form.ref}
      statusBadge={<OrderStatusBadge status={form.status} />}
      mode={mode} setMode={setMode} isNew={isNew}
      statusStrip={statusStripEl}
      footer={footerEl}
      onClose={() => { if (!dirty) onClose(); }}
    >
      {mode === "view" ? (
        <div className={s.viewBody}>
          {orderEmailStatus && <div className={s.emailStatusMsg} style={{ background: orderEmailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: orderEmailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${orderEmailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{orderEmailStatus.msg}</div>}
          <div className="grid-2">
            <div>
              <div className="form-label">{isWO ? "Contractor" : "Supplier"}</div>
              <div className={s.viewPartyName}>{partyName || <span className={s.viewPartyNone}>None selected</span>}</div>
              {isWO ? <><div className={s.viewSubText}>{form.contractorContact}</div><div className={s.viewSubText}>{form.contractorEmail}</div><div className={s.viewSubText}>{form.contractorPhone}</div></> :
                <><div className={s.viewSubText}>{form.supplierContact}</div><div className={s.viewSubText}>{form.supplierEmail}</div><div className={s.viewSubTextSmall}>ABN: {form.supplierAbn}</div></>}
            </div>
            <div className={s.viewDatesCol}>
              <div><span className={s.viewDateLabel}>Issue Date</span><div className={s.viewDateValue}>{orderFmtDate(form.issueDate)}</div></div>
              <div><span className={s.viewDateLabel}>{isWO ? "Due Date" : "Delivery Date"}</span><div className={s.viewDateValue}>{orderFmtDate(form.dueDate)}</div></div>
              {jd && <div><span className={s.viewDateLabel}>Linked Job</span><div className={s.viewDateValue}>{jd.ref} · {jd.name}</div></div>}
              {form.poLimit && <div><span className={s.viewDateLabel}>PO Limit</span><div className={s.viewPoLimit}>${parseFloat(form.poLimit).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</div></div>}
            </div>
          </div>
          {isWO && form.scopeOfWork && <div className={s.viewScopeBox} style={{ background: lightTint }}><div className="form-label" style={{ color: accent }}>Scope of Work</div><div className={s.viewScopeContent}>{form.scopeOfWork}</div></div>}
          {!isWO && form.deliveryAddress && <div className={s.viewScopeBox} style={{ background: lightTint }}><div className="form-label" style={{ color: accent }}>Delivery Address</div><div className={s.viewDeliveryContent}>{form.deliveryAddress}</div></div>}
          {!isWO && form.lines && form.lines.length > 0 && (
            <table className={s.viewTable}>
              <thead><tr className={s.viewTableHeadRow}><th className={s.viewTableTh}>Description</th><th className={s.viewTableThCenter}>Qty</th><th className={s.viewTableThCenter}>Unit</th></tr></thead>
              <tbody>{form.lines.map(l => <tr key={l.id} className={s.viewTableBodyRow}><td className={s.viewTableTd}>{l.desc || "—"}</td><td className={s.viewTableTdCenter}>{l.qty}</td><td className={s.viewTableTdUnit}>{l.unit}</td></tr>)}</tbody>
            </table>
          )}
          {form.notes && <div className={s.viewNotesSection}><div className="form-label">Notes / Terms</div><div className={s.viewNotesContent}>{form.notes}</div></div>}
          {form.internalNotes && <div className={s.viewInternalBox}><div className={s.viewInternalLabel}>Internal Notes</div><div className={s.viewInternalContent}>{form.internalNotes}</div></div>}
          {form.attachments && form.attachments.length > 0 && (
            <div className={s.viewAttachmentsSection}>
              <div className={`form-label ${s.viewAttachmentsLabelRow}`}><OrderIcon name="paperclip" size={11} /> Attachments ({form.attachments.length})</div>
              <div className={s.viewAttachmentsGrid}>
                {form.attachments.map(f => (
                  <div key={f.id} className={`${s.viewAttachmentCard} ${f.dataUrl ? s.viewAttachmentCardClickable : s.viewAttachmentCardDefault}`}
                    onClick={() => f.dataUrl && setLightboxImg(f.dataUrl)}>
                    {f.dataUrl ? <img src={f.dataUrl} alt={f.name} className={s.viewAttachmentThumb} /> : <FileIconBadge name={f.name} />}
                    <div className={s.viewAttachmentInfo}><div className={s.viewAttachmentName}>{f.name}</div><div className={s.viewAttachmentSize}>{fmtFileSize(f.size)}</div></div>
                    {f.dataUrl && f.type?.startsWith("image/") && <button onClick={e => { e.stopPropagation(); setMarkupImg({ src: f.dataUrl, attachmentId: f.id }); }} className={s.markupBtn} title="Mark up">✏️</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className={s.viewLogSection}>
            <div className={`form-label ${s.viewAttachmentsLabelRow}`}><OrderIcon name="activity" size={11} /> Activity Log</div>
            <OrderAuditLog log={form.auditLog} />
          </div>
        </div>
      ) : (
        <div className={s.editBody}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">{isWO ? "Contractor" : "Supplier"}</label><select className="form-control" value={partyId} onChange={e => selectParty(e.target.value)}><option value="">{"— Select " + (isWO ? "contractor" : "supplier") + " —"}</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Linked Job</label><select className="form-control" value={form.jobId} onChange={e => set("jobId", e.target.value ? Number(e.target.value) : "")}><option value="">— No linked job —</option>{jobs.map(j => { const d = orderJobDisplay(j); return <option key={j.id} value={j.id}>{d.ref + " · " + d.name}</option>; })}</select></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Issue Date</label><input type="date" className="form-control" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">{isWO ? "Due Date" : "Delivery Date"}</label><input type="date" className="form-control" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} /></div>
          </div>
          {isWO && <div className="form-group"><label className="form-label">PO Limit (AUD)</label><div className={s.poLimitWrap}><span className={s.poLimitSymbol}>$</span><input type="number" min="0" step="0.01" className={`form-control ${s.poLimitInput}`} placeholder="e.g. 5000.00" value={form.poLimit} onChange={e => set("poLimit", e.target.value)} /></div></div>}
          {isWO ? (
            <div className="form-group"><label className="form-label">Scope of Work</label><textarea rows={6} className={`form-control ${s.textareaAuto}`} placeholder="Describe the full scope of work..." value={form.scopeOfWork} onChange={e => set("scopeOfWork", e.target.value)} /></div>
          ) : (
            <>
              <div className="form-group"><label className="form-label">Delivery Address</label><input type="text" className="form-control" placeholder="Site or warehouse delivery address" value={form.deliveryAddress} onChange={e => set("deliveryAddress", e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Items to Order</label><OrderLineItems lines={form.lines} onChange={v => set("lines", v)} /></div>
              <div className="form-group"><label className="form-label">PO Limit (AUD)</label><div className={s.poLimitWrap}><span className={s.poLimitSymbol}>$</span><input type="number" min="0" step="0.01" className={`form-control ${s.poLimitInput}`} placeholder="e.g. 5000.00" value={form.poLimit} onChange={e => set("poLimit", e.target.value)} /></div></div>
            </>
          )}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">{isWO ? "Terms & Notes (visible to contractor)" : "Notes (visible to supplier)"}</label><textarea rows={3} className={`form-control ${s.textareaAuto}`} placeholder="Payment terms, special instructions..." value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Internal Notes</label><textarea rows={3} className={`form-control ${s.textareaAuto}`} placeholder="Not shown on document" value={form.internalNotes} onChange={e => set("internalNotes", e.target.value)} /></div>
          </div>
          <div className="form-group">
            <div className={s.editAttachmentHeader}>
              <label className={`form-label ${s.editAttachmentLabelNoMb}`}><OrderIcon name="paperclip" size={12} /> Attachments</label>
              <div className={s.editAttachmentBtns}>
                <button type="button" className={`btn btn-sm ${s.fillPdfBtn}`} onClick={() => orderPdfInputRef.current?.click()}>📄 Fill PDF</button>
                <input ref={orderPdfInputRef} type="file" accept=".pdf" className={s.hiddenInput} onChange={handleOrderPdfFile} />
                <button type="button" className={`btn btn-sm ${s.drawPlanBtn}`} onClick={() => setShowPlanDrawing(true)}>📐 Draw Plan</button>
              </div>
            </div>
            <OrderFileAttachments files={form.attachments} onChange={updater => { setForm(f => ({ ...f, attachments: typeof updater === "function" ? updater(f.attachments) : updater })); setDirty(true); }}
              onMarkup={(src, attachmentId) => setMarkupImg({ src, attachmentId })}
              onLightbox={(src) => setLightboxImg(src)} />
          </div>
        </div>
      )}
    </SectionDrawer>

    {/* Lightbox */}
    {lightboxImg && (
      <div onClick={() => setLightboxImg(null)} className={s.lightboxOverlay}>
        <img src={lightboxImg} alt="Attachment" className={s.lightboxImg} />
        <button onClick={e => { e.stopPropagation(); setMarkupImg({ src: lightboxImg }); setLightboxImg(null); }}
          className={s.lightboxMarkupBtn}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} className={s.lightboxCloseBtn}>✕</button>
      </div>
    )}

    {/* Photo Markup Editor */}
    {markupImg && (
      <PhotoMarkupEditor imageSrc={markupImg.src} onSave={saveOrderMarkup} onClose={() => setMarkupImg(null)} />
    )}

    {/* Plan Drawing Editor */}
    {showPlanDrawing && (
      <PlanDrawingEditor onSave={saveOrderPlan} onClose={() => setShowPlanDrawing(false)} />
    )}

    {/* PDF Form Filler */}
    {showOrderPdfFiller && (
      <PdfFormFiller
        pdfData={showOrderPdfFiller.pdfData}
        fileName={showOrderPdfFiller.fileName}
        onSave={handleOrderPdfSave}
        onClose={() => setShowOrderPdfFiller(null)}
      />
    )}
    </>
  );
};

// ── Orders: Order Card ────────────────────────────────────────────────────────

// ── Orders: Dashboard ─────────────────────────────────────────────────────────
const OrdersDashboard = ({ workOrders, purchaseOrders, onView, onEdit, onStatusChange, jobs }) => {
  const [panel, setPanel] = useState(null);
  const [localWO, setLocalWO] = useState(workOrders);
  const [localPO, setLocalPO] = useState(purchaseOrders);
  if (localWO !== workOrders && JSON.stringify(localWO.map(o=>o.id+o.status)) !== JSON.stringify(workOrders.map(o=>o.id+o.status))) setLocalWO(workOrders);
  if (localPO !== purchaseOrders && JSON.stringify(localPO.map(o=>o.id+o.status)) !== JSON.stringify(purchaseOrders.map(o=>o.id+o.status))) setLocalPO(purchaseOrders);
  const allOrders = [...localWO.map(o => ({ ...o, _type: "wo" })), ...localPO.map(o => ({ ...o, _type: "po" }))];
  const now = orderToday();
  const overdue = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status) && o.dueDate && o.dueDate < now).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const dueSoon = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status) && o.dueDate && o.dueDate >= now && daysUntil(o.dueDate) <= 7).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const active = allOrders.filter(o => ORDER_ACTIVE.includes(o.status)).sort((a,b) => (a.dueDate||"").localeCompare(b.dueDate||""));
  const openList = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status)).sort((a,b) => (a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
  const openPanel = (label, orders) => setPanel({ label, orders });
  const handleDashTransition = (order, newStatus) => {
    const updated = applyTransition(order, newStatus);
    if (order._type === "wo") setLocalWO(prev => prev.map(o => o.id === updated.id ? updated : o));
    else setLocalPO(prev => prev.map(o => o.id === updated.id ? updated : o));
    onStatusChange(order._type, updated);
    setPanel(p => p ? { ...p, orders: p.orders.map(o => o.id === updated.id ? { ...updated, _type: order._type } : o) } : null);
  };
  const PanelRow = ({ order }) => {
    const isWO = order._type === "wo"; const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
    const isTerminal = ORDER_TERMINAL.includes(order.status); const transitions = ORDER_TRANSITIONS[order.status] || [];
    const pName = isWO ? order.contractorName : order.supplierName;
    return (
      <div className={s.panelRowCard}>
        <div className={s.panelRowTop} onClick={() => onView(order._type, order)}>
          <div className={`${s.panelRowIcon} ${isWO ? s.panelRowIconWo : s.panelRowIconPo}`}>
            <OrderIcon name={isWO ? "briefcase" : "shopping"} size={14} />
          </div>
          <div className={s.panelRowInfo}>
            <div className={s.panelRowRefRow}><span className={s.panelRowRef}>{order.ref}</span><OrderStatusBadge status={order.status} /></div>
            <div className={s.panelRowParty}>{pName || <span className={s.panelRowNone}>No party</span>}</div>
            {jd && <div className={s.panelRowJob}><OrderIcon name="link" size={9} />{jd.ref} · {jd.name}</div>}
          </div>
          <div className={s.panelRowRight}>
            <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
            {order.poLimit && <span className={s.panelRowPoLimit}>${parseFloat(order.poLimit).toLocaleString("en-AU")}</span>}
          </div>
        </div>
        {!isTerminal && transitions.length > 0 && (
          <div className={s.panelRowActions}>
            <span className={s.panelRowMoveTo}>Move to:</span>
            {transitions.map(st => (
              <button key={st} onClick={e => { e.stopPropagation(); handleDashTransition(order, st); }} className={`${s.panelRowTransBtn} ${ORDER_STATUS_TRIGGERS[st] ? s.panelRowTransBtnTrigger : s.panelRowTransBtnNormal}`}>
                {ORDER_STATUS_TRIGGERS[st] && <OrderIcon name="zap" size={9} />}{st}
              </button>
            ))}
            <button onClick={e => { e.stopPropagation(); onEdit(order._type, order); }} className={s.panelRowEditBtn}><OrderIcon name="edit" size={11} /> Edit</button>
          </div>
        )}
      </div>
    );
  };
  const DashRow = ({ order }) => {
    const isWO = order._type === "wo"; const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
    const isTerminal = ORDER_TERMINAL.includes(order.status);
    return (
      <div className={s.dashRow} onClick={() => onView(order._type, order)}>
        <div className={`${s.dashRowIcon} ${isWO ? s.panelRowIconWo : s.panelRowIconPo}`}><OrderIcon name={isWO ? "briefcase" : "shopping"} size={12} /></div>
        <div className={s.dashRowInfo}>
          <div className={s.dashRowRefRow}><span className={s.dashRowRef}>{order.ref}</span><OrderStatusBadge status={order.status} /></div>
          <div className={s.dashRowSub}>{(isWO ? order.contractorName : order.supplierName) || "—"}{jd ? " · " + jd.ref : ""}</div>
        </div>
        <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
      </div>
    );
  };
  const StatusPipeline = ({ title, pipelineOrders, pType }) => {
    const isWO = pType === "wo";
    return (
      <div className="card"><div className="card-body">
        <h3 className={s.pipelineTitle}>
          <div className={s.pipelineTitleIcon} style={{ background: isWO ? "#dbeafe" : "#d1fae5" }}><OrderIcon name={isWO ? "briefcase" : "shopping"} size={11} cls="" /></div>
          {title}
        </h3>
        <div className={s.pipelineCol}>
          {ORDER_STATUSES.filter(st => st !== "Cancelled").map(st => {
            const matched = pipelineOrders.filter(o => o.status === st);
            const count = matched.length; const pct = pipelineOrders.length > 0 ? (count / pipelineOrders.length) * 100 : 0;
            return (
              <div key={st} className={`${s.pipelineRow} ${count > 0 ? s.pipelineRowClickable : s.pipelineRowDisabled}`} style={{ opacity: count > 0 ? 1 : 0.4 }} onClick={() => count > 0 && openPanel(st + " — " + title, matched.map(o => ({ ...o, _type: pType })))}>
                <span className={s.pipelineStatusLabel}>{st}</span>
                <div className={s.pipelineBar}><div className={s.pipelineBarFill} style={{ background: ORDER_BAR_COLORS[st], width: pct + "%" }} /></div>
                <span className={`${s.pipelineCount} ${count > 0 ? s.pipelineCountActive : s.pipelineCountZero}`}>{count}</span>
              </div>
            );
          })}
        </div>
      </div></div>
    );
  };
  const kpis = [
    { label: "Overdue", value: overdue.length, sub: "need attention", highlight: overdue.length > 0, borderColor: overdue.length > 0 ? "#fecaca" : "#e8e8e8", bg: overdue.length > 0 ? "#fef2f2" : "#fff", textColor: overdue.length > 0 ? "#dc2626" : "#111", orders: overdue },
    { label: "Due This Week", value: dueSoon.length, sub: "upcoming", highlight: dueSoon.length > 0, borderColor: dueSoon.length > 0 ? "#fed7aa" : "#e8e8e8", bg: dueSoon.length > 0 ? "#fff7ed" : "#fff", textColor: dueSoon.length > 0 ? "#ea580c" : "#111", orders: dueSoon },
    { label: "Active", value: active.length, sub: "in progress", highlight: false, borderColor: "#e8e8e8", bg: "#fff", textColor: "#2563eb", orders: active },
    { label: "All Open", value: openList.length, sub: localWO.length + " WO · " + localPO.length + " PO", highlight: false, borderColor: "#e8e8e8", bg: "#fff", textColor: "#111", orders: openList },
  ];
  return (
    <div className={s.dashWrap}>
      <div className="order-kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className="order-kpi-card" style={{ border: `1px solid ${k.borderColor}`, background: k.bg, cursor: "pointer" }} onClick={() => openPanel(k.label, k.orders)}>
            <div className={s.kpiLabel}>{k.label}</div>
            <div className={s.kpiValue} style={{ color: k.textColor }}>{k.value}</div>
            <div className={s.kpiSub}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <StatusPipeline title="Work Orders" pipelineOrders={localWO} pType="wo" />
        <StatusPipeline title="Purchase Orders" pipelineOrders={localPO} pType="po" />
      </div>
      <div className={s.dashCardGrid}>
        {[
          { title: "Overdue", icon: "warning", iconBg: "#fef2f2", iconColor: "#dc2626", borderColor: "#fecaca", orders: overdue, empty: "No overdue orders" },
          { title: "Due This Week", icon: "clock", iconBg: "#fff7ed", iconColor: "#ea580c", borderColor: "#fed7aa", orders: dueSoon, empty: "Nothing due in 7 days" },
          { title: "Active Orders", icon: "bar", iconBg: "#eff6ff", iconColor: "#2563eb", borderColor: "#e8e8e8", orders: active, empty: "No active orders" },
        ].map(({ title, icon, iconBg, iconColor, borderColor, orders, empty }) => (
          <div key={title} className="card" style={{ borderColor }}>
            <div className="card-header" style={{ cursor: orders.length > 0 ? "pointer" : "default" }} onClick={() => orders.length > 0 && openPanel(title, orders)}>
              <div className={s.dashCardHeaderRow}>
                <div className={s.dashCardIcon} style={{ background: iconBg }}><OrderIcon name={icon} size={13} cls="" style={{ color: iconColor }} /></div>
                <span className="card-title">{title}</span>
                {orders.length > 0 && <span className={s.dashCardBadge} style={{ background: iconColor }}>{orders.length}</span>}
              </div>
            </div>
            <div className="card-body">
              {orders.length === 0 ? <div className={s.dashCardEmpty}>{empty}</div>
                : <>{orders.slice(0, 5).map(o => <DashRow key={o.id} order={o} />)}{orders.length > 5 && <div className={s.dashCardMore} onClick={() => openPanel(title, orders)}>+{orders.length - 5} more</div>}</>}
            </div>
          </div>
        ))}
      </div>
      {/* Side Panel */}
      {panel && (
        <div className="order-panel">
          <div className="order-panel-backdrop" onClick={() => setPanel(null)} />
          <div className="order-panel-body">
            <div className={s.panelHeader}>
              <div><div className={s.panelHeaderLabel}>Dashboard</div><div className={s.panelHeaderTitle}>{panel.label}</div><div className={s.panelHeaderCount}>{panel.orders.length} order{panel.orders.length !== 1 ? "s" : ""}</div></div>
              <button onClick={() => setPanel(null)} className={s.panelCloseBtn}><OrderIcon name="x" size={16} /></button>
            </div>
            <div className={s.panelBody}>
              {panel.orders.length === 0 ? <div className={s.panelEmpty}>No orders in this view</div>
                : panel.orders.map(o => <PanelRow key={o.id + o.status} order={o} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Orders: Orders Page ───────────────────────────────────────────────────────


export { OrderFileAttachments, OrderLineItems, OrderAuditLog, printOrderPdf, OrderEmailModal, OrderDrawer, OrdersDashboard };
