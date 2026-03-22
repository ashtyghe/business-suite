import { useState } from "react";
import { useAppStore } from "../lib/store";
import { createNote } from "../lib/db";
import s from "./QuickAddNoteModal.module.css";

const NOTE_CATEGORIES = [
  { id: "general", label: "General", color: "#64748b" },
  { id: "site_update", label: "Site Update", color: "#0891b2" },
  { id: "issue", label: "Issue", color: "#dc2626" },
  { id: "inspection", label: "Inspection", color: "#7c3aed" },
  { id: "delivery", label: "Delivery", color: "#d97706" },
  { id: "safety", label: "Safety", color: "#059669" },
];

const CURRENT_USER = "Alex Jones";

const QuickAddNoteModal = ({ onClose }) => {
  const { jobs, setJobs } = useAppStore();
  const activeJobs = jobs
    .filter(j => j.status !== "completed" && j.status !== "cancelled")
    .sort((a, b) => a.title.localeCompare(b.title));

  const [jobId, setJobId] = useState(activeJobs.length === 1 ? activeJobs[0].id : "");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  const canSave = jobId && text.trim();

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);

    const note = {
      id: Date.now(),
      text: text.trim(),
      category,
      attachments: [],
      createdAt: new Date().toISOString(),
      createdBy: CURRENT_USER,
    };

    // Update store immediately (optimistic)
    setJobs(js => js.map(j =>
      j.id === jobId ? { ...j, notes: [...(j.notes || []), note] } : j
    ));

    // Persist to database
    try {
      await createNote({ jobId, text: text.trim(), category, createdBy: CURRENT_USER });
    } catch { /* store already updated */ }

    onClose();
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.panel} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.headerTitle}>Quick Note</div>
          <button className={s.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div className={s.fieldGroup}>
          <label className={s.fieldLabel}>Job</label>
          <select className={s.select} value={jobId} onChange={e => setJobId(e.target.value)}>
            <option value="">Select a job...</option>
            {activeJobs.map(j => (
              <option key={j.id} value={j.id}>{j.jobNumber ? `${j.jobNumber} — ` : ""}{j.title}</option>
            ))}
          </select>
        </div>

        <div className={s.fieldGroup}>
          <label className={s.fieldLabel}>Note</label>
          <textarea
            className={s.textarea}
            placeholder="Type your note..."
            value={text}
            onChange={e => setText(e.target.value)}
            autoFocus
          />
        </div>

        <div className={s.fieldGroup}>
          <label className={s.fieldLabel}>Category</label>
          <div className={s.categoryRow}>
            {NOTE_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={s.categoryPill}
                style={category === cat.id
                  ? { background: cat.color, color: "#fff", borderColor: cat.color }
                  : { color: cat.color, borderColor: cat.color + "40" }
                }
                onClick={() => setCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={s.saveBtn} disabled={!canSave} onClick={handleSave}>
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickAddNoteModal;
