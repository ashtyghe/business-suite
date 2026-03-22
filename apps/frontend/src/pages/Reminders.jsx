import { useState, memo } from "react";
import { useAppStore } from '../lib/store';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import s from './Reminders.module.css';

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
      <div className={s.statsGrid}>
        {stats.map(st => (
          <div key={st.label} className={s.statCard} style={{ borderLeft: `4px solid ${st.color}` }}>
            <div className={s.statCount} style={{ color: st.color }}>{st.count}</div>
            <div className={s.statLabel}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className={s.toolbar}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reminders..." className={s.searchInput} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={s.filterSelect}>
          <option value="all">All</option>
          <option value="overdue">Overdue</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <button onClick={openNew} className={s.newBtn} style={{ background: accent }}>+ New Reminder</button>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div className={s.emptyState}>No reminders found</div>
      ) : (
        <div className={s.list}>
          {sorted.map(r => {
            const job = r.jobId ? jobs.find(j => j.id === r.jobId) : null;
            const isOverdue = r.status === "pending" && r.dueDate < today;
            const checklistProgress = r.type === "checklist" && r.items?.length ? `${r.items.filter(i => i.done).length}/${r.items.length}` : null;
            return (
              <div key={r.id} onClick={() => openEdit(r)} className={s.reminderCard} style={{ border: `1px solid ${isOverdue ? "#fecaca" : "#e8e8e8"}`, opacity: r.status !== "pending" ? 0.6 : 1 }}>
                <div className={s.cardRow}>
                  {/* Round checkbox */}
                  <button onClick={e => { e.stopPropagation(); toggleComplete(r.id); }} className={s.checkbox} style={{ border: r.status === "completed" ? `2px solid ${accent}` : "2px solid #ccc", background: r.status === "completed" ? accent : "transparent" }}>
                    {r.status === "completed" && <span className={s.checkmark}>✓</span>}
                  </button>
                  {/* Content */}
                  <div className={s.cardContent}>
                    <div className={s.cardTitle} style={{ color: r.status === "completed" ? "#aaa" : "#111", textDecoration: r.status === "completed" ? "line-through" : "none" }}>{r.text}</div>
                    <div className={s.cardMeta}>
                      <span className={s.dueDate} style={{ color: dueDateColor(r.dueDate, r.status) }}>{dueDateLabel(r.dueDate, r.status)}</span>
                      {checklistProgress && <span className={s.badge}>{checklistProgress} done</span>}
                      {job && <span className={s.badge}>{job.title}</span>}
                      {r.status === "dismissed" && <span className={s.dismissedBadge}>Dismissed</span>}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className={s.actions} onClick={e => e.stopPropagation()}>
                    {r.status === "pending" && <button onClick={() => dismissReminder(r.id)} title="Dismiss" className={s.dismissBtn}>✕</button>}
                    <button onClick={() => deleteReminder(r.id)} title="Delete" className={s.deleteBtn}>🗑</button>
                  </div>
                </div>
                {/* Checklist items inline */}
                {r.type === "checklist" && r.items?.length > 0 && r.status === "pending" && (
                  <div onClick={e => e.stopPropagation()} className={s.checklistItems}>
                    {r.items.map(item => (
                      <label key={item.id} className={s.checklistLabel} style={{ color: item.done ? "#aaa" : "#333" }}>
                        <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(r.id, item.id)} className={s.checklistCheckbox} style={{ accentColor: accent }} />
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
        <div className={s.overlay} onClick={() => setShowModal(false)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalTitle}>{editReminder ? "Edit Reminder" : "New Reminder"}</div>

            {/* Type toggle */}
            <div className={s.typeToggle}>
              <button onClick={() => setForm(f => ({ ...f, type: "text" }))} className={s.typeBtn} style={{ background: form.type === "text" ? accent : "#f5f5f5", color: form.type === "text" ? "#fff" : "#666" }}>Text</button>
              <button onClick={() => setForm(f => ({ ...f, type: "checklist" }))} className={s.typeBtnRight} style={{ background: form.type === "checklist" ? accent : "#f5f5f5", color: form.type === "checklist" ? "#fff" : "#666" }}>Checklist</button>
            </div>

            <label className={s.fieldLabel}>{form.type === "checklist" ? "Title" : "Reminder"}</label>
            {form.type === "text" ? (
              <textarea value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder="What do you need to remember?" rows={3} className={s.textarea} autoFocus />
            ) : (
              <>
                <input value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder="e.g. Site prep checklist" className={s.input} autoFocus />
                <label className={s.fieldLabel}>Items</label>
                <div className={s.formItemsList}>
                  {form.items.map(item => (
                    <div key={item.id} className={s.formItemRow}>
                      <input type="checkbox" checked={item.done} onChange={() => toggleFormItem(item.id)} className={s.checklistCheckbox} style={{ accentColor: accent }} />
                      <span className={s.formItemText} style={{ color: item.done ? "#aaa" : "#333", textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                      <button onClick={() => removeFormItem(item.id)} className={s.removeItemBtn}>✕</button>
                    </div>
                  ))}
                </div>
                <div className={s.addItemRow}>
                  <input value={newItemText} onChange={e => setNewItemText(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addFormItem())} placeholder="Add an item..." className={s.addItemInput} />
                  <button onClick={addFormItem} className={s.addItemBtn}>Add</button>
                </div>
              </>
            )}

            <div className={s.formGrid}>
              <div>
                <label className={s.fieldLabel}>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className={s.formInput} />
              </div>
              <div>
                <label className={s.fieldLabel}>Link to Job</label>
                <select value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value ? Number(e.target.value) : "" }))} className={s.formSelect}>
                  <option value="">None</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
            </div>
            <div className={s.modalFooter}>
              <button onClick={() => setShowModal(false)} className={s.cancelBtn}>Cancel</button>
              <button onClick={saveReminder} className={s.saveBtn} style={{ background: accent }}>{editReminder ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(Reminders);
