import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { addLog, fmtDate } from "../../utils/helpers";
import { TEAM, SECTION_COLORS } from "../../fixtures/seedData.jsx";
import s from './JobTasks.module.css';

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
      id: Date.now() + Math.random(), text: p.name, done: p.progress >= 100, dueDate: p.endDate, assignedTo: "", phaseId: p.id, createdAt: new Date().toISOString()
    }));
    if (newTasks.length === 0) return;
    setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: [...(j.tasks || []), ...newTasks], activityLog: addLog(j.activityLog, `Copied ${newTasks.length} tasks from Gantt phases`) } : j));
  };

  return (
    <div>
      <div className={s.toolbar}>
        {tasks.length > 0 && (
          <div className={s.progressRow}>
            <span className={s.progressLabel}>{done} of {tasks.length} complete</span>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: `${tasks.length > 0 ? (done / tasks.length) * 100 : 0}%`, background: done === tasks.length ? "#059669" : jobAccent }} />
            </div>
          </div>
        )}
        {!tasks.length && <div className={s.spacer} />}
        {(job.phases || []).length > 0 && <button className="btn btn-sm" style={{ background: jobAccent }} onClick={copyFromGantt}>Copy from Gantt</button>}
        <button className="btn btn-sm" style={{ background: jobAccent }} onClick={() => setShowTaskForm(true)}>+ Add Task</button>
      </div>

      {showTaskForm && (
        <div className={s.taskForm}>
          <input className="form-control" value={taskForm.text} onChange={e => setTaskForm(f => ({ ...f, text: e.target.value }))} placeholder="Task description…" style={{ marginBottom: 10 }} />
          <div className={s.taskFormGrid}>
            <div><label className={s.fieldLabel}>Due Date</label><input type="date" className="form-control" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            <div><label className={s.fieldLabel}>Assigned To</label>
              <select className="form-control" value={taskForm.assignedTo} onChange={e => setTaskForm(f => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">Unassigned</option>
                {TEAM.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className={s.taskFormActions}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowTaskForm(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: jobAccent }} onClick={addTask} disabled={!taskForm.text.trim()}>Add Task</button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !showTaskForm && (
        <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-text">No tasks yet</div></div>
      )}

      {tasks.length > 0 && (
        <div className={s.taskList}>
          {tasks.map(task => {
            const isOverdue = !task.done && task.dueDate && task.dueDate < todayStr;
            return (
              <div key={task.id} className={`${s.taskRow} ${task.done ? s.taskRowDone : s.taskRowActive}`} style={{ borderLeft: `3px solid ${task.done ? "#059669" : isOverdue ? "#dc2626" : jobAccent}` }}>
                <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} className={s.taskCheckbox} style={{ accentColor: jobAccent }} />
                <div className={s.taskContent}>
                  <div className={`${s.taskText} ${task.done ? s.taskTextDone : s.taskTextActive}`}>{task.text}</div>
                  <div className={s.taskMeta}>
                    {task.dueDate && <span className={isOverdue ? s.overdue : undefined}>{isOverdue ? "⚠️ " : ""}{fmtDate(task.dueDate)}</span>}
                    {task.assignedTo && <span>· {task.assignedTo}</span>}
                  </div>
                </div>
                <button className={`btn btn-ghost ${s.deleteBtn}`} onClick={() => deleteTask(task.id)}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JobTasks;
