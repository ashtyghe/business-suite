import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { addLog } from "../../utils/helpers";
import { TEAM, SECTION_COLORS } from "../../fixtures/seedData.jsx";

const JobTasks = ({ job }) => {
  const { setJobs } = useAppStore();
  const jobAccent = SECTION_COLORS.jobs.accent;

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ text: "", dueDate: "", assignedTo: "" });

  const tasks = job.tasks || [];
  const done = tasks.filter(t => t.done).length;
  const todayStr = new Date().toISOString().slice(0,10);

  const toggleTask = (taskId) => {
    setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: (j.tasks || []).map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : j));
  };
  const addTask = () => {
    if (!taskForm.text.trim()) return;
    const task = { id: Date.now(), text: taskForm.text, done: false, dueDate: taskForm.dueDate, assignedTo: taskForm.assignedTo, createdAt: new Date().toISOString() };
    setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: [...(j.tasks || []), task], activityLog: addLog(j.activityLog, `Added task "${task.text}"`) } : j));
    setTaskForm({ text: "", dueDate: "", assignedTo: "" });
    setShowTaskForm(false);
  };
  const deleteTask = (taskId) => {
    setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: (j.tasks || []).filter(t => t.id !== taskId) } : j));
  };
  const copyFromGantt = () => {
    const phases = job.phases || [];
    if (phases.length === 0) return;
    const existingTexts = new Set((job.tasks || []).map(t => t.text));
    const newTasks = phases.filter(p => !existingTexts.has(p.name)).map(p => ({
      id: Date.now() + Math.random(), text: p.name, done: p.progress >= 100, dueDate: p.endDate, assignedTo: "", createdAt: new Date().toISOString()
    }));
    if (newTasks.length === 0) return;
    setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: [...(j.tasks || []), ...newTasks], activityLog: addLog(j.activityLog, `Copied ${newTasks.length} tasks from Gantt phases`) } : j));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        {tasks.length > 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{done} of {tasks.length} complete</span>
            <div style={{ flex: 1, maxWidth: 200, height: 6, background: "#e8e8e8", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${tasks.length > 0 ? (done / tasks.length) * 100 : 0}%`, height: "100%", background: done === tasks.length ? "#059669" : jobAccent, borderRadius: 3, transition: "width 0.3s" }} />
            </div>
          </div>
        )}
        {!tasks.length && <div style={{ flex: 1 }} />}
        {(job.phases || []).length > 0 && <button className="btn btn-ghost btn-sm" onClick={copyFromGantt}>📋 Copy from Gantt</button>}
        <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => setShowTaskForm(true)}>+ Add Task</button>
      </div>

      {showTaskForm && (
        <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16 }}>
          <input className="form-control" value={taskForm.text} onChange={e => setTaskForm(f => ({ ...f, text: e.target.value }))} placeholder="Task description…" style={{ marginBottom: 10 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Due Date</label><input type="date" className="form-control" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "#888" }}>Assigned To</label>
              <select className="form-control" value={taskForm.assignedTo} onChange={e => setTaskForm(f => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">Unassigned</option>
                {TEAM.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowTaskForm(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={addTask} disabled={!taskForm.text.trim()}>Add Task</button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !showTaskForm && (
        <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-text">No tasks yet</div></div>
      )}

      {tasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {tasks.map(task => {
            const isOverdue = !task.done && task.dueDate && task.dueDate < todayStr;
            return (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: task.done ? "#f9fafb" : "#fff", border: "1px solid #e8e8e8", borderRadius: 8, borderLeft: `3px solid ${task.done ? "#059669" : isOverdue ? "#dc2626" : jobAccent}` }}>
                <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} style={{ width: 18, height: 18, cursor: "pointer", accentColor: jobAccent }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, textDecoration: task.done ? "line-through" : "none", color: task.done ? "#999" : "#333" }}>{task.text}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 11, color: "#888" }}>
                    {task.dueDate && <span style={{ color: isOverdue ? "#dc2626" : "#888", fontWeight: isOverdue ? 700 : 400 }}>{isOverdue ? "⚠️ " : ""}{task.dueDate}</span>}
                    {task.assignedTo && <span>· {task.assignedTo}</span>}
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ padding: 4, color: "#ccc", fontSize: 12 }} onClick={() => deleteTask(task.id)}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JobTasks;
