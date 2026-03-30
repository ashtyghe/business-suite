import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { Icon } from "../components/Icon";
import { SECTION_COLORS } from "../fixtures/seedData.jsx";
import { hexToRgba } from "../utils/helpers";
import s from './CallerMemory.module.css';

// ── Caller Memory (persistent context per caller for voice assistant) ────────
const CALLER_NOTES_MAX = 20;
const CALLER_NOTES_MAX_AGE_DAYS = 90;
const CALLER_NOTE_MAX_CHARS = 500;

const CallerMemory = () => {
  const auth = useAuth();
  const accent = SECTION_COLORS.memory?.accent || "#8b5cf6";

  const [callers, setCallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [addingNote, setAddingNote] = useState(null); // caller id
  const [newNote, setNewNote] = useState("");
  const [editingCaller, setEditingCaller] = useState(null);
  const [editName, setEditName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addName, setAddName] = useState("");
  const [saving, setSaving] = useState(false);

  // Load all caller context for current user
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase || !auth.user) { setLoading(false); return; }
      try {
        const { data } = await supabase.from('caller_context')
          .select('*').eq('user_id', auth.user.id)
          .order('last_call_at', { ascending: false });
        if (!cancelled && data) {
          // Prune old notes (> 90 days)
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - CALLER_NOTES_MAX_AGE_DAYS);
          const pruned = data.map(c => ({
            ...c,
            notes: (c.notes || []).filter(n => !n.date || new Date(n.date) >= cutoff).slice(0, CALLER_NOTES_MAX),
          }));
          setCallers(pruned);
        }
      } catch (err) {
        console.warn("Could not load caller context:", err.message);
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  const formatPhone = (phone) => {
    if (!phone) return "";
    // Simple Australian format: 0412 345 678
    const clean = phone.replace(/[^\d+]/g, "");
    if (clean.startsWith("+61") && clean.length === 12) {
      const local = "0" + clean.slice(3);
      return local.slice(0, 4) + " " + local.slice(4, 7) + " " + local.slice(7);
    }
    if (clean.length === 10 && clean.startsWith("0")) {
      return clean.slice(0, 4) + " " + clean.slice(4, 7) + " " + clean.slice(7);
    }
    return phone;
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  const timeAgo = (iso) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
    return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
  };

  const saveCaller = async (caller) => {
    if (!supabase || !auth.user) return;
    try {
      await supabase.from('caller_context').upsert({
        ...caller, user_id: auth.user.id, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,phone' });
    } catch (err) {
      console.warn("Could not save caller context:", err.message);
    }
  };

  const addNote = async (callerId) => {
    if (!newNote.trim()) return;
    setSaving(true);
    const caller = callers.find(c => c.id === callerId);
    if (!caller) { setSaving(false); return; }
    const note = { text: newNote.trim().slice(0, CALLER_NOTE_MAX_CHARS), date: new Date().toISOString().split("T")[0] };
    const updatedNotes = [note, ...(caller.notes || [])].slice(0, CALLER_NOTES_MAX);
    const updated = { ...caller, notes: updatedNotes, last_call_at: new Date().toISOString() };
    setCallers(prev => prev.map(c => c.id === callerId ? updated : c));
    await saveCaller(updated);
    setNewNote("");
    setAddingNote(null);
    setSaving(false);
  };

  const deleteNote = async (callerId, noteIndex) => {
    const caller = callers.find(c => c.id === callerId);
    if (!caller) return;
    const updatedNotes = [...(caller.notes || [])];
    updatedNotes.splice(noteIndex, 1);
    const updated = { ...caller, notes: updatedNotes };
    setCallers(prev => prev.map(c => c.id === callerId ? updated : c));
    await saveCaller(updated);
  };

  const updateCallerName = async (callerId) => {
    const caller = callers.find(c => c.id === callerId);
    if (!caller) return;
    const updated = { ...caller, caller_name: editName.trim() };
    setCallers(prev => prev.map(c => c.id === callerId ? updated : c));
    await saveCaller(updated);
    setEditingCaller(null);
    setEditName("");
  };

  const deleteCaller = async (callerId) => {
    if (!supabase || !auth.user) return;
    try {
      await supabase.from('caller_context').delete().eq('id', callerId);
      setCallers(prev => prev.filter(c => c.id !== callerId));
    } catch (err) {
      console.warn("Could not delete caller context:", err.message);
    }
  };

  const addNewCaller = async () => {
    if (!addPhone.trim() || !supabase || !auth.user) return;
    setSaving(true);
    const newCaller = {
      user_id: auth.user.id,
      phone: addPhone.trim(),
      caller_name: addName.trim() || null,
      notes: [],
      last_call_at: new Date().toISOString(),
    };
    try {
      const { data } = await supabase.from('caller_context').upsert(newCaller, { onConflict: 'user_id,phone' }).select().single();
      if (data) setCallers(prev => [data, ...prev.filter(c => c.phone !== addPhone.trim())]);
    } catch (err) {
      console.warn("Could not add caller:", err.message);
    }
    setAddPhone("");
    setAddName("");
    setShowAdd(false);
    setSaving(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return callers;
    const q = search.toLowerCase();
    return callers.filter(c =>
      (c.caller_name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.notes || []).some(n => (n.text || "").toLowerCase().includes(q))
    );
  }, [callers, search]);

  if (loading) return <div className={s.loadingState}><object type="image/svg+xml" data="/loading-logo.svg" aria-label="Loading" style={{ width: 80 }} /></div>;

  return (
    <div>
      {/* Info banner */}
      <div className={s.infoBanner} style={{ background: hexToRgba(accent, 0.06), border: `1px solid ${hexToRgba(accent, 0.15)}` }}>
        <Icon name="info" size={16} className={s.infoBannerIcon} style={{ color: accent }} />
        <div className={s.infoBannerText}>
          <strong className={s.infoBannerStrong}>Caller Memory</strong> gives your voice assistant context from previous calls. Key points are stored per phone number and linked to your account via your phone number in Settings → Users. Limited to {CALLER_NOTES_MAX} notes per caller, auto-pruned after {CALLER_NOTES_MAX_AGE_DAYS} days.
        </div>
      </div>

      {/* Search + Add */}
      <div className={s.searchRow}>
        <div className={s.searchWrap}>
          <Icon name="search" size={14} className={s.searchIcon} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search callers, notes..." className={s.searchInput} />
        </div>
        <button className={`btn btn-primary btn-sm ${s.addCallerBtn}`} onClick={() => setShowAdd(true)} style={{ background: accent }}>
          <Icon name="add" size={14} /> Add Caller
        </button>
      </div>

      {/* Add new caller form */}
      {showAdd && (
        <div className={s.addForm} style={{ border: `2px solid ${accent}` }}>
          <div className={s.addFormTitle}>Add New Caller</div>
          <div className={s.addFormGrid}>
            <div>
              <div className={s.fieldLabel}>Phone Number *</div>
              <input type="tel" value={addPhone} onChange={e => setAddPhone(e.target.value)} placeholder="0412 345 678" className={s.input} />
            </div>
            <div>
              <div className={s.fieldLabel}>Name (optional)</div>
              <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="John Smith" className={s.input} />
            </div>
          </div>
          <div className={s.addFormActions}>
            <button className={`btn btn-sm ${s.btnFontSm}`} onClick={() => { setShowAdd(false); setAddPhone(""); setAddName(""); }}>Cancel</button>
            <button className={`btn btn-primary btn-sm ${s.btnFontSm}`} onClick={addNewCaller} disabled={!addPhone.trim() || saving} style={{ background: accent }}>{saving ? "Saving..." : "Add"}</button>
          </div>
        </div>
      )}

      {/* Caller list */}
      {filtered.length === 0 ? (
        <div className={s.emptyState}>
          <Icon name="send" size={32} className={s.emptyIcon} />
          <div className={s.emptyTitle}>
            {callers.length === 0 ? "No caller memory yet" : "No matches"}
          </div>
          <div className={s.emptyBody}>
            {callers.length === 0 ? "Context will be saved automatically when your assistant handles calls, or add callers manually above." : "Try a different search term."}
          </div>
        </div>
      ) : (
        filtered.map(caller => {
          const isExpanded = expandedId === caller.id;
          const noteCount = (caller.notes || []).length;
          return (
            <div key={caller.id} className={s.card}>
              {/* Caller header */}
              <div onClick={() => setExpandedId(isExpanded ? null : caller.id)} className={s.callerHeader}>
                {/* Avatar */}
                <div className={s.avatar} style={{ background: hexToRgba(accent, 0.1) }}>
                  <Icon name="clients" size={16} style={{ color: accent }} />
                </div>
                <div className={s.callerInfo}>
                  <div className={s.callerNameRow}>
                    <div className={s.callerName}>
                      {caller.caller_name || formatPhone(caller.phone)}
                    </div>
                    {caller.caller_name && (
                      <div className={s.callerPhone}>{formatPhone(caller.phone)}</div>
                    )}
                  </div>
                  <div className={s.callerMeta}>
                    <span>{noteCount} note{noteCount !== 1 ? "s" : ""}</span>
                    {caller.last_call_at && <span>Last contact: {timeAgo(caller.last_call_at)}</span>}
                  </div>
                </div>
                {/* Latest note preview */}
                {!isExpanded && noteCount > 0 && (
                  <div className={s.notePreview}>
                    {caller.notes[0].text}
                  </div>
                )}
                <Icon name={isExpanded ? "up" : "down"} size={14} className={s.chevron} />
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className={s.expandedPanel}>
                  {/* Caller name edit */}
                  <div className={s.actionBar}>
                    {editingCaller === caller.id ? (
                      <>
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Caller name" className={s.inputFlex} autoFocus />
                        <button className={`btn btn-sm ${s.btnFontXs}`} onClick={() => updateCallerName(caller.id)}>Save</button>
                        <button className={`btn btn-sm ${s.btnFontXs}`} onClick={() => { setEditingCaller(null); setEditName(""); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className={`btn btn-sm ${s.actionBtn}`} onClick={() => { setEditingCaller(caller.id); setEditName(caller.caller_name || ""); }}>
                          <Icon name="edit" size={12} /> {caller.caller_name ? "Edit Name" : "Add Name"}
                        </button>
                        <button className={`btn btn-sm ${s.actionBtn}`} onClick={() => { setAddingNote(addingNote === caller.id ? null : caller.id); setNewNote(""); }}>
                          <Icon name="add" size={12} /> Add Note
                        </button>
                        <div className={s.spacer} />
                        <button className={`btn btn-sm ${s.deleteCallerBtn}`} onClick={() => { if (confirm("Delete all memory for this caller?")) deleteCaller(caller.id); }}>
                          Delete Caller
                        </button>
                      </>
                    )}
                  </div>

                  {/* Add note inline form */}
                  {addingNote === caller.id && (
                    <div className={s.noteForm}>
                      <textarea value={newNote} onChange={e => setNewNote(e.target.value.slice(0, CALLER_NOTE_MAX_CHARS))} placeholder="Key point from call... e.g. 'Needs quote for bathroom reno at 42 Smith St'" rows={2} className={s.noteTextarea} autoFocus />
                      <div className={s.noteFormFooter}>
                        <span className={s.charCount}>{newNote.length}/{CALLER_NOTE_MAX_CHARS}</span>
                        <div className={s.noteFormBtns}>
                          <button className={`btn btn-sm ${s.btnFontXs}`} onClick={() => { setAddingNote(null); setNewNote(""); }}>Cancel</button>
                          <button className={`btn btn-primary btn-sm ${s.btnFontXs}`} onClick={() => addNote(caller.id)} disabled={!newNote.trim() || saving} style={{ background: accent }}>{saving ? "Saving..." : "Save Note"}</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes list */}
                  {(caller.notes || []).length === 0 ? (
                    <div className={s.emptyNotes}>No notes yet — add a key point from a call.</div>
                  ) : (
                    <div>
                      {(caller.notes || []).map((note, idx) => (
                        <div key={idx} className={s.noteRow} style={{ borderBottom: idx < caller.notes.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                          <div className={s.noteDot} style={{ background: accent }} />
                          <div className={s.noteContent}>
                            <div className={s.noteText}>{note.text}</div>
                            <div className={s.noteDate}>{formatDate(note.date)}</div>
                          </div>
                          <button onClick={() => deleteNote(caller.id, idx)} className={s.noteDeleteBtn} title="Delete note">
                            <Icon name="close" size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {noteCount >= CALLER_NOTES_MAX && (
                    <div className={s.maxNotesWarning}>
                      <Icon name="notification" size={12} /> Maximum {CALLER_NOTES_MAX} notes reached — oldest will be replaced.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Summary stats */}
      {callers.length > 0 && (
        <div className={s.summaryStats}>
          {callers.length} caller{callers.length !== 1 ? "s" : ""} · {callers.reduce((sum, c) => sum + (c.notes || []).length, 0)} total notes · Auto-prunes after {CALLER_NOTES_MAX_AGE_DAYS} days
        </div>
      )}
    </div>
  );
};

export default CallerMemory;
