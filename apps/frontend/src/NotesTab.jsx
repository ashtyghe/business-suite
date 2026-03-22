import { useState, useRef } from "react";
import s from "./NotesTab.module.css";

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

const FileIconBadge = ({ name }) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  const colors = { pdf: "#dc2626", doc: "#2563eb", docx: "#2563eb", xls: "#059669", xlsx: "#059669", csv: "#059669", png: "#7c3aed", jpg: "#d97706", jpeg: "#d97706" };
  const c = colors[ext] || "#64748b";
  return <span className={s.fileIconBadge} style={{ background: c + "18", color: c }}>{ext.toUpperCase()}</span>;
};

const NotesTab = ({
  job,
  jobNotes,
  jobAccent,
  currentUser,
  setJobs,
  addLog,
  onShowFormFiller,
  onShowPlanDrawing,
  onShowPdfFiller,
  onSetLightboxImg,
  onSetMarkupImg,
  onSetViewingForm,
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

  const renderCategoryPills = (form, setForm) => (
    <div className={s.categoryPills}>
      {NOTE_CATEGORIES.map(c => (
        <button key={c.id} onClick={() => setForm(prev => ({ ...prev, category: c.id }))}
          className={s.categoryPill}
          style={form.category === c.id
            ? { border: `2px solid ${c.color}`, background: c.color + "18", color: c.color }
            : undefined
          }>{c.label}</button>
      ))}
    </div>
  );

  const renderAttachmentChips = (attachments, setForm, markupTarget) => (
    <>
      {attachments.length > 0 && (
        <div className={s.attachmentList}>
          {attachments.map(f => (
            <div key={f.id} className={s.attachmentChip}>
              {f.dataUrl ? <img src={f.dataUrl} alt={f.name} className={s.attachmentThumb} /> : <FileIconBadge name={f.name} />}
              <span className={s.attachmentName}>{f.name}</span>
              <span className={s.attachmentSize}>{fmtFileSize(f.size)}</span>
              {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => onSetMarkupImg({ src: f.dataUrl, target: markupTarget, attachmentId: f.id })} className={s.markupBtn} title="Mark up">✏️</button>}
              <button onClick={() => setForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} className={s.removeBtn}>✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className={s.toolbar}>
        <select value={noteFilter} onChange={e => setNoteFilter(e.target.value)} className={s.filterSelect}>
          <option value="all">All Categories</option>
          {NOTE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div className={s.spacer} />
        <div className={s.menuWrap}>
          <button className={`btn btn-sm ${s.toolbarBtn} ${s.formBtn}`} onClick={() => setShowFormMenu(m => !m)}>
            📋 New Form ▾
          </button>
          {showFormMenu && (
            <div className={s.formMenu}>
              {formTemplates.map(tmpl => (
                <button key={tmpl.id} className={s.formMenuItem}
                  onClick={() => { setShowFormMenu(false); onShowFormFiller(tmpl); }}>
                  {tmpl.icon} {tmpl.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`btn btn-sm ${s.toolbarBtn} ${s.planBtn}`} onClick={() => onShowPlanDrawing(true)}>
          📐 Draw Plan
        </button>
        <button className={`btn btn-sm ${s.toolbarBtn} ${s.pdfBtn}`} onClick={() => pdfInputRef.current?.click()}>
          📄 Fill PDF
        </button>
        <input ref={pdfInputRef} type="file" accept=".pdf" className={s.hiddenInput} onChange={handlePdfFileSelect} />
        <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => setShowNoteForm(true)}>
          + Add Note
        </button>
      </div>

      {/* New note form */}
      {showNoteForm && (
        <div className={s.noteForm}>
          <textarea value={noteForm.text} onChange={e => setNoteForm(prev => ({ ...prev, text: e.target.value }))} placeholder="Write a note…" rows={3} className={s.textarea} />
          {renderCategoryPills(noteForm, setNoteForm)}
          <div className={s.attachmentsSection}>
            {renderAttachmentChips(noteForm.attachments, setNoteForm, "new")}
            <label className={s.uploadLabel}>
              ⬆ Attach photos / files
              <input type="file" multiple className={s.hiddenInput} onChange={handleNoteFiles} accept="*/*" />
            </label>
          </div>
          <div className={s.formActions}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowNoteForm(false); setNoteForm({ text: "", category: "general", attachments: [] }); }}>Cancel</button>
            <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={addNote} disabled={!noteForm.text.trim() && noteForm.attachments.length === 0}>Save Note</button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {(() => {
        const filtered = [...jobNotes].filter(n => noteFilter === "all" || n.category === noteFilter).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        if (filtered.length === 0) return (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}>📝</div>
            <div className={s.emptyTitle}>{jobNotes.length === 0 ? "No notes yet" : "No notes match this filter"}</div>
            <div className={s.emptySub}>Click "+ Add Note" to get started</div>
          </div>
        );
        return (
          <div className={s.notesList}>
            {filtered.map(note => {
              const cat = NOTE_CATEGORIES.find(c => c.id === note.category) || NOTE_CATEGORIES[0];
              const isEditing = editingNoteId === note.id;

              if (isEditing) {
                const eCat = NOTE_CATEGORIES.find(c => c.id === editNoteForm.category) || NOTE_CATEGORIES[0];
                return (
                  <div key={note.id} className={s.editCard} style={{ border: `2px solid ${eCat.color}`, borderLeft: `3px solid ${eCat.color}` }}>
                    <textarea value={editNoteForm.text} onChange={e => setEditNoteForm(prev => ({ ...prev, text: e.target.value }))} rows={3} className={s.textarea} />
                    {renderCategoryPills(editNoteForm, setEditNoteForm)}
                    <div className={s.attachmentsSection}>
                      {renderAttachmentChips(editNoteForm.attachments, setEditNoteForm, "edit")}
                      <label className={s.uploadLabel}>
                        ⬆ Attach photos / files
                        <input type="file" multiple className={s.hiddenInput} onChange={handleEditNoteFiles} accept="*/*" />
                      </label>
                    </div>
                    <div className={s.formActions}>
                      <button className="btn btn-ghost btn-sm" onClick={cancelEditNote}>Cancel</button>
                      <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={saveEditNote} disabled={!editNoteForm.text.trim() && editNoteForm.attachments.length === 0}>Save</button>
                    </div>
                  </div>
                );
              }

              {/* PDF note card */}
              if (note.pdfNote) {
                return (
                  <div key={note.id} className={s.pdfCard}>
                    <div className={s.pdfRow}>
                      {note.pdfThumbnail && <img src={note.pdfThumbnail} alt="PDF" className={s.pdfThumb} />}
                      <div className={s.pdfInfo}>
                        <div className={s.pdfInfoHeader}>
                          <span className={s.pdfBadge}>PDF</span>
                          <span className={s.pdfName}>{note.attachments?.[0]?.name || "Filled PDF"}</span>
                        </div>
                        <div className={s.pdfMeta}>{new Date(note.createdAt).toLocaleString()} · {note.createdBy}</div>
                      </div>
                      <button className={`btn btn-ghost btn-xs ${s.smallBtn}`} onClick={(e) => { e.stopPropagation(); reopenPdfNote(note); }}>✏️ Edit</button>
                      {note.attachments?.[0]?.dataUrl && (
                        <a href={note.attachments[0].dataUrl} download={note.attachments[0].name} onClick={e => e.stopPropagation()} className={s.downloadLink}>⬇ Download</a>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className={s.deleteBtn} title="Delete">🗑</button>
                    </div>
                  </div>
                );
              }

              {/* Form note card */}
              if (note.category === "form" && note.formType) {
                const tmpl = formTemplates.find(t => t.id === note.formType);
                return (
                  <div key={note.id} className={s.noteCard} style={{ borderLeft: `3px solid ${cat.color}` }}>
                    <div className={s.formCardHeader}>
                      <span className={s.formIcon}>{tmpl?.icon || "📋"}</span>
                      <span className={s.formName}>{tmpl?.name || note.formType}</span>
                      <span className={s.categoryBadge} style={{ background: cat.color + "18", color: cat.color }}>Form</span>
                      <span className={s.noteTimestamp}>{new Date(note.createdAt).toLocaleString()}</span>
                      <span className={s.noteAuthor}>{note.createdBy}</span>
                      <div className={s.spacer} />
                      <button className={`btn btn-ghost btn-xs ${s.smallBtn}`} onClick={(e) => { e.stopPropagation(); onSetViewingForm(note); }}>👁 View</button>
                      <button className={`btn btn-ghost btn-xs ${s.smallBtn}`} onClick={(e) => { e.stopPropagation(); printFormPdf(note, tmpl); }}>🖨️ PDF</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className={s.deleteBtn} title="Delete">🗑</button>
                    </div>
                    {note.text && <div className={s.formNoteText}>{note.text}</div>}
                  </div>
                );
              }

              {/* Regular note card */}
              return (
                <div key={note.id} onClick={() => startEditNote(note)} className={s.noteCardClickable} style={{ borderLeft: `3px solid ${cat.color}` }}>
                  <div className={s.noteHeader}>
                    <span className={s.categoryBadge} style={{ background: cat.color + "18", color: cat.color }}>{cat.label}</span>
                    <span className={s.noteTimestamp}>{new Date(note.createdAt).toLocaleString()}</span>
                    <span className={s.noteAuthor}>{note.createdBy}</span>
                    <div className={s.spacer} />
                    <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className={s.deleteBtn} title="Delete note">🗑</button>
                  </div>
                  {note.text && <div className={s.noteText}>{note.text}</div>}
                  {note.attachments && note.attachments.length > 0 && (
                    <div className={s.noteAttachments}>
                      {note.attachments.map(att => (
                        att.type && att.type.startsWith("image/") && att.dataUrl ? (
                          <div key={att.id} className={s.imageWrap} onClick={e => e.stopPropagation()}>
                            <img src={att.dataUrl} alt={att.name} onClick={() => onSetLightboxImg(att.dataUrl)} className={s.imageThumb} />
                            <button onClick={() => onSetMarkupImg({ src: att.dataUrl, noteId: note.id, attachmentId: att.id })}
                              className={s.imageMarkupBtn}
                              title="Mark up photo">✏️</button>
                          </div>
                        ) : (
                          <div key={att.id} className={s.fileChip}>
                            <FileIconBadge name={att.name} />
                            <span className={s.fileChipName}>{att.name}</span>
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
