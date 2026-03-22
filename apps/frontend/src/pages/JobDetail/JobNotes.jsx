import { useState, useRef } from "react";
import { useAppStore } from "../../lib/store";
import { FileIconBadge, OrderIcon } from "../../components/shared";
import { PhotoMarkupEditor } from "../../components/PhotoMarkupEditor";
import { PlanDrawingEditor } from "../../components/PlanDrawingEditor";
import { FormFillerModal } from "../../components/FormFillerModal";
import { PdfFormFiller } from "../../components/PdfFormFiller";
import { NOTE_CATEGORIES, FORM_TEMPLATES, SECTION_COLORS } from "../../fixtures/seedData.jsx";
import { addLog, genId, fmtFileSize, CURRENT_USER } from "../../utils/helpers";

const JobNotes = ({ job }) => {
  const { clients, jobs, setJobs } = useAppStore();
  const client = clients.find(c => c.id === job.clientId);
  const jobAccent = SECTION_COLORS.jobs.accent;
  const jobNotes = job.notes || [];

  // ── Notes state & CRUD ──
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ text: "", category: "general", attachments: [] });
  const [noteFilter, setNoteFilter] = useState("all");
  const [lightboxImg, setLightboxImg] = useState(null);
  const [markupImg, setMarkupImg] = useState(null); // { src, noteId, attachmentId } or { src, target: "new" }
  const [showPlanDrawing, setShowPlanDrawing] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteForm, setEditNoteForm] = useState({ text: "", category: "general", attachments: [] });

  // ── Gantt state ──
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  // ── Tasks state ──
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ text: "", dueDate: "", assignedTo: "" });
  const [showFormFiller, setShowFormFiller] = useState(null);
  const [viewingForm, setViewingForm] = useState(null);
  const [showFormMenu, setShowFormMenu] = useState(false);

  // ── PDF Filler state ──
  const [showPdfFiller, setShowPdfFiller] = useState(null); // { pdfData, fileName, existingFields? }
  const pdfInputRef = useRef(null);

  const handlePdfFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setShowPdfFiller({ pdfData: ev.target.result, fileName: file.name });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handlePdfSave = ({ filledPdfDataUrl, thumbnail, fields: pdfFields, fileName: filledName }) => {
    const note = {
      id: Date.now(), text: `PDF filled: ${filledName}`, category: "general",
      attachments: [{ id: genId(), name: filledName, size: Math.round(filledPdfDataUrl.length * 0.75), type: "application/pdf", dataUrl: filledPdfDataUrl }],
      pdfNote: true, pdfThumbnail: thumbnail, pdfFields: pdfFields, pdfOriginalData: showPdfFiller?.pdfData ? Array.from(new Uint8Array(showPdfFiller.pdfData)) : null,
      createdAt: new Date().toISOString(), createdBy: CURRENT_USER,
    };
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Filled PDF: ${filledName}`) } : j));
    setShowPdfFiller(null);
  };

  const reopenPdfNote = (note) => {
    if (note.pdfOriginalData) {
      const arr = new Uint8Array(note.pdfOriginalData);
      setShowPdfFiller({ pdfData: arr.buffer, fileName: note.attachments?.[0]?.name || "document.pdf", existingFields: note.pdfFields });
    }
  };

  const printFormPdf = (note, tmpl) => {
    const data = note.formData || {};
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${tmpl?.name || "Form"} – ${job.title}</title><style>body{font-family:sans-serif;padding:30px;max-width:700px;margin:0 auto}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:14px;color:#666;margin-top:0}.field{margin-bottom:16px}.label{font-size:11px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:0.05em;margin-bottom:4px}.value{font-size:13px;color:#333;white-space:pre-wrap}.check{display:flex;gap:6px;align-items:center;font-size:13px;margin:2px 0}.check-y{color:#059669;font-weight:700}.check-n{color:#dc2626;font-weight:700}.sig{max-width:300px;height:80px;border:1px solid #ddd;border-radius:4px}.meta{font-size:11px;color:#888;margin-bottom:16px}</style></head><body>`);
    w.document.write(`<h1>${tmpl?.icon || ""} ${tmpl?.name || "Form"}</h1>`);
    w.document.write(`<h2>${job.title}</h2>`);
    w.document.write(`<div class="meta">Completed ${new Date(note.createdAt).toLocaleString()} by ${note.createdBy}</div>`);
    (tmpl?.fields || []).forEach(field => {
      const val = data[field.key];
      w.document.write(`<div class="field"><div class="label">${field.label}</div>`);
      if (field.type === "checklist") {
        (field.options || []).forEach(opt => {
          const checked = (val || []).includes(opt);
          w.document.write(`<div class="check"><span class="${checked ? "check-y" : "check-n"}">${checked ? "✓" : "✗"}</span><span>${opt}</span></div>`);
        });
      } else if (field.type === "signature") {
        w.document.write(val ? `<img class="sig" src="${val}" />` : `<div class="value">No signature</div>`);
      } else {
        w.document.write(`<div class="value">${val || "—"}</div>`);
      }
      w.document.write(`</div>`);
    });
    w.document.write(`</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const addNote = () => {
    if (!noteForm.text.trim() && noteForm.attachments.length === 0) return;
    const note = { id: Date.now(), text: noteForm.text, category: noteForm.category, attachments: noteForm.attachments.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl })), createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
    const catLabel = NOTE_CATEGORIES.find(c => c.id === noteForm.category)?.label || noteForm.category;
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Added note (${catLabel})`) } : j));
    setNoteForm({ text: "", category: "general", attachments: [] });
    setShowNoteForm(false);
  };

  const startEditNote = (note) => {
    setEditingNoteId(note.id);
    setEditNoteForm({ text: note.text, category: note.category, attachments: [...(note.attachments || [])] });
  };

  const saveEditNote = () => {
    if (!editNoteForm.text.trim() && editNoteForm.attachments.length === 0) return;
    const catLabel = NOTE_CATEGORIES.find(c => c.id === editNoteForm.category)?.label || editNoteForm.category;
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: (j.notes || []).map(n => n.id === editingNoteId ? { ...n, text: editNoteForm.text, category: editNoteForm.category, attachments: editNoteForm.attachments.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl })) } : n), activityLog: addLog(j.activityLog, `Edited note (${catLabel})`) } : j));
    setEditingNoteId(null);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditNoteForm({ text: "", category: "general", attachments: [] });
  };

  const handleEditNoteFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { setEditNoteForm(prev => ({ ...prev, attachments: prev.attachments.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x) })); };
        reader.readAsDataURL(m._file);
      }
    });
    setEditNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, ...mapped] }));
    e.target.value = "";
  };

  const deleteNote = (noteId) => {
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: (j.notes || []).filter(n => n.id !== noteId), activityLog: addLog(j.activityLog, "Deleted a note") } : j));
  };

  const handleNoteFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { setNoteForm(prev => ({ ...prev, attachments: prev.attachments.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x) })); };
        reader.readAsDataURL(m._file);
      }
    });
    setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, ...mapped] }));
    e.target.value = "";
  };

  const saveMarkup = (dataUrl) => {
    if (markupImg?.noteId && markupImg?.attachmentId) {
      // Replace existing attachment on a saved note
      setJobs(js => js.map(j => j.id === job.id ? {
        ...j,
        notes: (j.notes || []).map(n => n.id === markupImg.noteId ? {
          ...n,
          attachments: n.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
        } : n),
        activityLog: addLog(j.activityLog, "Photo marked up")
      } : j));
    } else if (markupImg?.target === "new" && markupImg?.attachmentId) {
      // Replace attachment in new note form
      setNoteForm(prev => ({
        ...prev,
        attachments: prev.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
      }));
    } else if (markupImg?.target === "new") {
      // Add marked-up image as new attachment to the current note form (from lightbox)
      const att = { id: genId(), name: "markup_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
      setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, att] }));
    } else if (markupImg?.target === "edit") {
      // Replace attachment in edit form
      setEditNoteForm(prev => ({
        ...prev,
        attachments: prev.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
      }));
    }
    setMarkupImg(null);
  };

  const savePlan = (dataUrl) => {
    const att = { id: genId(), name: "plan_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
    if (showNoteForm) {
      setNoteForm(prev => ({ ...prev, attachments: [...prev.attachments, att], text: prev.text || "Plan drawing" }));
    } else {
      // Auto-create a note with the plan
      const newNote = { id: Date.now(), text: "Plan drawing", category: "general", attachments: [att], createdAt: new Date().toISOString(), createdBy: "Alex Jones" };
      setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), newNote], activityLog: addLog(j.activityLog, "Added plan drawing") } : j));
    }
    setShowPlanDrawing(false);
  };


  return (
    <>
            <div>
              {/* Toolbar */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <select value={noteFilter} onChange={e => setNoteFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", background: "#fff" }}>
                  <option value="all">All Categories</option>
                  {NOTE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div style={{ flex: 1 }} />
                <div style={{ position: "relative" }}>
                  <button className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", border: "none" }} onClick={() => setShowFormMenu(m => !m)}>
                    📋 New Form ▾
                  </button>
                  {showFormMenu && (
                    <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 20, minWidth: 180, overflow: "hidden" }}>
                      {FORM_TEMPLATES.map(tmpl => (
                        <button key={tmpl.id} style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "none", textAlign: "left", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                          onMouseEnter={e => e.target.style.background = "#f8fafc"}
                          onMouseLeave={e => e.target.style.background = "none"}
                          onClick={() => { setShowFormMenu(false); setShowFormFiller(tmpl); }}>
                          {tmpl.icon} {tmpl.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-sm" style={{ background: "#059669", color: "#fff", border: "none" }} onClick={() => setShowPlanDrawing(true)}>
                  📐 Draw Plan
                </button>
                <button className="btn btn-sm" style={{ background: "#7c3aed", color: "#fff", border: "none" }} onClick={() => pdfInputRef.current?.click()}>
                  📄 Fill PDF
                </button>
                <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handlePdfFileSelect} />
                <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => setShowNoteForm(true)}>
                  + Add Note
                </button>
              </div>

              {/* New note form */}
              {showNoteForm && (
                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16 }}>
                  <textarea value={noteForm.text} onChange={e => setNoteForm(prev => ({ ...prev, text: e.target.value }))} placeholder="Write a note…" rows={3} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                  {/* Category pills */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {NOTE_CATEGORIES.map(c => (
                      <button key={c.id} onClick={() => setNoteForm(prev => ({ ...prev, category: c.id }))} style={{ padding: "4px 12px", borderRadius: 20, border: noteForm.category === c.id ? `2px solid ${c.color}` : "1px solid #e2e8f0", background: noteForm.category === c.id ? c.color + "18" : "#fff", color: noteForm.category === c.id ? c.color : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.label}</button>
                    ))}
                  </div>
                  {/* File attachments */}
                  <div style={{ marginTop: 12 }}>
                    {noteForm.attachments.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        {noteForm.attachments.map(f => (
                          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
                            {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                            <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155" }}>{f.name}</span>
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>{fmtFileSize(f.size)}</span>
                            {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => setMarkupImg({ src: f.dataUrl, target: "new", attachmentId: f.id })} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", lineHeight: 1, fontSize: 11 }} title="Mark up">✏️</button>}
                            <button onClick={() => setNoteForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} style={{ padding: 2, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "2px dashed #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
                      <OrderIcon name="upload" size={14} />
                      Attach photos / files
                      <input type="file" multiple style={{ display: "none" }} onChange={handleNoteFiles} accept="*/*" />
                    </label>
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowNoteForm(false); setNoteForm({ text: "", category: "general", attachments: [] }); }}>Cancel</button>
                    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={addNote} disabled={!noteForm.text.trim() && noteForm.attachments.length === 0}>Save Note</button>
                  </div>
                </div>
              )}

              {/* Notes list */}
              {(() => {
                const filtered = [...jobNotes].filter(n => noteFilter === "all" || n.category === noteFilter).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                if (filtered.length === 0) return (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{jobNotes.length === 0 ? "No notes yet" : "No notes match this filter"}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ Add Note" to get started</div>
                  </div>
                );
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {filtered.map(note => {
                      const cat = NOTE_CATEGORIES.find(c => c.id === note.category) || NOTE_CATEGORIES[0];
                      const isEditing = editingNoteId === note.id;
                      if (isEditing) {
                        const eCat = NOTE_CATEGORIES.find(c => c.id === editNoteForm.category) || NOTE_CATEGORIES[0];
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#f8fafc", borderRadius: 10, border: `2px solid ${eCat.color}`, borderLeft: `3px solid ${eCat.color}` }}>
                            <textarea value={editNoteForm.text} onChange={e => setEditNoteForm(prev => ({ ...prev, text: e.target.value }))} rows={3} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                              {NOTE_CATEGORIES.map(c => (
                                <button key={c.id} onClick={() => setEditNoteForm(prev => ({ ...prev, category: c.id }))} style={{ padding: "4px 12px", borderRadius: 20, border: editNoteForm.category === c.id ? `2px solid ${c.color}` : "1px solid #e2e8f0", background: editNoteForm.category === c.id ? c.color + "18" : "#fff", color: editNoteForm.category === c.id ? c.color : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.label}</button>
                              ))}
                            </div>
                            <div style={{ marginTop: 12 }}>
                              {editNoteForm.attachments.length > 0 && (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                                  {editNoteForm.attachments.map(f => (
                                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
                                      {f.dataUrl ? <img src={f.dataUrl} alt={f.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <FileIconBadge name={f.name} />}
                                      <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155" }}>{f.name}</span>
                                      {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => setMarkupImg({ src: f.dataUrl, target: "edit", attachmentId: f.id })} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", lineHeight: 1, fontSize: 11 }} title="Mark up">✏️</button>}
                                      <button onClick={() => setEditNoteForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} style={{ padding: 2, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "2px dashed #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
                                <OrderIcon name="upload" size={14} />
                                Attach photos / files
                                <input type="file" multiple style={{ display: "none" }} onChange={handleEditNoteFiles} accept="*/*" />
                              </label>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                              <button className="btn btn-ghost btn-sm" onClick={cancelEditNote}>Cancel</button>
                              <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={saveEditNote} disabled={!editNoteForm.text.trim() && editNoteForm.attachments.length === 0}>Save</button>
                            </div>
                          </div>
                        );
                      }
                      // ── PDF note card ──
                      if (note.pdfNote) {
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: "3px solid #7c3aed" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {note.pdfThumbnail && <img src={note.pdfThumbnail} alt="PDF" style={{ width: 48, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid #e2e8f0" }} />}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <span style={{ padding: "2px 10px", borderRadius: 20, background: "#7c3aed18", color: "#7c3aed", fontSize: 11, fontWeight: 700 }}>PDF</span>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.attachments?.[0]?.name || "Filled PDF"}</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()} · {note.createdBy}</div>
                              </div>
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); reopenPdfNote(note); }} style={{ fontSize: 11 }}>✏️ Edit</button>
                              {note.attachments?.[0]?.dataUrl && (
                                <a href={note.attachments[0].dataUrl} download={note.attachments[0].name} onClick={e => e.stopPropagation()} style={{ padding: "4px 10px", borderRadius: 6, background: "#f1f5f9", border: "none", color: "#3b82f6", fontSize: 11, fontWeight: 600, textDecoration: "none", cursor: "pointer" }}>⬇ Download</a>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete">🗑</button>
                            </div>
                          </div>
                        );
                      }
                      // ── Form note card ──
                      if (note.category === "form" && note.formType) {
                        const tmpl = FORM_TEMPLATES.find(t => t.id === note.formType);
                        return (
                          <div key={note.id} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: `3px solid ${cat.color}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 16 }}>{tmpl?.icon || "📋"}</span>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{tmpl?.name || note.formType}</span>
                              <span style={{ padding: "2px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 11, fontWeight: 700 }}>Form</span>
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()}</span>
                              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{note.createdBy}</span>
                              <div style={{ flex: 1 }} />
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); setViewingForm(note); }} style={{ fontSize: 11 }}>👁 View</button>
                              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); printFormPdf(note, tmpl); }} style={{ fontSize: 11 }}>🖨️ PDF</button>
                              <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete">🗑</button>
                            </div>
                            {note.text && <div style={{ fontSize: 12, color: "#666" }}>{note.text}</div>}
                          </div>
                        );
                      }
                      // ── Regular note card ──
                      return (
                        <div key={note.id} onClick={() => startEditNote(note)} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: `3px solid ${cat.color}`, cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ padding: "2px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 11, fontWeight: 700 }}>{cat.label}</span>
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()}</span>
                            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{note.createdBy}</span>
                            <div style={{ flex: 1 }} />
                            <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete note">🗑</button>
                          </div>
                          {note.text && <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{note.text}</div>}
                          {note.attachments && note.attachments.length > 0 && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                              {note.attachments.map(att => (
                                att.type && att.type.startsWith("image/") && att.dataUrl ? (
                                  <div key={att.id} style={{ position: "relative", display: "inline-block" }} onClick={e => e.stopPropagation()}>
                                    <img src={att.dataUrl} alt={att.name} onClick={() => setLightboxImg(att.dataUrl)} style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #e2e8f0", cursor: "pointer" }} />
                                    <button onClick={() => setMarkupImg({ src: att.dataUrl, noteId: note.id, attachmentId: att.id })}
                                      style={{ position: "absolute", bottom: 2, right: 2, width: 20, height: 20, borderRadius: 4, background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                                      title="Mark up photo">✏️</button>
                                  </div>
                                ) : (
                                  <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}>
                                    <FileIconBadge name={att.name} />
                                    <span style={{ color: "#334155", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                                  </div>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

      {/* ── Image Lightbox ── */}
    {/* ── Image Lightbox ────────────────────────────────────────────── */}
    {lightboxImg && (
      <div onClick={() => setLightboxImg(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <img src={lightboxImg} alt="Attachment" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} />
        <button onClick={(e) => { e.stopPropagation(); setMarkupImg({ src: lightboxImg, target: "new" }); setLightboxImg(null); }}
          style={{ position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 8, background: "#0891b2", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
    )}

    {/* ── Photo Markup Editor ──────────────────────────────────────── */}
    {markupImg && (
      <PhotoMarkupEditor
        imageSrc={markupImg.src}
        onSave={saveMarkup}
        onClose={() => setMarkupImg(null)}
      />
    )}

    {/* ── Plan Drawing Editor ────────────────────────────────────────── */}
    {showPlanDrawing && (
      <PlanDrawingEditor
        onSave={savePlan}
        onClose={() => setShowPlanDrawing(false)}
      />
    )}

    {/* ── PDF Form Filler ────────────────────────────────────────────── */}
    {showPdfFiller && (
      <PdfFormFiller
        pdfData={showPdfFiller.pdfData}
        fileName={showPdfFiller.fileName}
        existingFields={showPdfFiller.existingFields}
        onSave={handlePdfSave}
        onClose={() => setShowPdfFiller(null)}
      />
    )}

    {/* ── Form Filler Modal ──────────────────────────────────────────── */}
    {showFormFiller && (() => {
      const tmpl = showFormFiller;
      const client = clients.find(c => c.id === job.clientId);
      const site = client?.sites?.find(s => s.id === job.siteId);
      return <FormFillerModal template={tmpl} job={job} client={client} site={site}
        onSave={(formData, andPrint) => {
          const note = { id: Date.now(), text: `${tmpl.name} completed`, category: "form", formType: tmpl.id, formData, attachments: [], createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
          setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Completed ${tmpl.name} form`) } : j));
          setShowFormFiller(null);
          if (andPrint) printFormPdf(note, tmpl);
        }}
        onClose={() => setShowFormFiller(null)}
      />;
    })()}

    {/* ── Form Viewer Modal ──────────────────────────────────────────── */}
    {viewingForm && (() => {
      const tmpl = FORM_TEMPLATES.find(t => t.id === viewingForm.formType);
      const data = viewingForm.formData || {};
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setViewingForm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "90%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>{tmpl?.icon}</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{tmpl?.name || "Form"}</h3>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => { printFormPdf(viewingForm, tmpl); }}>🖨️ Print PDF</button>
              <button onClick={() => setViewingForm(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>✕</button>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 16 }}>Completed {new Date(viewingForm.createdAt).toLocaleString()} by {viewingForm.createdBy}</div>
            {(tmpl?.fields || []).map(field => {
              const val = data[field.key];
              return (
                <div key={field.key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{field.label}</div>
                  {field.type === "checklist" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(field.options || []).map((opt, i) => (
                        <div key={i} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ color: (val || []).includes(opt) ? "#059669" : "#dc2626", fontWeight: 700 }}>{(val || []).includes(opt) ? "✓" : "✗"}</span>
                          <span style={{ color: (val || []).includes(opt) ? "#333" : "#999" }}>{opt}</span>
                        </div>
                      ))}
                    </div>
                  ) : field.type === "signature" ? (
                    val ? <img src={val} alt="Signature" style={{ maxWidth: 300, height: 80, border: "1px solid #e2e8f0", borderRadius: 6 }} /> : <span style={{ fontSize: 13, color: "#999" }}>No signature</span>
                  ) : (
                    <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{val || "—"}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}

    </>
  );
};

export default JobNotes;
