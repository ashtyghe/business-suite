import { useState, useRef, useEffect } from "react";

const PdfFormFiller = ({ pdfData, fileName, onSave, onClose, existingFields }) => {
  const containerRef = useRef(null);
  const canvasRefs = useRef([]);
  const [pages, setPages] = useState([]);
  const [scale, setScale] = useState(1.2);
  const [tool, setTool] = useState("select"); // select | text | checkbox | signature | delete
  const [fields, setFields] = useState(existingFields || []);
  const [selectedField, setSelectedField] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [sigModal, setSigModal] = useState(null); // field id to assign signature to
  const sigCanvasRef = useRef(null);
  const sigPadRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fitWidth, setFitWidth] = useState(true);
  const pdfBytesRef = useRef(pdfData);
  const pdfLibRef = useRef(null); // { PDFDocument, rgb, StandardFonts }
  const sigPadClassRef = useRef(null); // SignaturePad constructor

  // Load PDF and detect existing form fields
  useEffect(() => {
    if (!pdfData) return;
    let cancelled = false;
    const load = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
        setPdfDoc(doc);
        const pgs = [];
        const detectedFields = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          pgs.push({ page, width: vp.width, height: vp.height });

          // Detect AcroForm fields on this page
          const annotations = await page.getAnnotations();
          for (const annot of annotations) {
            if (!annot.rect || annot.rect.length < 4) continue;
            const fieldType = annot.fieldType;
            const subtype = annot.subtype;
            if (subtype !== "Widget" && !fieldType) continue;

            // Convert PDF coords (bottom-left origin) to canvas coords (top-left origin)
            const [x1, y1, x2, y2] = annot.rect;
            const canvasX = x1;
            const canvasY = vp.height - y2;
            const canvasW = Math.max(20, x2 - x1);
            const canvasH = Math.max(16, y2 - y1);

            const id = genId();
            const fieldName = annot.fieldName || annot.alternativeText || "";
            const fieldValue = annot.fieldValue || annot.buttonValue || "";

            if (fieldType === "Tx" || (!fieldType && canvasW > 30 && canvasH >= 14 && canvasH <= 60)) {
              // Text field
              detectedFields.push({ id, type: "text", page: i - 1, x: canvasX, y: canvasY, width: canvasW, height: canvasH, value: typeof fieldValue === "string" ? fieldValue : "", label: fieldName, acroField: true });
            } else if (fieldType === "Btn") {
              if (annot.checkBox) {
                // Checkbox
                detectedFields.push({ id, type: "checkbox", page: i - 1, x: canvasX, y: canvasY, width: Math.min(canvasW, canvasH), height: Math.min(canvasW, canvasH), value: fieldValue === "Yes" || fieldValue === "On" || annot.exportValue === fieldValue, label: fieldName, acroField: true });
              } else if (annot.radioButton) {
                // Radio button — treat as checkbox
                detectedFields.push({ id, type: "checkbox", page: i - 1, x: canvasX, y: canvasY, width: Math.min(canvasW, canvasH), height: Math.min(canvasW, canvasH), value: false, label: fieldName, acroField: true });
              }
            } else if (fieldType === "Sig") {
              // Signature field
              detectedFields.push({ id, type: "signature", page: i - 1, x: canvasX, y: canvasY, width: canvasW, height: canvasH, value: "", label: fieldName, acroField: true });
            } else if (fieldType === "Ch") {
              // Choice/dropdown — treat as text
              detectedFields.push({ id, type: "text", page: i - 1, x: canvasX, y: canvasY, width: canvasW, height: canvasH, value: typeof fieldValue === "string" ? fieldValue : "", label: fieldName, acroField: true });
            }
          }
        }
        if (!cancelled) {
          setPages(pgs);
          // Only set detected fields if we don't already have existing fields and we found AcroForm fields
          if (detectedFields.length > 0 && (!existingFields || existingFields.length === 0)) {
            setFields(detectedFields);
            setTool("select"); // Switch to select mode so user can just click and fill
          }
        }
      } catch (err) {
        console.error("Failed to load PDF:", err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pdfData]);

  // Render pages to canvases
  useEffect(() => {
    if (pages.length === 0) return;
    pages.forEach((pg, idx) => {
      const canvas = canvasRefs.current[idx];
      if (!canvas) return;
      const vp = pg.page.getViewport({ scale });
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, vp.width, vp.height);
      pg.page.render({ canvasContext: ctx, viewport: vp });
    });
  }, [pages, scale]);

  // Fit to width
  useEffect(() => {
    if (!fitWidth || pages.length === 0 || !containerRef.current) return;
    const containerW = containerRef.current.clientWidth - 48;
    const pageW = pages[0].width;
    if (pageW > 0) {
      setScale(containerW / pageW);
      setFitWidth(false);
    }
  }, [pages, fitWidth]);

  // Signature pad setup
  useEffect(() => {
    if (sigModal && sigCanvasRef.current && !sigPadRef.current) {
      const initSigPad = async () => {
        if (!sigPadClassRef.current) {
          const mod = await import("signature_pad");
          sigPadClassRef.current = mod.default;
        }
        if (sigCanvasRef.current && !sigPadRef.current) {
          sigPadRef.current = new sigPadClassRef.current(sigCanvasRef.current, {
            backgroundColor: "rgba(255,255,255,0)",
            penColor: "#000",
          });
        }
      };
      initSigPad();
    }
    if (!sigModal) {
      sigPadRef.current = null;
    }
  }, [sigModal]);

  const handlePageClick = (e, pageIdx) => {
    if (tool === "select" || tool === "delete") return;
    const canvas = canvasRefs.current[pageIdx];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const id = genId();
    if (tool === "text") {
      setFields(prev => [...prev, { id, type: "text", page: pageIdx, x, y, width: 180, height: 28, value: "" }]);
      setSelectedField(id);
    } else if (tool === "checkbox") {
      setFields(prev => [...prev, { id, type: "checkbox", page: pageIdx, x: x - 10, y: y - 10, width: 20, height: 20, value: false }]);
      setSelectedField(id);
    } else if (tool === "signature") {
      setFields(prev => [...prev, { id, type: "signature", page: pageIdx, x: x - 75, y: y - 25, width: 150, height: 50, value: "" }]);
      setSigModal(id);
      setSelectedField(id);
    }
  };

  const handleFieldMouseDown = (e, field) => {
    e.stopPropagation();
    if (tool === "delete") {
      setFields(prev => prev.filter(f => f.id !== field.id));
      if (selectedField === field.id) setSelectedField(null);
      return;
    }
    setSelectedField(field.id);
    if (tool === "select") {
      const rect = e.currentTarget.getBoundingClientRect();
      setDragging({ id: field.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
    }
  };

  const handleMouseMove = useCallback((e) => {
    if (dragging) {
      const field = fields.find(f => f.id === dragging.id);
      if (!field) return;
      const canvas = canvasRefs.current[field.page];
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - dragging.offsetX;
      const y = e.clientY - rect.top - dragging.offsetY;
      setFields(prev => prev.map(f => f.id === dragging.id ? { ...f, x: Math.max(0, x), y: Math.max(0, y) } : f));
    }
    if (resizing) {
      const field = fields.find(f => f.id === resizing.id);
      if (!field) return;
      const canvas = canvasRefs.current[field.page];
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(30, e.clientX - rect.left - field.x);
      const h = Math.max(16, e.clientY - rect.top - field.y);
      setFields(prev => prev.map(f => f.id === resizing.id ? { ...f, width: w, height: h } : f));
    }
  }, [dragging, resizing, fields]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  const saveSignature = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) return;
    const dataUrl = sigPadRef.current.toDataURL("image/png");
    setFields(prev => prev.map(f => f.id === sigModal ? { ...f, value: dataUrl } : f));
    setSigModal(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!pdfLibRef.current) {
        pdfLibRef.current = await import("pdf-lib");
      }
      const { PDFDocument: PDFDoc, rgb: pdfRgb, StandardFonts: Fonts } = pdfLibRef.current;
      const pdfDocLib = await PDFDoc.load(pdfBytesRef.current);
      const helvetica = await pdfDocLib.embedFont(Fonts.Helvetica);
      const pdfPages = pdfDocLib.getPages();

      for (const field of fields) {
        if (field.page >= pdfPages.length) continue;
        const page = pdfPages[field.page];
        const { width: pw, height: ph } = page.getSize();
        const pageInfo = pages[field.page];
        if (!pageInfo) continue;
        const scaleX = pw / (pageInfo.width * scale);
        const scaleY = ph / (pageInfo.height * scale);
        const pdfX = field.x * scaleX;
        const pdfY = ph - (field.y + field.height) * scaleY;

        if (field.type === "text" && field.value) {
          const fontSize = Math.min(14, field.height * scaleY * 0.6);
          page.drawText(field.value, { x: pdfX + 2, y: pdfY + 4, size: fontSize, font: helvetica, color: pdfRgb(0, 0, 0) });
        } else if (field.type === "checkbox" && field.value) {
          const sz = Math.min(field.width, field.height) * scaleX;
          page.drawRectangle({ x: pdfX, y: pdfY, width: sz, height: sz, color: pdfRgb(0, 0, 0) });
          page.drawText("✓", { x: pdfX + 2, y: pdfY + 2, size: sz * 0.8, font: helvetica, color: pdfRgb(1, 1, 1) });
        } else if (field.type === "signature" && field.value) {
          try {
            const sigBytes = await fetch(field.value).then(r => r.arrayBuffer());
            const sigImg = await pdfDocLib.embedPng(new Uint8Array(sigBytes));
            const sigW = field.width * scaleX;
            const sigH = field.height * scaleY;
            page.drawImage(sigImg, { x: pdfX, y: pdfY, width: sigW, height: sigH });
          } catch (err) {
            console.error("Failed to embed signature:", err);
          }
        }
      }

      const filledBytes = await pdfDocLib.save();
      const blob = new Blob([filledBytes], { type: "application/pdf" });

      // Generate thumbnail from first page
      let thumbnail = null;
      if (canvasRefs.current[0]) {
        const thumbCanvas = document.createElement("canvas");
        const srcCanvas = canvasRefs.current[0];
        const thumbScale = 120 / srcCanvas.width;
        thumbCanvas.width = 120;
        thumbCanvas.height = srcCanvas.height * thumbScale;
        const ctx = thumbCanvas.getContext("2d");
        ctx.drawImage(srcCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbnail = thumbCanvas.toDataURL("image/png", 0.7);
      }

      // Download
      const baseName = (fileName || "document").replace(/\.pdf$/i, "");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = baseName + "_filled.pdf";
      link.click();
      URL.revokeObjectURL(link.href);

      // Convert blob to data URL for storage
      const reader = new FileReader();
      reader.onload = () => {
        onSave({ filledPdfDataUrl: reader.result, thumbnail, fields, fileName: baseName + "_filled.pdf" });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Failed to save PDF:", err);
      alert("Failed to save PDF: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const tools = [
    { id: "select", label: "Select", icon: "🔘" },
    { id: "text", label: "Text", icon: "T" },
    { id: "checkbox", label: "Check", icon: "☑" },
    { id: "signature", label: "Sign", icon: "✍️" },
    { id: "delete", label: "Delete", icon: "🗑" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "#1e293b", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "#0f172a", borderBottom: "1px solid #334155", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>✕</button>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginRight: 12 }}>{fileName || "PDF Form Filler"}</div>
        <div style={{ display: "flex", gap: 2, background: "#1e293b", borderRadius: 8, padding: 2 }}>
          {tools.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: tool === t.id ? "#3b82f6" : "transparent", color: tool === t.id ? "#fff" : "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        {fields.some(f => f.acroField) && (
          <div style={{ fontSize: 11, color: "#34d399", background: "rgba(52,211,153,0.1)", padding: "4px 10px", borderRadius: 6, fontWeight: 600 }}>
            {fields.filter(f => f.acroField).length} form fields detected
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setScale(s => Math.max(0.3, s - 0.15))} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #475569", background: "#1e293b", color: "#e2e8f0", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>−</button>
          <span style={{ color: "#94a3b8", fontSize: 12, minWidth: 42, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.15))} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #475569", background: "#1e293b", color: "#e2e8f0", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>+</button>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, marginLeft: 12 }}>
          {saving ? "Saving…" : "Save & Download"}
        </button>
      </div>

      {/* PDF Pages */}
      <div ref={containerRef} style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        {pages.length === 0 && (
          <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 80 }}>Loading PDF…</div>
        )}
        {pages.map((pg, idx) => (
          <div key={idx} style={{ position: "relative", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", borderRadius: 4, overflow: "hidden", cursor: tool === "text" ? "crosshair" : tool === "checkbox" ? "crosshair" : tool === "signature" ? "crosshair" : tool === "delete" ? "not-allowed" : "default" }}
            onClick={(e) => handlePageClick(e, idx)}>
            <canvas ref={el => canvasRefs.current[idx] = el} style={{ display: "block" }} />
            {/* Overlay fields */}
            {fields.filter(f => f.page === idx).map(field => (
              <div key={field.id}
                onMouseDown={(e) => handleFieldMouseDown(e, field)}
                style={{
                  position: "absolute", left: field.x, top: field.y, width: field.width, height: field.height,
                  border: selectedField === field.id ? "2px solid #3b82f6" : "1px dashed rgba(59,130,246,0.5)",
                  borderRadius: 3, cursor: tool === "delete" ? "not-allowed" : tool === "select" ? "move" : "default",
                  background: field.type === "text" ? "rgba(255,255,255,0.85)" : field.type === "checkbox" ? "rgba(255,255,255,0.7)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: field.type === "checkbox" ? "center" : "flex-start",
                  boxSizing: "border-box",
                }}>
                {field.type === "text" && (
                  <>
                    {field.acroField && field.label && !field.value && (
                      <div style={{ position: "absolute", top: -14, left: 0, fontSize: 8, color: "#3b82f6", fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none" }}>{field.label}</div>
                    )}
                    <input type="text" value={field.value} placeholder={field.label || "Type here…"}
                      onChange={(e) => setFields(prev => prev.map(f => f.id === field.id ? { ...f, value: e.target.value } : f))}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", height: "100%", border: "none", background: "transparent", padding: "2px 4px", fontSize: Math.min(14, field.height * 0.6), fontFamily: "inherit", outline: "none", color: "#000", boxSizing: "border-box" }} />
                  </>
                )}
                {field.type === "checkbox" && (
                  <div onClick={(e) => { e.stopPropagation(); setFields(prev => prev.map(f => f.id === field.id ? { ...f, value: !f.value } : f)); }}
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: Math.min(16, field.height * 0.8), fontWeight: 700, color: field.value ? "#059669" : "#ccc", userSelect: "none" }}>
                    {field.value ? "✓" : "☐"}
                  </div>
                )}
                {field.type === "signature" && (
                  <div onClick={(e) => { e.stopPropagation(); setSigModal(field.id); }}
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}>
                    {field.value ? (
                      <img src={field.value} alt="Signature" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    ) : (
                      <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Click to sign</span>
                    )}
                  </div>
                )}
                {/* Resize handle */}
                {selectedField === field.id && tool === "select" && (
                  <div onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: field.id }); }}
                    style={{ position: "absolute", right: -4, bottom: -4, width: 10, height: 10, background: "#3b82f6", borderRadius: 2, cursor: "nwse-resize", border: "1px solid #fff" }} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Signature Modal */}
      {sigModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSigModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, maxWidth: "90vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Draw Signature</h3>
              <button onClick={() => setSigModal(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>✕</button>
            </div>
            <canvas ref={sigCanvasRef} width={380} height={150} style={{ border: "2px solid #e2e8f0", borderRadius: 8, width: "100%", height: 150, touchAction: "none" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => sigPadRef.current?.clear()} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Clear</button>
              <button onClick={saveSignature} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Apply Signature</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { PdfFormFiller };
