import { useState, useRef } from "react";
import { useAppStore } from "../../lib/store";
import { FileIconBadge, OrderIcon } from "../../components/shared";
import { PhotoMarkupEditor } from "../../components/PhotoMarkupEditor";
import { PlanDrawingEditor } from "../../components/PlanDrawingEditor";
import { FormFillerModal } from "../../components/FormFillerModal";
import { PdfFormFiller } from "../../components/PdfFormFiller";
import { NOTE_CATEGORIES, FORM_TEMPLATES, SECTION_COLORS } from "../../fixtures/seedData.jsx";
import { addLog, genId, fmtFileSize, CURRENT_USER } from "../../utils/helpers";
import s from './JobNotes.module.css';

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
              <div className={s.toolbar}>
                <select value={noteFilter} onChange={e => setNoteFilter(e.target.value)} className={s.filterSelect}>
                  <option value="all">All Categories</option>
                  {NOTE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div className={s.spacer} />
                <div className={s.dropdownWrap}>
                  <button className={`btn btn-sm ${s.formMenuBtn}`} onClick={() => setShowFormMenu(m => !m)}>
                    📋 New Form ▾
                  </button>
                  {showFormMenu && (
                    <div className={s.dropdownMenu}>
                      {FORM_TEMPLATES.map(tmpl => (
                        <button key={tmpl.id} className={s.dropdownItem}
                          onClick={() => { setShowFormMenu(false); setShowFormFiller(tmpl); }}>
                          {tmpl.icon} {tmpl.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className={`btn btn-sm ${s.planBtn}`} onClick={() => setShowPlanDrawing(true)}>
                  📐 Draw Plan
                </button>
                <button className={`btn btn-sm ${s.pdfBtn}`} onClick={() => pdfInputRef.current?.click()}>
                  📄 Fill PDF
                </button>
                <input ref={pdfInputRef} type="file" accept=".pdf" className={s.hiddenInput} onChange={handlePdfFileSelect} />
                <button className={`btn btn-sm ${s.addNoteBtn}`} style={{ background: jobAccent }} onClick={() => setShowNoteForm(true)}>
                  + Add Note
                </button>
              </div>

              {/* New note form */}
              {showNoteForm && (
                <div className={s.noteFormCard}>
                  <textarea value={noteForm.text} onChange={e => setNoteForm(prev => ({ ...prev, text: e.target.value }))} placeholder="Write a note…" rows={3} className={s.noteTextarea} />
                  {/* Category pills */}
                  <div className={s.categoryPills}>
                    {NOTE_CATEGORIES.map(c => (
                      <button key={c.id} onClick={() => setNoteForm(prev => ({ ...prev, category: c.id }))} style={{ padding: "4px 12px", borderRadius: 20, border: noteForm.category === c.id ? `2px solid ${c.color}` : "1px solid #e2e8f0", background: noteForm.category === c.id ? c.color + "18" : "#fff", color: noteForm.category === c.id ? c.color : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.label}</button>
                    ))}
                  </div>
                  {/* File attachments */}
                  <div className={s.attachmentsSection}>
                    {noteForm.attachments.length > 0 && (
                      <div className={s.attachmentList}>
                        {noteForm.attachments.map(f => (
                          <div key={f.id} className={s.attachmentChip}>
                            {f.dataUrl ? <img src={f.dataUrl} alt={f.name} className={s.attachmentThumb} /> : <FileIconBadge name={f.name} />}
                            <span className={s.attachmentName}>{f.name}</span>
                            <span className={s.attachmentSize}>{fmtFileSize(f.size)}</span>
                            {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => setMarkupImg({ src: f.dataUrl, target: "new", attachmentId: f.id })} className={s.markupBtn} title="Mark up">✏️</button>}
                            <button onClick={() => setNoteForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} className={s.removeBtn}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label className={s.uploadLabel}>
                      <OrderIcon name="upload" size={14} />
                      Attach photos / files
                      <input type="file" multiple className={s.hiddenInput} onChange={handleNoteFiles} accept="*/*" />
                    </label>
                  </div>
                  {/* Actions */}
                  <div className={s.formActions}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowNoteForm(false); setNoteForm({ text: "", category: "general", attachments: [] }); }}>Cancel</button>
                    <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: jobAccent }} onClick={addNote} disabled={!noteForm.text.trim() && noteForm.attachments.length === 0}>Save Note</button>
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
                    <div className={s.emptyHint}>Click "+ Add Note" to get started</div>
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
                          <div key={note.id} className={s.editNoteCard} style={{ border: `2px solid ${eCat.color}`, borderLeft: `3px solid ${eCat.color}` }}>
                            <textarea value={editNoteForm.text} onChange={e => setEditNoteForm(prev => ({ ...prev, text: e.target.value }))} rows={3} className={s.noteTextarea} />
                            <div className={s.categoryPills}>
                              {NOTE_CATEGORIES.map(c => (
                                <button key={c.id} onClick={() => setEditNoteForm(prev => ({ ...prev, category: c.id }))} style={{ padding: "4px 12px", borderRadius: 20, border: editNoteForm.category === c.id ? `2px solid ${c.color}` : "1px solid #e2e8f0", background: editNoteForm.category === c.id ? c.color + "18" : "#fff", color: editNoteForm.category === c.id ? c.color : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.label}</button>
                              ))}
                            </div>
                            <div className={s.attachmentsSection}>
                              {editNoteForm.attachments.length > 0 && (
                                <div className={s.attachmentList}>
                                  {editNoteForm.attachments.map(f => (
                                    <div key={f.id} className={s.attachmentChip}>
                                      {f.dataUrl ? <img src={f.dataUrl} alt={f.name} className={s.attachmentThumb} /> : <FileIconBadge name={f.name} />}
                                      <span className={s.attachmentName}>{f.name}</span>
                                      {f.dataUrl && f.type?.startsWith("image/") && <button onClick={() => setMarkupImg({ src: f.dataUrl, target: "edit", attachmentId: f.id })} className={s.markupBtn} title="Mark up">✏️</button>}
                                      <button onClick={() => setEditNoteForm(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== f.id) }))} className={s.removeBtn}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <label className={s.uploadLabel}>
                                <OrderIcon name="upload" size={14} />
                                Attach photos / files
                                <input type="file" multiple className={s.hiddenInput} onChange={handleEditNoteFiles} accept="*/*" />
                              </label>
                            </div>
                            <div className={s.formActions}>
                              <button className="btn btn-ghost btn-sm" onClick={cancelEditNote}>Cancel</button>
                              <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: jobAccent }} onClick={saveEditNote} disabled={!editNoteForm.text.trim() && editNoteForm.attachments.length === 0}>Save</button>
                            </div>
                          </div>
                        );
                      }
                      // ── PDF note card ──
                      if (note.pdfNote) {
                        return (
                          <div key={note.id} className={s.pdfNoteCard}>
                            <div className={s.pdfNoteRow}>
                              {note.pdfThumbnail && <img src={note.pdfThumbnail} alt="PDF" className={s.pdfThumbnail} />}
                              <div className={s.pdfNoteContent}>
                                <div className={s.pdfNoteHeader}>
                                  <span className={s.pdfBadge}>PDF</span>
                                  <span className={s.pdfFileName}>{note.attachments?.[0]?.name || "Filled PDF"}</span>
                                </div>
                                <div className={s.noteMeta}>{new Date(note.createdAt).toLocaleString()} · {note.createdBy}</div>
                              </div>
                              <button className={`btn btn-ghost btn-xs ${s.pdfEditBtn}`} onClick={(e) => { e.stopPropagation(); reopenPdfNote(note); }}>✏️ Edit</button>
                              {note.attachments?.[0]?.dataUrl && (
                                <a href={note.attachments[0].dataUrl} download={note.attachments[0].name} onClick={e => e.stopPropagation()} className={s.downloadLink}>⬇ Download</a>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className={s.deleteBtn} title="Delete">🗑</button>
                            </div>
                          </div>
                        );
                      }
                      // ── Form note card ──
                      if (note.category === "form" && note.formType) {
                        const tmpl = FORM_TEMPLATES.find(t => t.id === note.formType);
                        return (
                          <div key={note.id} className={s.formNoteCard} style={{ borderLeft: `3px solid ${cat.color}` }}>
                            <div className={s.formNoteHeader}>
                              <span className={s.formIcon}>{tmpl?.icon || "📋"}</span>
                              <span className={s.formName}>{tmpl?.name || note.formType}</span>
                              <span className={s.formBadge} style={{ background: cat.color + "18", color: cat.color }}>Form</span>
                              <span className={s.noteMeta}>{new Date(note.createdAt).toLocaleString()}</span>
                              <span className={s.noteMetaAuthor}>{note.createdBy}</span>
                              <div className={s.spacer} />
                              <button className={`btn btn-ghost btn-xs ${s.formActionBtn}`} onClick={(e) => { e.stopPropagation(); setViewingForm(note); }}>👁 View</button>
                              <button className={`btn btn-ghost btn-xs ${s.formActionBtn}`} onClick={(e) => { e.stopPropagation(); printFormPdf(note, tmpl); }}>🖨️ PDF</button>
                              <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className={s.deleteBtn} title="Delete">🗑</button>
                            </div>
                            {note.text && <div className={s.formNoteText}>{note.text}</div>}
                          </div>
                        );
                      }
                      // ── Regular note card ──
                      return (
                        <div key={note.id} onClick={() => startEditNote(note)} className={s.noteCard} style={{ borderLeft: `3px solid ${cat.color}` }}>
                          <div className={s.noteCardHeader}>
                            <span className={s.categoryBadge} style={{ background: cat.color + "18", color: cat.color }}>{cat.label}</span>
                            <span className={s.noteMeta}>{new Date(note.createdAt).toLocaleString()}</span>
                            <span className={s.noteMetaAuthor}>{note.createdBy}</span>
                            <div className={s.spacer} />
                            <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className={s.deleteBtn} title="Delete note">🗑</button>
                          </div>
                          {note.text && <div className={s.noteText}>{note.text}</div>}
                          {note.attachments && note.attachments.length > 0 && (
                            <div className={s.noteAttachments}>
                              {note.attachments.map(att => (
                                att.type && att.type.startsWith("image/") && att.dataUrl ? (
                                  <div key={att.id} className={s.imgWrap} onClick={e => e.stopPropagation()}>
                                    <img src={att.dataUrl} alt={att.name} onClick={() => setLightboxImg(att.dataUrl)} className={s.thumbImg} />
                                    <button onClick={() => setMarkupImg({ src: att.dataUrl, noteId: note.id, attachmentId: att.id })}
                                      className={s.thumbMarkupBtn}
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

      {/* ── Image Lightbox ── */}
    {/* ── Image Lightbox ────────────────────────────────────────────── */}
    {lightboxImg && (
      <div onClick={() => setLightboxImg(null)} className={s.lightboxOverlay}>
        <img src={lightboxImg} alt="Attachment" className={s.lightboxImg} />
        <button onClick={(e) => { e.stopPropagation(); setMarkupImg({ src: lightboxImg, target: "new" }); setLightboxImg(null); }}
          className={s.lightboxMarkupBtn}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} className={s.lightboxCloseBtn}>✕</button>
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
      const site = client?.sites?.find(st => st.id === job.siteId);
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
        <div className={s.modalOverlay} onClick={() => setViewingForm(null)}>
          <div onClick={e => e.stopPropagation()} className={s.modalContent}>
            <div className={s.modalHeader}>
              <span className={s.modalIcon}>{tmpl?.icon}</span>
              <h3 className={s.modalTitle}>{tmpl?.name || "Form"}</h3>
              <div className={s.spacer} />
              <button className="btn btn-ghost btn-sm" onClick={() => { printFormPdf(viewingForm, tmpl); }}>🖨️ Print PDF</button>
              <button onClick={() => setViewingForm(null)} className={s.modalCloseBtn}>✕</button>
            </div>
            <div className={s.modalMeta}>Completed {new Date(viewingForm.createdAt).toLocaleString()} by {viewingForm.createdBy}</div>
            {(tmpl?.fields || []).map(field => {
              const val = data[field.key];
              return (
                <div key={field.key} className={s.fieldGroup}>
                  <div className={s.fieldLabel}>{field.label}</div>
                  {field.type === "checklist" ? (
                    <div className={s.checklistCol}>
                      {(field.options || []).map((opt, i) => (
                        <div key={i} className={s.checklistItem}>
                          <span className={(val || []).includes(opt) ? s.checkYes : s.checkNo}>{(val || []).includes(opt) ? "✓" : "✗"}</span>
                          <span className={(val || []).includes(opt) ? s.checkLabelActive : s.checkLabelInactive}>{opt}</span>
                        </div>
                      ))}
                    </div>
                  ) : field.type === "signature" ? (
                    val ? <img src={val} alt="Signature" className={s.signatureImg} /> : <span className={s.noSignature}>No signature</span>
                  ) : (
                    <div className={s.fieldValue}>{val || "—"}</div>
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
