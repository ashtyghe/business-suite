import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { Icon } from "../components/Icon";
import { SECTION_COLORS } from "../fixtures/seedData.jsx";
import { hexToRgba } from "../utils/helpers";

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

  const cardStyle = { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, marginBottom: 8, overflow: "hidden" };
  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>;

  return (
    <div>
      {/* Info banner */}
      <div style={{ background: hexToRgba(accent, 0.06), border: `1px solid ${hexToRgba(accent, 0.15)}`, borderRadius: 10, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon name="info" size={16} style={{ color: accent, marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
          <strong style={{ color: "#333" }}>Caller Memory</strong> gives your voice assistant context from previous calls. Key points are stored per phone number and linked to your account via your phone number in Settings → Users. Limited to {CALLER_NOTES_MAX} notes per caller, auto-pruned after {CALLER_NOTES_MAX_AGE_DAYS} days.
        </div>
      </div>

      {/* Search + Add */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search callers, notes..." style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)} style={{ background: accent, whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <Icon name="add" size={14} /> Add Caller
        </button>
      </div>

      {/* Add new caller form */}
      {showAdd && (
        <div style={{ ...cardStyle, padding: 16, marginBottom: 16, border: `2px solid ${accent}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 12 }}>Add New Caller</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Phone Number *</div>
              <input type="tel" value={addPhone} onChange={e => setAddPhone(e.target.value)} placeholder="0412 345 678" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name (optional)</div>
              <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="John Smith" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-sm" onClick={() => { setShowAdd(false); setAddPhone(""); setAddName(""); }} style={{ fontSize: 12 }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={addNewCaller} disabled={!addPhone.trim() || saving} style={{ background: accent, fontSize: 12 }}>{saving ? "Saving..." : "Add"}</button>
          </div>
        </div>
      )}

      {/* Caller list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#999" }}>
          <Icon name="send" size={32} style={{ color: "#ddd", marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 4 }}>
            {callers.length === 0 ? "No caller memory yet" : "No matches"}
          </div>
          <div style={{ fontSize: 12 }}>
            {callers.length === 0 ? "Context will be saved automatically when your assistant handles calls, or add callers manually above." : "Try a different search term."}
          </div>
        </div>
      ) : (
        filtered.map(caller => {
          const isExpanded = expandedId === caller.id;
          const noteCount = (caller.notes || []).length;
          return (
            <div key={caller.id} style={cardStyle}>
              {/* Caller header */}
              <div onClick={() => setExpandedId(isExpanded ? null : caller.id)} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "background 0.1s" }}>
                {/* Avatar */}
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: hexToRgba(accent, 0.1), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="clients" size={16} style={{ color: accent }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {caller.caller_name || formatPhone(caller.phone)}
                    </div>
                    {caller.caller_name && (
                      <div style={{ fontSize: 12, color: "#999" }}>{formatPhone(caller.phone)}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#999", marginTop: 2, display: "flex", gap: 12 }}>
                    <span>{noteCount} note{noteCount !== 1 ? "s" : ""}</span>
                    {caller.last_call_at && <span>Last contact: {timeAgo(caller.last_call_at)}</span>}
                  </div>
                </div>
                {/* Latest note preview */}
                {!isExpanded && noteCount > 0 && (
                  <div style={{ fontSize: 12, color: "#888", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {caller.notes[0].text}
                  </div>
                )}
                <Icon name={isExpanded ? "up" : "down"} size={14} style={{ color: "#ccc", flexShrink: 0 }} />
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid #f0f0f0", padding: "12px 16px" }}>
                  {/* Caller name edit */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                    {editingCaller === caller.id ? (
                      <>
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Caller name" style={{ ...inputStyle, flex: 1, maxWidth: 250 }} autoFocus />
                        <button className="btn btn-sm" onClick={() => updateCallerName(caller.id)} style={{ fontSize: 11 }}>Save</button>
                        <button className="btn btn-sm" onClick={() => { setEditingCaller(null); setEditName(""); }} style={{ fontSize: 11 }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm" onClick={() => { setEditingCaller(caller.id); setEditName(caller.caller_name || ""); }} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                          <Icon name="edit" size={12} /> {caller.caller_name ? "Edit Name" : "Add Name"}
                        </button>
                        <button className="btn btn-sm" onClick={() => { setAddingNote(addingNote === caller.id ? null : caller.id); setNewNote(""); }} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                          <Icon name="add" size={12} /> Add Note
                        </button>
                        <div style={{ flex: 1 }} />
                        <button className="btn btn-sm" onClick={() => { if (confirm("Delete all memory for this caller?")) deleteCaller(caller.id); }} style={{ fontSize: 11, color: "#dc2626" }}>
                          Delete Caller
                        </button>
                      </>
                    )}
                  </div>

                  {/* Add note inline form */}
                  {addingNote === caller.id && (
                    <div style={{ background: "#fafafa", border: "1px solid #e8e8e8", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <textarea value={newNote} onChange={e => setNewNote(e.target.value.slice(0, CALLER_NOTE_MAX_CHARS))} placeholder="Key point from call... e.g. 'Needs quote for bathroom reno at 42 Smith St'" rows={2} style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box" }} autoFocus />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: "#bbb" }}>{newNote.length}/{CALLER_NOTE_MAX_CHARS}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => { setAddingNote(null); setNewNote(""); }} style={{ fontSize: 11 }}>Cancel</button>
                          <button className="btn btn-primary btn-sm" onClick={() => addNote(caller.id)} disabled={!newNote.trim() || saving} style={{ background: accent, fontSize: 11 }}>{saving ? "Saving..." : "Save Note"}</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes list */}
                  {(caller.notes || []).length === 0 ? (
                    <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: "#bbb" }}>No notes yet — add a key point from a call.</div>
                  ) : (
                    <div>
                      {(caller.notes || []).map((note, idx) => (
                        <div key={idx} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: idx < caller.notes.length - 1 ? "1px solid #f5f5f5" : "none", alignItems: "flex-start" }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent, marginTop: 6, flexShrink: 0, opacity: 0.5 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>{note.text}</div>
                            <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{formatDate(note.date)}</div>
                          </div>
                          <button onClick={() => deleteNote(caller.id, idx)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#ccc", fontSize: 11 }} title="Delete note">
                            <Icon name="close" size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {noteCount >= CALLER_NOTES_MAX && (
                    <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
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
        <div style={{ textAlign: "center", padding: "16px 0", fontSize: 11, color: "#ccc" }}>
          {callers.length} caller{callers.length !== 1 ? "s" : ""} · {callers.reduce((sum, c) => sum + (c.notes || []).length, 0)} total notes · Auto-prunes after {CALLER_NOTES_MAX_AGE_DAYS} days
        </div>
      )}
    </div>
  );
};

export default CallerMemory;
