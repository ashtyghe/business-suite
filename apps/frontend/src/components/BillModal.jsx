import { useState } from "react";
import { SectionDrawer, StatusBadge, BillStatusBadge, BILL_CATEGORIES, BILL_STATUSES, BILL_STATUS_LABELS } from "./shared";
import { Icon } from "./Icon";
import { ViewField, SECTION_COLORS } from "../fixtures/seedData.jsx";
import { fmt } from "../utils/helpers";
import { extractBillFromImage } from "../lib/supabase";

const BillModal = ({ bill, jobs, onSave, onClose, defaultJobId }) => {
  const blank = {
    supplier: "", invoiceNo: "", date: new Date().toISOString().slice(0,10),
    amount: "", hasGst: true, markup: 0,
    jobId: defaultJobId || null, category: "Materials", description: "", notes: "", status: "inbox",
    capturedAt: new Date().toISOString().slice(0,10),
  };
  const isNew = !bill;
  const [form, setForm] = useState(bill ? { ...bill } : blank);
  const [mode, setMode] = useState(isNew ? "edit" : "view");
  const [imagePreview, setImagePreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [extracted, setExtracted] = useState(false);
  const [lineItems, setLineItems] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const exGst = form.hasGst ? (parseFloat(form.amount) || 0) / 1.1 : (parseFloat(form.amount) || 0);
  const gst   = form.hasGst ? (parseFloat(form.amount) || 0) - exGst : 0;
  const withMarkup = exGst * (1 + (parseFloat(form.markup) || 0) / 100);

  const handleFile = async (file) => {
    if (!file) return;
    setExtractError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      setExtracting(true);
      try {
        const data = await extractBillFromImage(base64, mimeType);
        if (data) {
          setForm(f => ({
            ...f,
            supplier: data.supplier || f.supplier,
            invoiceNo: data.invoiceNo || f.invoiceNo,
            date: data.date || f.date,
            amount: data.amount != null ? data.amount : f.amount,
            hasGst: data.hasGst != null ? data.hasGst : f.hasGst,
            category: data.category || f.category,
            description: data.description || f.description,
            notes: data.notes || f.notes,
          }));
          if (Array.isArray(data.lineItems) && data.lineItems.length > 0) {
            setLineItems(data.lineItems);
          }
          setExtracted(true);
        } else {
          setExtractError("AI extraction not available — fill in manually.");
        }
      } catch (err) {
        setExtractError(err.message || "Extraction failed — fill in manually.");
      } finally {
        setExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  };

  const handleSave = () => {
    const amt = parseFloat(form.amount) || 0;
    const exG = form.hasGst ? amt / 1.1 : amt;
    onSave({
      ...form,
      ...(bill?.id ? { id: bill.id } : {}),
      amount: amt,
      amountExGst: parseFloat(exG.toFixed(2)),
      gstAmount: parseFloat((amt - exG).toFixed(2)),
      jobId: form.jobId || null,
      markup: parseFloat(form.markup) || 0,
      capturedAt: bill?.capturedAt || new Date().toISOString().slice(0,10),
      status: form.jobId && form.status === "inbox" ? "linked" : form.status,
    });
  };

  const handleSaveAndView = () => { handleSave(); setMode("view"); };
  const linkedJob = jobs.find(j => String(j.id) === String(form.jobId));

  return (
    <SectionDrawer
      accent={SECTION_COLORS.bills.accent}
      icon={<Icon name="bills" size={16} />}
      typeLabel="Bill"
      title={bill ? (bill.invoiceNo || bill.supplier || "Edit Bill") : "Capture Receipt"}
      statusBadge={bill ? <StatusBadge status={form.status} /> : null}
      mode={mode} setMode={setMode}
      showToggle={!isNew}
      isNew={isNew}
      footer={mode === "view" ? <>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.bills.accent, color: "#fff", border: "none" }} onClick={() => setMode("edit")}>
          <Icon name="edit" size={13} /> Edit
        </button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={() => bill ? setMode("view") : onClose()}>{bill ? "Cancel" : "Cancel"}</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.bills.accent, color: "#fff", border: "none" }} onClick={isNew ? handleSave : handleSaveAndView} disabled={!form.supplier || !form.amount}>
          <Icon name="check" size={13} /> {isNew ? "Capture Bill" : "Save Changes"}
        </button>
      </>}
      onClose={onClose}
      zIndex={1060}
    >
      {mode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Supplier Details</div>
          <div className="grid-2">
            <ViewField label="Supplier" value={form.supplier} />
            <ViewField label="Invoice / Receipt #" value={form.invoiceNo} />
          </div>
          <div className="grid-2">
            <ViewField label="Date" value={form.date} />
            <ViewField label="Category" value={form.category} />
          </div>
          <ViewField label="Description" value={form.description} />

          <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 4, paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Amount & Tax</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: SECTION_COLORS.bills.accent, marginBottom: 8 }}>{fmt(parseFloat(form.amount) || 0)}</div>
            {parseFloat(form.amount) > 0 && (
              <div style={{ background: SECTION_COLORS.bills.light, borderRadius: 8, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: "#999" }}>Ex-GST </span><strong>{fmt(exGst)}</strong></div>
                <div><span style={{ color: "#999" }}>GST </span><strong>{fmt(gst)}</strong></div>
                <div style={{ marginLeft: "auto" }}><span style={{ color: "#999" }}>Total </span><strong>{fmt(parseFloat(form.amount)||0)}</strong></div>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Job Allocation</div>
            <ViewField label="Linked Job" value={linkedJob?.title || "Unallocated"} />
            {parseFloat(form.markup) > 0 && <ViewField label="Markup" value={`${form.markup}% → ${fmt(withMarkup)} ex-GST`} />}
          </div>

          {form.notes && (
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
              <ViewField label="Internal Notes" value={form.notes} />
            </div>
          )}
        </div>
      ) : (
      <div style={{ padding: "20px 24px" }}>

          {/* AI Image Upload — only for new bills */}
          {isNew && (
            <div style={{ marginBottom: 20 }}>
              {!imagePreview ? (
                <div
                  className={`bill-upload-zone${dragging ? " dragging" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={e => handleFile(e.target.files?.[0])}
                  />
                  <Icon name="camera" size={28} />
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>Upload receipt or invoice</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Take a photo or drag & drop an image — AI will extract the details</div>
                </div>
              ) : (
                <div className="bill-preview-wrap">
                  <img src={imagePreview} alt="Receipt preview" className="bill-preview-img" />
                  <div className="bill-preview-info">
                    {extracting && (
                      <div className="bill-extracting">
                        <div className="bill-spinner" />
                        <span>Analysing receipt with AI...</span>
                      </div>
                    )}
                    {extracted && !extracting && (
                      <div style={{ color: "#1e7e34", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        <Icon name="check" size={14} /> Data extracted — review below
                      </div>
                    )}
                    {extractError && !extracting && (
                      <div style={{ color: "#c0392b", fontSize: 13 }}>{extractError}</div>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => { setImagePreview(null); setExtracted(false); setExtractError(null); setLineItems([]); }}>
                      Remove image
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extracted Line Items */}
          {lineItems.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 8 }}>Extracted Line Items</div>
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th style={{ width: "50%" }}>Item</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Unit Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td style={{ textAlign: "right" }}>{item.qty ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{item.unitPrice != null ? fmt(item.unitPrice) : "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{item.total != null ? fmt(item.total) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Supplier & Reference */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Supplier Details</div>
          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label className="form-label">Supplier Name *</label>
              <input className="form-control" value={form.supplier} onChange={e => setForm(f=>({...f, supplier: e.target.value}))} placeholder="e.g. Bunnings, ElecPro…" />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice / Receipt #</label>
              <input className="form-control" value={form.invoiceNo} onChange={e => setForm(f=>({...f, invoiceNo: e.target.value}))} placeholder="e.g. INV-1234" />
            </div>
          </div>
          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label className="form-label">Bill Date</label>
              <input type="date" className="form-control" value={form.date} onChange={e => setForm(f=>({...f, date: e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={e => setForm(f=>({...f, category: e.target.value}))}>
                {BILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" value={form.description} onChange={e => setForm(f=>({...f, description: e.target.value}))} placeholder="What was purchased / what work was performed…" />
          </div>

          {/* Amount & GST */}
          <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 4, paddingTop: 16, marginBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Amount & Tax</div>
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="form-group">
                <label className="form-label">Total Amount (as on receipt)</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>$</span>
                  <input type="number" className="form-control" style={{ paddingLeft: 24 }} value={form.amount} onChange={e => setForm(f=>({...f, amount: e.target.value}))} placeholder="0.00" min="0" step="0.01" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">GST</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16, height: 40 }}>
                  <label className="checkbox-label" style={{ fontWeight: 600, fontSize: 13 }}>
                    <input type="checkbox" checked={form.hasGst} onChange={e => setForm(f=>({...f, hasGst: e.target.checked}))} />
                    Includes GST (10%)
                  </label>
                </div>
              </div>
            </div>
            {/* GST breakdown */}
            {parseFloat(form.amount) > 0 && (
              <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: "#999" }}>Ex-GST </span><strong>{fmt(exGst)}</strong></div>
                <div><span style={{ color: "#999" }}>GST </span><strong>{fmt(gst)}</strong></div>
                <div style={{ marginLeft: "auto" }}><span style={{ color: "#999" }}>Total (inc.) </span><strong>{fmt(parseFloat(form.amount)||0)}</strong></div>
              </div>
            )}
          </div>

          {/* Link to job & markup */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Job Allocation & Markup</div>
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="form-group">
                <label className="form-label">Link to Job</label>
                <select className="form-control" value={form.jobId || ""} onChange={e => setForm(f=>({...f, jobId: e.target.value || null}))}>
                  <option value="">— Unallocated (Inbox) —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Markup % (on-charge to client)</label>
                <div style={{ position: "relative" }}>
                  <input type="number" className="form-control" style={{ paddingRight: 32 }} value={form.markup} onChange={e => setForm(f=>({...f, markup: e.target.value}))} placeholder="0" min="0" max="200" />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>%</span>
                </div>
                {parseFloat(form.markup) > 0 && parseFloat(form.amount) > 0 && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    On-charge: <strong style={{ color: "#111" }}>{fmt(withMarkup)}</strong> (ex-GST + {form.markup}%)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Internal Notes</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f=>({...f, notes: e.target.value}))} placeholder="Any notes for approver, discrepancies, receipt condition…" style={{ minHeight: 60 }} />
            </div>
          </div>

      </div>
      )}
    </SectionDrawer>
  );
};

export { BillModal };
