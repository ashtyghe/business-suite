import { useState, useRef } from "react";

// These constants/helpers are duplicated from job-management-app.jsx to decouple the component.
// They could be moved to a shared module later.

const NOTE_CATEGORIES = [
  { id: "general", label: "General", color: "#64748b" },
  { id: "site_update", label: "Site Update", color: "#0891b2" },
  { id: "issue", label: "Issue", color: "#dc2626" },
  { id: "inspection", label: "Inspection", color: "#7c3aed" },
  { id: "delivery", label: "Delivery", color: "#d97706" },
  { id: "safety", label: "Safety", color: "#059669" },
  { id: "form", label: "Form", color: "#2563eb" },
];

const genId = () => Math.random().toString(36).slice(2, 9).toUpperCase();
const fmtFileSize = (bytes) => { if (bytes < 1024) return bytes + " B"; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / (1024 * 1024)).toFixed(1) + " MB"; };

const OrderIcon = ({ name, size = 16 }) => {
  const icons = { upload: "⬆" };
  return <span style={{ fontSize: size }}>{icons[name] || "•"}</span>;
};

const FileIconBadge = ({ name }) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  const colors = { pdf: "#dc2626", doc: "#2563eb", docx: "#2563eb", xls: "#059669", xlsx: "#059669", csv: "#059669", png: "#7c3aed", jpg: "#d97706", jpeg: "#d97706" };
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 4, background: (colors[ext] || "#64748b") + "18", color: colors[ext] || "#64748b", fontSize: 10, fontWeight: 700 }}>{ext.toUpperCase()}</span>;
};

const NotesTab = ({
  job,
  jobNotes,
  jobAccent,
  currentUser,
  setJobs,
  addLog,
  // Modal triggers — these open modals that live in the parent
  onShowFormFiller,
  onShowPlanDrawing,
  onShowPdfFiller,
  onSetLightboxImg,
  onSetMarkupImg,
  onSetViewingForm,
  // Form templates for the "New Form" menu
  formTemplates,
  printFormPdf,
  reopenPdfNote,
}) => {
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ text: "", category: "general", attachments: [] });
  const [noteFilter, setNoteFilter] = useState("all");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteForm, setEditNoteForm] = useState({ text: "", category: "general", attachments: [] });
  const [showFormMenu, setShowFormMenu] = useState(false);
  const pdfInputRef = useRef(null);

  const handlePdfFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onShowPdfFiller({ pdfData: ev.target.result, fileName: file.name });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const addNote = () => {
    if (!noteForm.text.trim() && noteForm.attachments.length === 0) return;
    const note = { id: Date.now(), text: noteForm.text, category: noteForm.category, attachments: noteForm.attachments.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl })), createdAt: new Date().toISOString(), createdBy: currentUser };
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

  return (
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
              {formTemplates.map(tmpl => (
                <button key={tmpl.id} style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "none", textAlign: "left", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                  onMouseEnter={e => e.target.style.background = "#f8fafc"}
                  onMouseLeave={e => e.target.style.background = "none"}
                  onClick={() => { setShowFormMenu(false); onShowFormFiller(tmpl); }}>
                  {tmpl.icon} {tmpl.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-sm" style={{ background: "#059669", color: "#fff", border: "none" }} onClick={() => onShowPlanDrawing(true)}>
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
                    {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => onSetMarkupImg({ src: f.dataUrl, target: "new", attachmentId: f.id })} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", lineHeight: 1, fontSize: 11 }} title="Mark up">✏️</button>}
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
                              {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => onSetMarkupImg({ src: f.dataUrl, target: "edit", attachmentId: f.id })} style={{ padding: 2, background: "none", border: "none", color: "#0891b2", cursor: "pointer", lineHeight: 1, fontSize: 11 }} title="Mark up">✏️</button>}
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
              {/* PDF note card */}
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
              {/* Form note card */}
              if (note.category === "form" && note.formType) {
                const tmpl = formTemplates.find(t => t.id === note.formType);
                return (
                  <div key={note.id} style={{ padding: 14, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", borderLeft: `3px solid ${cat.color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>{tmpl?.icon || "📋"}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{tmpl?.name || note.formType}</span>
                      <span style={{ padding: "2px 10px", borderRadius: 20, background: cat.color + "18", color: cat.color, fontSize: 11, fontWeight: 700 }}>Form</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(note.createdAt).toLocaleString()}</span>
                      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{note.createdBy}</span>
                      <div style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onSetViewingForm(note); }} style={{ fontSize: 11 }}>👁 View</button>
                      <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); printFormPdf(note, tmpl); }} style={{ fontSize: 11 }}>🖨️ PDF</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", lineHeight: 1 }} title="Delete">🗑</button>
                    </div>
                    {note.text && <div style={{ fontSize: 12, color: "#666" }}>{note.text}</div>}
                  </div>
                );
              }
              {/* Regular note card */}
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
                            <img src={att.dataUrl} alt={att.name} onClick={() => onSetLightboxImg(att.dataUrl)} style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #e2e8f0", cursor: "pointer" }} />
                            <button onClick={() => onSetMarkupImg({ src: att.dataUrl, noteId: note.id, attachmentId: att.id })}
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
  );
};

export default NotesTab;
