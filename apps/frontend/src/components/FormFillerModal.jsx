import { useState, useRef, useEffect } from "react";

const FormFillerModal = ({ template, job, client, site, onSave, onClose }) => {
  const canvasRef = useRef(null);
  const [formData, setFormData] = useState(() => {
    const defaults = {};
    template.fields.forEach(f => {
      if (f.type === "checklist") defaults[f.key] = [];
      else if (f.type === "date") defaults[f.key] = new Date().toISOString().slice(0, 10);
      else if (f.type === "time") defaults[f.key] = "";
      else if (f.key === "jobDescription" || f.key === "workPerformed") defaults[f.key] = job?.description || "";
      else if (f.key === "location" || f.key === "site") defaults[f.key] = site?.name || site?.address || "";
      else if (f.key === "client") defaults[f.key] = client?.name || "";
      else if (f.key === "supervisor" || f.key === "technician" || f.key === "worker") defaults[f.key] = (job?.assignedTo || [])[0] || "";
      else defaults[f.key] = "";
    });
    return defaults;
  });
  const [sigField, setSigField] = useState(null);
  const [drawing, setDrawing] = useState(false);

  const startDraw = (e) => {
    setDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };
  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    if (sigField && canvasRef.current) {
      setFormData(d => ({ ...d, [sigField]: canvasRef.current.toDataURL() }));
    }
  };
  const clearSig = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (sigField) setFormData(d => ({ ...d, [sigField]: "" }));
    }
  };

  const toggleChecklist = (key, opt) => {
    setFormData(d => {
      const arr = d[key] || [];
      return { ...d, [key]: arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt] };
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 20 }}>{template.icon}</span>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{template.name}</h3>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        {template.fields.map(field => (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4, display: "block" }}>{field.label}</label>
            {field.type === "text" && (
              <input className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "date" && (
              <input type="date" className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "time" && (
              <input type="time" className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "textarea" && (
              <textarea className="form-control" rows={3} value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} style={{ resize: "vertical", fontFamily: "inherit" }} />
            )}
            {field.type === "checklist" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {(field.options || []).map((opt, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}>
                    <input type="checkbox" checked={(formData[field.key] || []).includes(opt)} onChange={() => toggleChecklist(field.key, opt)} style={{ width: 16, height: 16, accentColor: "#2563eb" }} />
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {field.type === "signature" && (
              <div>
                {formData[field.key] && sigField !== field.key ? (
                  <div>
                    <img src={formData[field.key]} alt="Signature" style={{ maxWidth: 300, height: 80, border: "1px solid #e2e8f0", borderRadius: 6, marginBottom: 4 }} />
                    <button className="btn btn-ghost btn-xs" onClick={() => { setSigField(field.key); setFormData(d => ({ ...d, [field.key]: "" })); }}>Re-sign</button>
                  </div>
                ) : (
                  <div>
                    <canvas ref={sigField === field.key ? canvasRef : undefined} width={400} height={120}
                      style={{ border: "2px solid #e2e8f0", borderRadius: 8, cursor: "crosshair", touchAction: "none", display: "block", background: "#fafafa" }}
                      onMouseDown={e => { setSigField(field.key); startDraw(e); }}
                      onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                      onTouchStart={e => { setSigField(field.key); startDraw(e); }}
                      onTouchMove={draw} onTouchEnd={endDraw}
                      onClick={() => setSigField(field.key)}
                    />
                    <button className="btn btn-ghost btn-xs" style={{ marginTop: 4 }} onClick={clearSig}>Clear</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} onClick={() => onSave(formData, false)}>Save to Notes</button>
          <button className="btn btn-sm" style={{ background: "#059669", color: "#fff", border: "none" }} onClick={() => onSave(formData, true)}>Save & Print PDF</button>
        </div>
      </div>
    </div>
  );
};

export { FormFillerModal };
