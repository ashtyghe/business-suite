import { useState, useRef, useEffect } from "react";
import s from './FormFillerModal.module.css';

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
    <div className={s.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={s.panel}>
        <div className={s.header}>
          <span className={s.headerIcon}>{template.icon}</span>
          <h3 className={s.headerTitle}>{template.name}</h3>
          <div className={s.headerSpacer} />
          <button onClick={onClose} className={s.closeBtn}>✕</button>
        </div>

        {template.fields.map(field => (
          <div key={field.key} className={s.fieldGroup}>
            <label className={s.fieldLabel}>{field.label}</label>
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
              <textarea className={`form-control ${s.textarea}`} rows={3} value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "checklist" && (
              <div className={s.checklistWrap}>
                {(field.options || []).map((opt, i) => (
                  <label key={i} className={s.checklistLabel}>
                    <input type="checkbox" checked={(formData[field.key] || []).includes(opt)} onChange={() => toggleChecklist(field.key, opt)} className={s.checkbox} />
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {field.type === "signature" && (
              <div>
                {formData[field.key] && sigField !== field.key ? (
                  <div>
                    <img src={formData[field.key]} alt="Signature" className={s.signaturePreview} />
                    <button className="btn btn-ghost btn-xs" onClick={() => { setSigField(field.key); setFormData(d => ({ ...d, [field.key]: "" })); }}>Re-sign</button>
                  </div>
                ) : (
                  <div>
                    <canvas ref={sigField === field.key ? canvasRef : undefined} width={400} height={120}
                      className={s.signatureCanvas}
                      onMouseDown={e => { setSigField(field.key); startDraw(e); }}
                      onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                      onTouchStart={e => { setSigField(field.key); startDraw(e); }}
                      onTouchMove={draw} onTouchEnd={endDraw}
                      onClick={() => setSigField(field.key)}
                    />
                    <button className={`btn btn-ghost btn-xs ${s.clearBtn}`} onClick={clearSig}>Clear</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div className={s.footer}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className={`btn btn-sm ${s.saveNotesBtn}`} onClick={() => onSave(formData, false)}>Save to Notes</button>
          <button className={`btn btn-sm ${s.savePdfBtn}`} onClick={() => onSave(formData, true)}>Save & Print PDF</button>
        </div>
      </div>
    </div>
  );
};

export { FormFillerModal };
