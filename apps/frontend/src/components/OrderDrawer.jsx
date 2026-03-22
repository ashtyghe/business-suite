import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { genId, orderToday, orderAddDays, orderFmtDate, daysUntil, fmtFileSize, orderFmtTs, makeLogEntry, orderAddLog, applyTransition, orderJobDisplay, ORDER_STATUS_TRIGGERS } from "../utils/helpers";
import { Icon } from "../components/Icon";
import { StatusBadge, OrderIcon, OrderStatusBadge, DueDateChip, OrderProgressBar, FileIconBadge, SectionDrawer } from "../components/shared";
import { ORDER_CONTRACTORS, ORDER_SUPPLIERS, ORDER_UNITS, ORDER_STATUSES, ORDER_TRANSITIONS, ORDER_TERMINAL, ORDER_ACTIVE, ORDER_BAR_COLORS, SECTION_COLORS } from "../fixtures/seedData.jsx";
import { sendEmail } from "../lib/supabase";
import { buildOrderPdfHtml, htmlToPdfBase64 } from "../lib/pdf";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {files.length > 0 && files.map(f => (
        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover", border: "1px solid #e2e8f0", cursor: "pointer" }} onClick={() => onLightbox && onLightbox(f.dataUrl)} />
            : <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}><FileIconBadge name={f.name} /></div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmtFileSize(f.size)}</div>
          </div>
          {f.dataUrl && f.type?.startsWith("image/") && onMarkup && <button onClick={() => onMarkup(f.dataUrl, f.id)} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", fontSize: 11 }} title="Mark up">✏️</button>}
          <button onClick={() => onChange(prev => prev.filter(x => x.id !== f.id))} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }}>
            <OrderIcon name="x" size={14} />
          </button>
        </div>
      ))}
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, border: "2px dashed #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 13, fontWeight: 500 }}>
        <OrderIcon name="upload" size={16} />
        {files.length > 0 ? "Add more files" : "Attach files — drawings, specs, photos…"}
        <input type="file" multiple style={{ display: "none" }} onChange={handleFiles} accept="*/*" />
      </label>
    </div>
  );
};

const OrderLineItems = ({ lines, onChange }) => {
  const add = () => onChange([...lines, { id: genId(), desc: "", qty: "1", unit: "ea" }]);
  const remove = (id) => onChange(lines.filter(l => l.id !== id));
  const update = (id, field, val) => onChange(lines.map(l => l.id === id ? { ...l, [field]: val } : l));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 30px", gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8", padding: "0 4px" }}>
        <span>Description</span><span>Qty</span><span>Unit</span><span></span>
      </div>
      {lines.map(l => (
        <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 30px", gap: 8, alignItems: "center" }}>
          <input className="form-control" style={{ height: 36, fontSize: 13 }} placeholder="Description" value={l.desc} onChange={e => update(l.id, "desc", e.target.value)} />
          <input className="form-control" style={{ height: 36, fontSize: 13 }} type="number" min="0" placeholder="Qty" value={l.qty} onChange={e => update(l.id, "qty", e.target.value)} />
          <select className="form-control" style={{ height: 36, fontSize: 13 }} value={l.unit} onChange={e => update(l.id, "unit", e.target.value)}>
            {ORDER_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
          <button onClick={() => remove(l.id)} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }}><OrderIcon name="x" size={14} /></button>
        </div>
      ))}
      <button onClick={add} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#2563eb", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
        <OrderIcon name="plus" size={14} /> Add line item
      </button>
    </div>
  );
};

