import { useState } from "react";
import { useAppStore } from '../lib/store';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';

const Reminders = () => {
  const { reminders, setReminders, jobs, clients } = useAppStore();
  const today = new Date().toISOString().split("T")[0];
  const accent = SECTION_COLORS.reminders.accent;
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editReminder, setEditReminder] = useState(null);
  const [form, setForm] = useState({ text: "", type: "text", dueDate: today, jobId: "", items: [] });
  const [newItemText, setNewItemText] = useState("");

  const overdueCount = reminders.filter(r => r.status === "pending" && r.dueDate < today).length;
  const dueTodayCount = reminders.filter(r => r.status === "pending" && r.dueDate === today).length;
  const upcomingCount = reminders.filter(r => r.status === "pending" && r.dueDate > today).length;
  const completedCount = reminders.filter(r => r.status === "completed").length;

  const filtered = reminders.filter(r => {
    const q = search.toLowerCase();
    const linkedJob = r.jobId ? jobs.find(j => j.id === r.jobId) : null;
    const linkedClient = r.clientId ? (clients || []).find(c => c.id === r.clientId) : null;
    const matchSearch = !search || r.text.toLowerCase().includes(q) || (r.items || []).some(i => i.text.toLowerCase().includes(q)) || (linkedJob?.title || "").toLowerCase().includes(q) || (linkedClient?.name || "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || (filterStatus === "overdue" ? (r.status === "pending" && r.dueDate < today) : r.status === filterStatus);
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aOverdue = a.status === "pending" && a.dueDate < today ? 0 : 1;
    const bOverdue = b.status === "pending" && b.dueDate < today ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const aDone = a.status !== "pending" ? 1 : 0;
    const bDone = b.status !== "pending" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return a.dueDate > b.dueDate ? 1 : -1;
  });

  const openNew = () => { setEditReminder(null); setForm({ text: "", type: "text", dueDate: today, jobId: "", items: [] }); setNewItemText(""); setShowModal(true); };
  const openEdit = (r) => { setEditReminder(r); setForm({ text: r.text, type: r.type, dueDate: r.dueDate, jobId: r.jobId || "", items: r.items ? r.items.map(i => ({ ...i })) : [] }); setNewItemText(""); setShowModal(true); };
  const saveReminder = () => {
    if (!form.text.trim() || !form.dueDate) return;
    const data = { text: form.text, type: form.type, dueDate: form.dueDate, jobId: form.jobId || null };
    if (form.type === "checklist") data.items = form.items;
    if (editReminder) {
      setReminders(rs => rs.map(r => r.id === editReminder.id ? { ...r, ...data } : r));
    } else {
      setReminders(rs => [...rs, { id: Date.now(), ...data, status: "pending", createdAt: new Date().toISOString() }]);
    }
    setShowModal(false);
  };
  const toggleComplete = (id) => setReminders(rs => rs.map(r => r.id === id ? { ...r, status: r.status === "completed" ? "pending" : "completed" } : r));
  const toggleChecklistItem = (reminderId, itemId) => setReminders(rs => rs.map(r => r.id === reminderId ? { ...r, items: (r.items || []).map(i => i.id === itemId ? { ...i, done: !i.done } : i) } : r));
  const dismissReminder = (id) => setReminders(rs => rs.map(r => r.id === id ? { ...r, status: "dismissed" } : r));
  const deleteReminder = (id) => setReminders(rs => rs.filter(r => r.id !== id));
  const addFormItem = () => {
    if (!newItemText.trim()) return;
    setForm(f => ({ ...f, items: [...f.items, { id: Date.now(), text: newItemText.trim(), done: false }] }));
    setNewItemText("");
  };
  const removeFormItem = (itemId) => setForm(f => ({ ...f, items: f.items.filter(i => i.id !== itemId) }));
  const toggleFormItem = (itemId) => setForm(f => ({ ...f, items: f.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) }));

  const dueDateColor = (d, status) => {
    if (status !== "pending") return "#aaa";
    if (d < today) return "#dc2626";
    if (d === today) return "#f59e0b";
    return "#666";
  };
  const dueDateLabel = (d, status) => {
    if (status !== "pending") return d;
    if (d < today) return `Overdue — ${d}`;
    if (d === today) return "Due today";
    const diff = Math.ceil((new Date(d) - new Date(today)) / 86400000);
    return diff === 1 ? "Due tomorrow" : `Due in ${diff} days`;
  };

  const stats = [
    { label: "Overdue", count: overdueCount, color: "#dc2626" },
    { label: "Due Today", count: dueTodayCount, color: "#f59e0b" },
    { label: "Upcoming", count: upcomingCount, color: "#2563eb" },
    { label: "Completed", count: completedCount, color: "#059669" },
  ];

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "16px 20px", borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reminders..." style={{ flex: 1, minWidth: 180, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif" }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif" }}>
          <option value="all">All</option>
          <option value="overdue">Overdue</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <button onClick={openNew} style={{ padding: "8px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>+ New Reminder</button>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#aaa", fontSize: 13 }}>No reminders found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map(r => {
            const job = r.jobId ? jobs.find(j => j.id === r.jobId) : null;
            const isOverdue = r.status === "pending" && r.dueDate < today;
            const checklistProgress = r.type === "checklist" && r.items?.length ? `${r.items.filter(i => i.done).length}/${r.items.length}` : null;
            return (
              <div key={r.id} onClick={() => openEdit(r)} style={{ background: "#fff", border: `1px solid ${isOverdue ? "#fecaca" : "#e8e8e8"}`, borderRadius: 10, padding: "14px 18px", opacity: r.status !== "pending" ? 0.6 : 1, cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Round checkbox */}
                  <button onClick={e => { e.stopPropagation(); toggleComplete(r.id); }} style={{ width: 22, height: 22, borderRadius: 11, border: r.status === "completed" ? `2px solid ${accent}` : "2px solid #ccc", background: r.status === "completed" ? accent : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    {r.status === "completed" && <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>✓</span>}
                  </button>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: r.status === "completed" ? "#aaa" : "#111", textDecoration: r.status === "completed" ? "line-through" : "none" }}>{r.text}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: dueDateColor(r.dueDate, r.status) }}>{dueDateLabel(r.dueDate, r.status)}</span>
                      {checklistProgress && <span style={{ fontSize: 10, fontWeight: 600, background: "#f0f0f0", padding: "2px 8px", borderRadius: 4, color: "#555" }}>{checklistProgress} done</span>}
                      {job && <span style={{ fontSize: 10, fontWeight: 600, background: "#f0f0f0", padding: "2px 8px", borderRadius: 4, color: "#555" }}>{job.title}</span>}
                      {r.status === "dismissed" && <span style={{ fontSize: 10, fontWeight: 600, background: "#f5f5f5", padding: "2px 8px", borderRadius: 4, color: "#999" }}>Dismissed</span>}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {r.status === "pending" && <button onClick={() => dismissReminder(r.id)} title="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 13, padding: 4 }}>✕</button>}
                    <button onClick={() => deleteReminder(r.id)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: 13, padding: 4 }}>🗑</button>
                  </div>
                </div>
                {/* Checklist items inline */}
                {r.type === "checklist" && r.items?.length > 0 && r.status === "pending" && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, marginLeft: 34, display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.items.map(item => (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: item.done ? "#aaa" : "#333" }}>
                        <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(r.id, item.id)} style={{ width: 15, height: 15, accentColor: accent, cursor: "pointer" }} />
                        <span style={{ textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editReminder ? "Edit Reminder" : "New Reminder"}</div>

            {/* Type toggle */}
            <div style={{ display: "flex", gap: 0, marginBottom: 16, border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
              <button onClick={() => setForm(f => ({ ...f, type: "text" }))} style={{ flex: 1, padding: "8px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "'Open Sans', sans-serif", background: form.type === "text" ? accent : "#f5f5f5", color: form.type === "text" ? "#fff" : "#666" }}>Text</button>
              <button onClick={() => setForm(f => ({ ...f, type: "checklist" }))} style={{ flex: 1, padding: "8px 12px", fontSize: 12, fontWeight: 600, border: "none", borderLeft: "1px solid #ddd", cursor: "pointer", fontFamily: "'Open Sans', sans-serif", background: form.type === "checklist" ? accent : "#f5f5f5", color: form.type === "checklist" ? "#fff" : "#666" }}>Checklist</button>
            </div>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{form.type === "checklist" ? "Title" : "Reminder"}</label>
            {form.type === "text" ? (
              <textarea value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder="What do you need to remember?" rows={3} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", resize: "vertical", boxSizing: "border-box", marginBottom: 16 }} autoFocus />
            ) : (
              <>
                <input value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder="e.g. Site prep checklist" style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box", marginBottom: 12 }} autoFocus />
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Items</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {form.items.map(item => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={item.done} onChange={() => toggleFormItem(item.id)} style={{ width: 15, height: 15, accentColor: accent, cursor: "pointer" }} />
                      <span style={{ flex: 1, fontSize: 13, color: item.done ? "#aaa" : "#333", textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                      <button onClick={() => removeFormItem(item.id)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, padding: 2 }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                  <input value={newItemText} onChange={e => setNewItemText(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addFormItem())} placeholder="Add an item..." style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
                  <button onClick={addFormItem} style={{ padding: "8px 12px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Add</button>
                </div>
              </>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Link to Job</label>
                <select value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value ? Number(e.target.value) : "" }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }}>
                  <option value="">None</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 16px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>Cancel</button>
              <button onClick={saveReminder} style={{ padding: "8px 16px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif" }}>{editReminder ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reminders;