const OrderAuditLog = ({ log }) => {
  if (!log || log.length === 0) return <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>No activity recorded yet.</div>;
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
        <div key={entry.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < log.length - 1 ? "1px solid #f1f5f9" : "none" }}>
          <div style={{ width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: getColor(entry.action).bg, color: getColor(entry.action).text, flexShrink: 0 }}>
            <OrderIcon name={entry.auto ? "zap" : "activity"} size={10} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{entry.action}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {entry.auto && <span style={{ fontSize: 10, fontWeight: 600, color: "#d97706", background: "#fffbeb", padding: "1px 6px", borderRadius: 4, border: "1px solid #fcd34d" }}>auto</span>}
                <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{orderFmtTs(entry.ts)}</span>
              </div>
            </div>
            {entry.detail && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{entry.detail}</div>}
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
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxWidth: 400, width: "100%", padding: 32, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, background: "#d1fae5", borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><OrderIcon name="check" size={24} cls="" /></div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Email Sent</h3>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>{isWO ? "Work order" : "Purchase order"} {order.ref} has been sent to {to}.</p>
        <button className="btn btn-primary" style={{ background: accent }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
  return (
    <div className="order-email-overlay">
      <div className="order-email-modal">
        <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff", background: accent }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <OrderIcon name="mail" size={18} />
            <div><div style={{ fontSize: 11, fontWeight: 500, opacity: 0.75 }}>Send via Email</div><div style={{ fontWeight: 700 }}>{order.ref}</div></div>
          </div>
          <button onClick={onClose} style={{ padding: 6, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff" }}><OrderIcon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {sendError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#dc2626" }}>{sendError}</div>}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">To</label><input className="form-control" type="email" placeholder="recipient@example.com" value={to} onChange={e => setTo(e.target.value)} />{partyName && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{partyName}</div>}</div>
            <div className="form-group"><label className="form-label">CC <span style={{ fontWeight: 400, color: "#cbd5e1", textTransform: "none" }}>optional</span></label><input className="form-control" type="text" placeholder="cc@example.com" value={cc} onChange={e => setCc(e.target.value)} /></div>
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#475569" }}>Email Options</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <ToggleBtn on={includePdf} onChange={v => setIncludePdf(v)} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", background: "#fef2f2", padding: "2px 6px", borderRadius: 4 }}>PDF</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Attach {order.ref}.pdf</span>
                    <button onClick={() => printOrderPdf(type, order, jobs)} style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}>Preview</button>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Professional PDF with all document details attached to the email</div>
                </div>
              </div>
              {acceptUrl && (
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <ToggleBtn on={includeAcceptLink} onChange={v => setIncludeAcceptLink(v)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>✅ Accept Button</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>HTML button in email + link on PDF — recipient clicks to accept</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            <strong style={{ color: "#334155" }}>Email preview:</strong> Branded HTML email with {isWO ? "work order" : "purchase order"} details, {includePdf ? "PDF attachment" : "no attachment"}{includeAcceptLink && acceptUrl ? ", and Accept button" : ""}. Sent from <strong>FieldOps</strong> via Resend.
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
    <div style={{ padding: "12px 20px", background: lightTint, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", overflowY: "hidden" }}>
          {availableTransitions.map(s => (
            <button key={s} onClick={() => handleTransition(s)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: ORDER_STATUS_TRIGGERS[s] ? "1px solid #fcd34d" : "1px solid #cbd5e1", background: ORDER_STATUS_TRIGGERS[s] ? "#fef3c7" : "#fff", color: ORDER_STATUS_TRIGGERS[s] ? "#92400e" : "#475569", cursor: "pointer" }}>
              {ORDER_STATUS_TRIGGERS[s] && <OrderIcon name="zap" size={10} />}{s}
            </button>
          ))}
          {availableTransitions.length === 0 && isTerminal && <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>No further transitions</span>}
        </div>
        <DueDateChip dateStr={form.dueDate} isTerminal={isTerminal} />
      </div>
      <OrderProgressBar status={form.status} />
      <div style={{ display: "flex", gap: 8, marginTop: 6, overflowX: "auto" }}>
        {ORDER_STATUSES.filter(s => s !== "Cancelled").map(s => (
          <span key={s} style={{ fontSize: 11, whiteSpace: "nowrap", fontWeight: form.status === s ? 700 : 400, color: form.status === s ? "#334155" : "#cbd5e1" }}>{s}</span>
        ))}
      </div>
    </div>
  );

  const footerEl = <>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      <button className="btn btn-secondary btn-sm" onClick={() => printOrderPdf(type, form, jobs)}><OrderIcon name="file" size={14} /> PDF</button>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {mode === "edit" && dirty && <button className="btn btn-primary" style={{ background: accent }} onClick={handleSave}>Save</button>}
      {mode === "edit" && !isNew && !dirty && <button className="btn btn-secondary" onClick={() => setMode("view")}>Done editing</button>}
      {mode === "view" && <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} disabled={orderEmailSending} onClick={handleDirectSendOrder}><OrderIcon name="send" size={14} /> {orderEmailSending ? "Sending..." : `Email ${isWO ? "Contractor" : "Supplier"}`}</button>}
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
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {orderEmailStatus && <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: orderEmailStatus.type === "success" ? "#ecfdf5" : "#fef2f2", color: orderEmailStatus.type === "success" ? "#059669" : "#dc2626", border: `1px solid ${orderEmailStatus.type === "success" ? "#a7f3d0" : "#fecaca"}` }}>{orderEmailStatus.msg}</div>}
          <div className="grid-2">
            <div>
              <div className="form-label">{isWO ? "Contractor" : "Supplier"}</div>
              <div style={{ fontWeight: 600, color: "#1e293b" }}>{partyName || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>None selected</span>}</div>
              {isWO ? <><div style={{ fontSize: 13, color: "#64748b" }}>{form.contractorContact}</div><div style={{ fontSize: 13, color: "#64748b" }}>{form.contractorEmail}</div><div style={{ fontSize: 13, color: "#64748b" }}>{form.contractorPhone}</div></> :
                <><div style={{ fontSize: 13, color: "#64748b" }}>{form.supplierContact}</div><div style={{ fontSize: 13, color: "#64748b" }}>{form.supplierEmail}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>ABN: {form.supplierAbn}</div></>}
            </div>
            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
              <div><span style={{ fontSize: 11, color: "#94a3b8" }}>Issue Date</span><div style={{ fontWeight: 500 }}>{orderFmtDate(form.issueDate)}</div></div>
              <div><span style={{ fontSize: 11, color: "#94a3b8" }}>{isWO ? "Due Date" : "Delivery Date"}</span><div style={{ fontWeight: 500 }}>{orderFmtDate(form.dueDate)}</div></div>
              {jd && <div><span style={{ fontSize: 11, color: "#94a3b8" }}>Linked Job</span><div style={{ fontWeight: 500 }}>{jd.ref} · {jd.name}</div></div>}
              {form.poLimit && <div><span style={{ fontSize: 11, color: "#94a3b8" }}>PO Limit</span><div style={{ fontWeight: 700, color: "#b45309" }}>${parseFloat(form.poLimit).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</div></div>}
            </div>
          </div>
          {isWO && form.scopeOfWork && <div style={{ background: lightTint, borderRadius: 12, padding: 16 }}><div className="form-label" style={{ color: accent }}>Scope of Work</div><div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-line", lineHeight: 1.6 }}>{form.scopeOfWork}</div></div>}
          {!isWO && form.deliveryAddress && <div style={{ background: lightTint, borderRadius: 12, padding: 16 }}><div className="form-label" style={{ color: accent }}>Delivery Address</div><div style={{ fontSize: 13 }}>{form.deliveryAddress}</div></div>}
          {!isWO && form.lines && form.lines.length > 0 && (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "2px solid #e2e8f0" }}><th style={{ textAlign: "left", padding: "8px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8" }}>Description</th><th style={{ textAlign: "center", padding: "8px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", width: 60 }}>Qty</th><th style={{ textAlign: "center", padding: "8px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", width: 60 }}>Unit</th></tr></thead>
              <tbody>{form.lines.map(l => <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={{ padding: "10px 4px" }}>{l.desc || "—"}</td><td style={{ padding: "10px 4px", textAlign: "center", color: "#475569" }}>{l.qty}</td><td style={{ padding: "10px 4px", textAlign: "center", color: "#94a3b8" }}>{l.unit}</td></tr>)}</tbody>
            </table>
          )}
          {form.notes && <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}><div className="form-label">Notes / Terms</div><div style={{ fontSize: 13, color: "#475569", whiteSpace: "pre-line" }}>{form.notes}</div></div>}
          {form.internalNotes && <div style={{ background: "#fffbeb", borderRadius: 8, padding: 10 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", marginBottom: 4 }}>Internal Notes</div><div style={{ fontSize: 13, color: "#92400e" }}>{form.internalNotes}</div></div>}
          {form.attachments && form.attachments.length > 0 && (
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
              <div className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><OrderIcon name="paperclip" size={11} /> Attachments ({form.attachments.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {form.attachments.map(f => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", cursor: f.dataUrl ? "pointer" : "default" }}
                    onClick={() => f.dataUrl && setLightboxImg(f.dataUrl)}>
                    {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>{fmtFileSize(f.size)}</div></div>
                    {f.dataUrl && f.type?.startsWith("image/") && <button onClick={e => { e.stopPropagation(); setMarkupImg({ src: f.dataUrl, attachmentId: f.id }); }} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", fontSize: 11 }} title="Mark up">✏️</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
            <div className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><OrderIcon name="activity" size={11} /> Activity Log</div>
            <OrderAuditLog log={form.auditLog} />
          </div>
        </div>
      ) : (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">{isWO ? "Contractor" : "Supplier"}</label><select className="form-control" value={partyId} onChange={e => selectParty(e.target.value)}><option value="">{"— Select " + (isWO ? "contractor" : "supplier") + " —"}</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Linked Job</label><select className="form-control" value={form.jobId} onChange={e => set("jobId", e.target.value ? Number(e.target.value) : "")}><option value="">— No linked job —</option>{jobs.map(j => { const d = orderJobDisplay(j); return <option key={j.id} value={j.id}>{d.ref + " · " + d.name}</option>; })}</select></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Issue Date</label><input type="date" className="form-control" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">{isWO ? "Due Date" : "Delivery Date"}</label><input type="date" className="form-control" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} /></div>
          </div>
          {isWO && <div className="form-group"><label className="form-label">PO Limit (AUD)</label><div style={{ position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }}>$</span><input type="number" min="0" step="0.01" className="form-control" style={{ paddingLeft: 28 }} placeholder="e.g. 5000.00" value={form.poLimit} onChange={e => set("poLimit", e.target.value)} /></div></div>}
          {isWO ? (
            <div className="form-group"><label className="form-label">Scope of Work</label><textarea rows={6} className="form-control" style={{ height: "auto" }} placeholder="Describe the full scope of work..." value={form.scopeOfWork} onChange={e => set("scopeOfWork", e.target.value)} /></div>
          ) : (
            <>
              <div className="form-group"><label className="form-label">Delivery Address</label><input type="text" className="form-control" placeholder="Site or warehouse delivery address" value={form.deliveryAddress} onChange={e => set("deliveryAddress", e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Items to Order</label><OrderLineItems lines={form.lines} onChange={v => set("lines", v)} /></div>
              <div className="form-group"><label className="form-label">PO Limit (AUD)</label><div style={{ position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }}>$</span><input type="number" min="0" step="0.01" className="form-control" style={{ paddingLeft: 28 }} placeholder="e.g. 5000.00" value={form.poLimit} onChange={e => set("poLimit", e.target.value)} /></div></div>
            </>
          )}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">{isWO ? "Terms & Notes (visible to contractor)" : "Notes (visible to supplier)"}</label><textarea rows={3} className="form-control" style={{ height: "auto" }} placeholder="Payment terms, special instructions..." value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Internal Notes</label><textarea rows={3} className="form-control" style={{ height: "auto" }} placeholder="Not shown on document" value={form.internalNotes} onChange={e => set("internalNotes", e.target.value)} /></div>
          </div>
          <div className="form-group">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}><OrderIcon name="paperclip" size={12} /> Attachments</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn btn-sm" style={{ background: "#7c3aed", color: "#fff", border: "none", fontSize: 12 }} onClick={() => orderPdfInputRef.current?.click()}>📄 Fill PDF</button>
                <input ref={orderPdfInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleOrderPdfFile} />
                <button type="button" className="btn btn-sm" style={{ background: "#059669", color: "#fff", border: "none", fontSize: 12 }} onClick={() => setShowPlanDrawing(true)}>📐 Draw Plan</button>
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
      <div onClick={() => setLightboxImg(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <img src={lightboxImg} alt="Attachment" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} />
        <button onClick={e => { e.stopPropagation(); setMarkupImg({ src: lightboxImg }); setLightboxImg(null); }}
          style={{ position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 8, background: "#0891b2", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e8e8" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, cursor: "pointer" }} onClick={() => onView(order._type, order)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: isWO ? "#dbeafe" : "#d1fae5", color: isWO ? "#2563eb" : "#059669", flexShrink: 0 }}>
            <OrderIcon name={isWO ? "briefcase" : "shopping"} size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{order.ref}</span><OrderStatusBadge status={order.status} /></div>
            <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{pName || <span style={{ fontStyle: "italic" }}>No party</span>}</div>
            {jd && <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}><OrderIcon name="link" size={9} />{jd.ref} · {jd.name}</div>}
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
            {order.poLimit && <span style={{ fontSize: 11, fontWeight: 600, color: "#b45309", background: "#fffbeb", padding: "1px 6px", borderRadius: 4, border: "1px solid #fcd34d" }}>${parseFloat(order.poLimit).toLocaleString("en-AU")}</span>}
          </div>
        </div>
        {!isTerminal && transitions.length > 0 && (
          <div style={{ padding: "0 16px 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", marginRight: 4 }}>Move to:</span>
            {transitions.map(s => (
              <button key={s} onClick={e => { e.stopPropagation(); handleDashTransition(order, s); }} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: ORDER_STATUS_TRIGGERS[s] ? "1px solid #fcd34d" : "1px solid #e2e8f0", background: ORDER_STATUS_TRIGGERS[s] ? "#fffbeb" : "#f8fafc", color: ORDER_STATUS_TRIGGERS[s] ? "#b45309" : "#475569", cursor: "pointer" }}>
                {ORDER_STATUS_TRIGGERS[s] && <OrderIcon name="zap" size={9} />}{s}
              </button>
            ))}
            <button onClick={e => { e.stopPropagation(); onEdit(order._type, order); }} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}><OrderIcon name="edit" size={11} /> Edit</button>
          </div>
        )}
      </div>
    );
  };
  const DashRow = ({ order }) => {
    const isWO = order._type === "wo"; const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
    const isTerminal = ORDER_TERMINAL.includes(order.status);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, cursor: "pointer" }} onClick={() => onView(order._type, order)}>
        <div style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: isWO ? "#dbeafe" : "#d1fae5", color: isWO ? "#2563eb" : "#059669", flexShrink: 0 }}><OrderIcon name={isWO ? "briefcase" : "shopping"} size={12} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{order.ref}</span><OrderStatusBadge status={order.status} /></div>
          <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(isWO ? order.contractorName : order.supplierName) || "—"}{jd ? " · " + jd.ref : ""}</div>
        </div>
        <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
      </div>
    );
  };
  const StatusPipeline = ({ title, pipelineOrders, pType }) => {
    const isWO = pType === "wo";
    return (
      <div className="card"><div className="card-body">
        <h3 style={{ fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: isWO ? "#dbeafe" : "#d1fae5" }}><OrderIcon name={isWO ? "briefcase" : "shopping"} size={11} cls="" /></div>
          {title}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ORDER_STATUSES.filter(s => s !== "Cancelled").map(s => {
            const matched = pipelineOrders.filter(o => o.status === s);
            const count = matched.length; const pct = pipelineOrders.length > 0 ? (count / pipelineOrders.length) * 100 : 0;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 8, opacity: count > 0 ? 1 : 0.4, cursor: count > 0 ? "pointer" : "default" }} onClick={() => count > 0 && openPanel(s + " — " + title, matched.map(o => ({ ...o, _type: pType })))}>
                <span style={{ fontSize: 11, color: "#64748b", width: 80, flexShrink: 0 }}>{s}</span>
                <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 999, background: ORDER_BAR_COLORS[s], width: pct + "%" }} /></div>
                <span style={{ fontSize: 12, fontWeight: 700, width: 16, textAlign: "right", color: count > 0 ? "#334155" : "#cbd5e1" }}>{count}</span>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="order-kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className="order-kpi-card" style={{ border: `1px solid ${k.borderColor}`, background: k.bg, cursor: "pointer" }} onClick={() => openPanel(k.label, k.orders)}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.textColor, marginTop: 4 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <StatusPipeline title="Work Orders" pipelineOrders={localWO} pType="wo" />
        <StatusPipeline title="Purchase Orders" pipelineOrders={localPO} pType="po" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {[
          { title: "Overdue", icon: "warning", iconBg: "#fef2f2", iconColor: "#dc2626", borderColor: "#fecaca", orders: overdue, empty: "No overdue orders" },
          { title: "Due This Week", icon: "clock", iconBg: "#fff7ed", iconColor: "#ea580c", borderColor: "#fed7aa", orders: dueSoon, empty: "Nothing due in 7 days" },
          { title: "Active Orders", icon: "bar", iconBg: "#eff6ff", iconColor: "#2563eb", borderColor: "#e8e8e8", orders: active, empty: "No active orders" },
        ].map(({ title, icon, iconBg, iconColor, borderColor, orders, empty }) => (
          <div key={title} className="card" style={{ borderColor }}>
            <div className="card-header" style={{ cursor: orders.length > 0 ? "pointer" : "default" }} onClick={() => orders.length > 0 && openPanel(title, orders)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: iconBg }}><OrderIcon name={icon} size={13} cls="" style={{ color: iconColor }} /></div>
                <span className="card-title">{title}</span>
                {orders.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: iconColor, padding: "1px 6px", borderRadius: 10 }}>{orders.length}</span>}
              </div>
            </div>
            <div className="card-body">
              {orders.length === 0 ? <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: 24 }}>{empty}</div>
                : <>{orders.slice(0, 5).map(o => <DashRow key={o.id} order={o} />)}{orders.length > 5 && <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", cursor: "pointer", paddingTop: 8 }} onClick={() => openPanel(title, orders)}>+{orders.length - 5} more</div>}</>}
            </div>
          </div>
        ))}
      </div>
      {/* Side Panel */}
      {panel && (
        <div className="order-panel">
          <div className="order-panel-backdrop" onClick={() => setPanel(null)} />
          <div className="order-panel-body">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e8e8e8", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", flexShrink: 0 }}>
              <div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>Dashboard</div><div style={{ fontWeight: 700, fontSize: 15 }}>{panel.label}</div><div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{panel.orders.length} order{panel.orders.length !== 1 ? "s" : ""}</div></div>
              <button onClick={() => setPanel(null)} style={{ padding: 8, borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><OrderIcon name="x" size={16} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {panel.orders.length === 0 ? <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: 48 }}>No orders in this view</div>
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
