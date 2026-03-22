import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { useAppStore } from "../lib/store";
import { useAuth } from "../lib/AuthContext";
import { addLog, calcHoursFromTimes, addMinsToTime } from "../utils/helpers";
import { Icon } from "../components/Icon";
import { SectionDrawer } from "../components/shared";
import { SECTION_COLORS, TEAM } from "../fixtures/seedData.jsx";
import { createTimeEntry, updateTimeEntry, deleteTimeEntry } from "../lib/db";

// ── Time Tracking ─────────────────────────────────────────────────────────────

// Hour presets matching the reference timesheet app
const TIME_PRESETS = [
  { label:"30m", mins:30 }, { label:"1h", mins:60 }, { label:"1.5h", mins:90 },
  { label:"2h", mins:120 }, { label:"2.5h", mins:150 }, { label:"3h", mins:180 },
  { label:"3.5h", mins:210 }, { label:"4h", mins:240 }, { label:"4.5h", mins:270 },
  { label:"5h", mins:300 }, { label:"5.5h", mins:330 }, { label:"6h", mins:360 },
  { label:"6.5h", mins:390 }, { label:"7h", mins:420 }, { label:"8h", mins:480 },
];

// Colour thresholds per day
const DAY_THR = { orange: 4, green: 6 };


function dayColour(hours) {
  if (hours === 0) return "#ccc";
  if (hours >= DAY_THR.green) return "#27ae60";
  if (hours >= DAY_THR.orange) return "#e67e22";
  return "#e74c3c";
}

// ── Log Time Modal ────────────────────────────────────────────────────────────
const LogTimeModal = ({ jobs, onSave, onClose, editEntry = null, staff }) => {
  const auth = useAuth();
  const staffNames = (staff && staff.length > 0) ? staff.map(s => s.name) : TEAM;
  const isStaffRole = !auth.isAdmin && !auth.isLocalDev;
  const defaultWorker = isStaffRole ? auth.currentUserName : (staffNames[0] || "");
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => {
    if (editEntry) return {
      jobId: String(editEntry.jobId),
      worker: editEntry.worker,
      date: editEntry.date,
      startTime: editEntry.startTime || "09:00",
      endTime: editEntry.endTime || addMinsToTime("09:00", editEntry.hours * 60),
      description: editEntry.description,
      billable: editEntry.billable,
    };
    return { jobId: String(jobs[0]?.id || ""), worker: defaultWorker, date: today, startTime: "", endTime: "", description: "", billable: true };
  });
  const isNewTime = !editEntry;
  const [mode, setMode] = useState(isNewTime ? "edit" : "view");
  const [activePreset, setActivePreset] = useState(null);
  const [endTouched, setEndTouched] = useState(!!editEntry);

  const hours = calcHoursFromTimes(form.startTime, form.endTime);

  const onStartChange = (val) => {
    setForm(f => {
      const next = { ...f, startTime: val };
      if (!endTouched && val) next.endTime = addMinsToTime(val, 60);
      return next;
    });
    setActivePreset(null);
  };

  const applyPreset = (mins, label) => {
    const start = form.startTime || "09:00";
    setForm(f => ({ ...f, startTime: start, endTime: addMinsToTime(start, mins) }));
    setActivePreset(label);
    setEndTouched(true);
  };

  const save = () => {
    if (!form.startTime || !form.endTime) return;
    if (hours <= 0) return;
    if (!form.jobId) return;
    onSave({
      ...form,
      jobId: form.jobId,
      hours,
    });
    if (!isNewTime) setMode("view");
  };

  const jobName = jobs.find(j => String(j.id) === String(form.jobId))?.title || "Time Entry";

  return (
    <SectionDrawer
      accent={SECTION_COLORS.time.accent}
      icon={<Icon name="time" size={16} />}
      typeLabel="Time Entry"
      title={editEntry ? `${form.date} · ${jobName}` : "Log Time"}
      mode={mode} setMode={setMode}
      showToggle={!isNewTime}
      isNew={isNewTime}
      footer={mode === "view" ? <>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.time.accent, color: "#fff", border: "none" }} onClick={() => setMode("edit")}>
          <Icon name="edit" size={13} /> Edit
        </button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={() => editEntry ? setMode("view") : onClose()}>{editEntry ? "Cancel" : "Cancel"}</button>
        <button className="btn btn-sm" style={{ background: SECTION_COLORS.time.accent, color: "#fff", border: "none" }} onClick={save} disabled={hours <= 0 || !form.jobId}>
          <Icon name="check" size={13} /> {isNewTime ? "Log Time" : "Save Changes"}
        </button>
      </>}
      onClose={onClose}
    >
      {mode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div className="grid-2">
            <ViewField label="Job" value={jobName} />
            <ViewField label="Worker" value={form.worker} />
          </div>
          <ViewField label="Date" value={form.date} />
          <div className="grid-2">
            <ViewField label="Start Time" value={form.startTime} />
            <ViewField label="End Time" value={form.endTime} />
          </div>
          <div style={{ textAlign: "center", padding: "12px 16px", background: SECTION_COLORS.time.light, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", color: SECTION_COLORS.time.accent, lineHeight: 1 }}>
              {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
            </div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>hours logged</div>
          </div>
          {form.description && <ViewField label="Description" value={form.description} />}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: form.billable ? "#ecfdf5" : "#f5f5f5", color: form.billable ? "#059669" : "#888" }}>
            {form.billable ? "Billable" : "Non-billable"}
          </div>
        </div>
      ) : (
      <div style={{ padding: "20px 24px" }}>
        {/* Job + Worker */}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Job</label>
            <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Worker</label>
            {isStaffRole ? (
              <input className="form-control" value={auth.currentUserName} disabled style={{ background: "#f5f5f5" }} />
            ) : (
              <select className="form-control" value={form.worker} onChange={e => setForm(f => ({ ...f, worker: e.target.value }))}>
                {staffNames.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Date */}
        <div className="form-group">
          <label className="form-label">Date</label>
          <input type="date" className="form-control" value={form.date} max={today} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>

        {/* Start / End */}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input type="time" className="form-control" value={form.startTime}
              onChange={e => onStartChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Time</label>
            <input type="time" className="form-control" value={form.endTime}
              onChange={e => { setEndTouched(true); setForm(f => ({ ...f, endTime: e.target.value })); setActivePreset(null); }} />
          </div>
        </div>

        {/* Hours display */}
        <div style={{ textAlign: "center", padding: "12px 16px", background: SECTION_COLORS.time.light, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", color: hours > 0 ? SECTION_COLORS.time.accent : "#ccc", lineHeight: 1 }}>
            {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
          </div>
          <div style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>hours logged</div>
        </div>

        {/* Quick-select presets */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Quick Select</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 16 }}>
          {TIME_PRESETS.map(p => (
            <button key={p.label}
              onClick={() => applyPreset(p.mins, p.label)}
              style={{
                padding: "7px 4px", borderRadius: 20, fontSize: 12, fontWeight: 600, textAlign: "center",
                border: activePreset === p.label ? `2px solid ${SECTION_COLORS.time.accent}` : "2px solid #e0e0e0",
                background: activePreset === p.label ? SECTION_COLORS.time.accent : "#f5f5f5",
                color: activePreset === p.label ? "#fff" : "#555",
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-control" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What was done on this job?" />
        </div>

        {/* Billable */}
        <label className="checkbox-label">
          <input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))} />
          <span>Billable to client</span>
        </label>
      </div>
      )}
    </SectionDrawer>
  );
};

// ── Mini calendar ─────────────────────────────────────────────────────────────
const TimeCalendar = ({ timeEntries, selectedWorker, onDayClick, calMonth, setCalMonth }) => {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + calMonth, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const today = new Date().toISOString().slice(0, 10);
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = viewDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  // Build day→hours map
  const dayHrs = {};
  timeEntries
    .filter(t => !selectedWorker || t.worker === selectedWorker)
    .filter(t => t.date.startsWith(monthStr))
    .forEach(t => { dayHrs[t.date] = (dayHrs[t.date] || 0) + t.hours; });

  const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthStr}-${String(d).padStart(2,"0")}`;
    const hrs = dayHrs[iso] || 0;
    const isFuture = iso > today;
    const isToday = iso === today;
    const clr = dayColour(hrs);
    cells.push(
      <div key={iso}
        onClick={() => hrs > 0 && onDayClick(iso)}
        style={{
          background: "#fff", borderRadius: 8, padding: "6px 4px", minHeight: 48, textAlign: "center",
          boxShadow: isToday ? "0 0 0 2px #111" : "0 1px 4px rgba(0,0,0,0.06)",
          opacity: isFuture ? 0.4 : 1,
          cursor: hrs > 0 ? "pointer" : "default",
          transition: "box-shadow 0.15s",
        }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#999", marginBottom: 3 }}>{d}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: hrs > 0 ? clr : "#ddd", lineHeight: 1 }}>
          {hrs > 0 ? `${hrs.toFixed(1)}h` : "·"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setCalMonth(m => m - 1)} style={{ padding: "4px 10px", fontSize: 18 }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{monthLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setCalMonth(m => m + 1)} style={{ padding: "4px 10px", fontSize: 18 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 6 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0" }}>{d}</div>)}
        {cells}
      </div>
    </div>
  );
};

// ── Week strip ────────────────────────────────────────────────────────────────
const WeekStrip = ({ timeEntries, selectedWorker, weekOffset, setWeekOffset, selectedDay, setSelectedDay }) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const weekLabel = `${days[0].toLocaleDateString("en-AU", { day:"numeric", month:"short" })} – ${days[6].toLocaleDateString("en-AU", { day:"numeric", month:"short" })}`;

  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "12px 16px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)} style={{ fontSize: 20, padding: "2px 10px" }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>{weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)} style={{ fontSize: 20, padding: "2px 10px" }}>›</button>
      </div>
      <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 1 }}>
        {days.map(d => {
          const iso = d.toISOString().slice(0, 10);
          const hrs = timeEntries
            .filter(t => t.date === iso && (!selectedWorker || t.worker === selectedWorker))
            .reduce((s, t) => s + t.hours, 0);
          const isToday = iso === today;
          const isPast = iso <= today;
          const isActive = iso === selectedDay;
          const clr = isPast && hrs === 0 ? "#e74c3c" : dayColour(hrs);
          const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          return (
            <div key={iso}
              onClick={() => setSelectedDay(iso)}
              style={{
                flex: 1, minWidth: 40, textAlign: "center", padding: "8px 2px 10px",
                borderRadius: "8px 8px 0 0", cursor: "pointer",
                background: isActive ? "#f5f5f5" : "transparent",
                borderBottom: isActive ? "3px solid #111" : "3px solid transparent",
                transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: isActive ? "#111" : "#aaa", marginBottom: 3 }}>
                {DAYS[d.getDay()]}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? "#111" : "#444", marginBottom: 2 }}>{d.getDate()}</div>
              <div style={{ fontSize: 10, fontWeight: 700, height: 14, color: hrs > 0 || isPast ? clr : "transparent" }}>
                {hrs > 0 ? `${hrs.toFixed(1)}h` : isPast ? "" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main TimeTracking component ───────────────────────────────────────────────
const TimeTracking = () => {
  const { timeEntries, setTimeEntries, jobs, setJobs, clients, staff } = useAppStore();
  const auth = useAuth();
  const isOwn = (entry) => entry.worker === auth.currentUserName;
  const canEditEntry = (entry) => auth.isAdmin || auth.isLocalDev || isOwn(entry);
  const canDeleteEntry = (entry) => auth.isAdmin || auth.isLocalDev || isOwn(entry);
  const today = new Date().toISOString().slice(0, 10);
  const [tsTab, setTsTab] = useState("week");           // "week" | "team" | "calendar"
  const [selectedWorker, setSelectedWorker] = useState("all");
  const [selectedDay, setSelectedDay] = useState(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [calMonth, setCalMonth] = useState(0);
  const [showLogModal, setShowLogModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [calDrillDay, setCalDrillDay] = useState(null);
  const [search, setSearch] = useState("");

  // Stats — filtered to selected worker and search
  const searchFilter = (t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const job = jobs.find(j => j.id === t.jobId);
    const client = job ? clients.find(c => c.id === job.clientId) : null;
    return (t.description || "").toLowerCase().includes(q) ||
      (t.worker || "").toLowerCase().includes(q) ||
      (job?.title || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (t.date || "").includes(q);
  };
  const workerEntries = (selectedWorker === "all" ? timeEntries : timeEntries.filter(t => t.worker === selectedWorker)).filter(searchFilter);
  const now = new Date();
  const todayHrs   = workerEntries.filter(t => t.date === today).reduce((s,t) => s+t.hours, 0);
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monISO = (() => { const d = new Date(now); d.setDate(now.getDate() - dow); return d.toISOString().slice(0,10); })();
  const weekHrs  = workerEntries.filter(t => t.date >= monISO).reduce((s,t) => s+t.hours, 0);
  const monthHrs = workerEntries.filter(t => t.date.startsWith(today.slice(0,7))).reduce((s,t) => s+t.hours, 0);

  // Day entries for week view
  const dayEntries = timeEntries
    .filter(t => t.date === selectedDay && (selectedWorker === "all" || t.worker === selectedWorker))
    .filter(searchFilter)
    .sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));

  const saveEntry = async (data) => {
    try {
      const staffMember = staff ? staff.find(s => s.name === data.worker) : null;
      const staffId = staffMember?.id;
      if (editEntry) {
        const saved = await updateTimeEntry(editEntry.id, data, staffId);
        setTimeEntries(ts => ts.map(t => t.id === editEntry.id ? saved : t));
        setJobs && setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `${data.worker} updated time entry (${data.hours}h)`) } : j));
      } else {
        const saved = await createTimeEntry(data, staffId);
        setTimeEntries(ts => [...ts, saved]);
        setJobs && setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `${data.worker} logged ${data.hours}h`) } : j));
      }
    } catch (err) { console.error('Failed to save time entry:', err); }
    setShowLogModal(false);
    setEditEntry(null);
  };

  const del = async (id) => {
    try {
      await deleteTimeEntry(id);
      setTimeEntries(ts => ts.filter(t => t.id !== id));
    } catch (err) { console.error('Failed to delete time entry:', err); }
  };
  const openEdit = (entry) => { setEditEntry(entry); setShowLogModal(true); };
  const openNew = () => { setEditEntry(null); setShowLogModal(true); };

  // Team summary — derive worker list from staff prop (or fall back to unique names in entries)
  const staffNames = (staff && staff.length > 0) ? staff.map(s => s.name) : [...new Set(timeEntries.map(t => t.worker).filter(Boolean))];
  const byWorker = staffNames.map(w => {
    const wEntries = timeEntries.filter(t => t.worker === w);
    return {
      name: w,
      total: wEntries.reduce((s,t) => s+t.hours, 0),
      today: wEntries.filter(t => t.date === today).reduce((s,t) => s+t.hours, 0),
      week: wEntries.filter(t => t.date >= monISO).reduce((s,t) => s+t.hours, 0),
      billable: wEntries.filter(t => t.billable).reduce((s,t) => s+t.hours, 0),
      count: wEntries.length,
    };
  }).filter(w => w.total > 0).sort((a,b) => b.total - a.total);

  const statClr = (h, o, g) => h >= g ? "#27ae60" : h >= o ? "#e67e22" : h > 0 ? "#e74c3c" : "#aaa";

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Today", val: todayHrs, o: DAY_THR.orange, g: DAY_THR.green },
          { label: "This Week", val: weekHrs, o: DAY_THR.orange * 5, g: DAY_THR.green * 5 },
          { label: "This Month", val: monthHrs, o: DAY_THR.orange * 20, g: DAY_THR.green * 20 },
        ].map(s => {
          const color = statClr(s.val, s.o, s.g);
          return (
            <div key={s.label} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}` }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{s.val.toFixed(1)}h</div>
              <div className="stat-sub">{s.val > 0 ? `${(s.val / s.g * 100).toFixed(0)}% of target` : "No hours logged"}</div>
            </div>
          );
        })}
      </div>
      {/* Controls row */}
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries, jobs..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}>
          <option value="all">All Team</option>
          {staffNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="section-action-btns"><button className="btn btn-primary" onClick={openNew} style={{ whiteSpace: "nowrap", background: SECTION_COLORS.time.accent }}><Icon name="plus" size={14} />Log Time</button></div>
      </div>

      {/* Sub-tabs */}
      <div className="tabs" style={{ marginBottom: 0 }}>
        {[["week","Week View"],["team","Team"],["calendar","Calendar"]].map(([id,label]) => (
          <div key={id} className={`tab ${tsTab === id ? "active" : ""}`} onClick={() => setTsTab(id)}>{label}</div>
        ))}
      </div>

      {/* ── Week View ── */}
      {tsTab === "week" && (
        <div style={{ background: "#fafafa", borderRadius: "0 0 10px 10px", border: "1px solid #e8e8e8", borderTop: "none", marginBottom: 20 }}>
          <WeekStrip timeEntries={timeEntries} selectedWorker={selectedWorker === "all" ? null : selectedWorker}
            weekOffset={weekOffset} setWeekOffset={setWeekOffset}
            selectedDay={selectedDay} setSelectedDay={setSelectedDay} />

          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}
              <span style={{ color: dayColour(dayEntries.reduce((s,t) => s+t.hours, 0)) }}>
                {dayEntries.reduce((s,t) => s+t.hours, 0).toFixed(1)}h
              </span>
            </div>

            {dayEntries.length === 0 ? (
              <div className="empty-state" style={{ padding: "28px 0" }}>
                <div className="empty-state-icon">⏱</div>
                <div className="empty-state-text">No entries for this day</div>
                <div className="empty-state-sub">Click "Log Time" to add one</div>
              </div>
            ) : (
              dayEntries.map(entry => {
                const job = jobs.find(j => j.id === entry.jobId);
                const clr = dayColour(entry.hours);
                return (
                  <div key={entry.id} onClick={() => canEditEntry(entry) ? openEdit(entry) : null} style={{
                    background: "#fff", borderRadius: 10, padding: 14, marginBottom: 10,
                    border: "1px solid #e8e8e8", borderLeft: `4px solid ${clr}`,
                    display: "flex", gap: 14, alignItems: "flex-start", cursor: canEditEntry(entry) ? "pointer" : "default", transition: "border-color 0.15s",
                  }}>
                    <div style={{ minWidth: 56, textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: clr, lineHeight: 1 }}>{entry.hours.toFixed(1)}h</div>
                      {entry.startTime && <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{entry.startTime}–{entry.endTime}</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <div className="avatar" style={{ width: 22, height: 22, fontSize: 9, margin: 0, flexShrink: 0 }}>
                          {entry.worker.split(" ").map(w=>w[0]).join("")}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{entry.worker}</span>
                        <span className="badge" style={{ background: entry.billable ? "#111" : "#f0f0f0", color: entry.billable ? "#fff" : "#999", fontSize: 10 }}>
                          {entry.billable ? "Billable" : "Non-bill"}
                        </span>
                      </div>
                      {job && <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>{job.title}</div>}
                      {entry.description && <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{entry.description}</div>}
                    </div>
                    {canDeleteEntry(entry) && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>
                    </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Team View ── */}
      {tsTab === "team" && (
        <div style={{ marginTop: 16 }}>
          {byWorker.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-text">No time logged yet</div></div>
          ) : (
            byWorker.map(w => (
              <div key={w.name} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="avatar" style={{ width: 36, height: 36, fontSize: 13, margin: 0 }}>{w.name.split(" ").map(p=>p[0]).join("")}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>{w.count} entries</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: dayColour(w.total / 20) }}>{w.total.toFixed(1)}h</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>all time</div>
                  </div>
                </div>
                <div className="time-team-stats">
                  {[
                    { label: "Today", val: w.today, clr: dayColour(w.today) },
                    { label: "This Week", val: w.week, clr: dayColour(w.week / 5) },
                    { label: "Billable", val: w.billable, clr: "#27ae60" },
                    { label: "Non-Bill", val: w.total - w.billable, clr: "#e67e22" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "#f8f8f8", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.clr }}>{s.val.toFixed(1)}h</div>
                      <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div className="progress-fill" style={{ width: `${(w.billable / (w.total || 1)) * 100}%`, background: "#27ae60" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>
                    {w.total > 0 ? Math.round((w.billable/w.total)*100) : 0}% billable
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Calendar View ── */}
      {tsTab === "calendar" && (
        <div style={{ marginTop: 16 }}>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <TimeCalendar
              timeEntries={timeEntries}
              selectedWorker={selectedWorker === "all" ? null : selectedWorker}
              calMonth={calMonth} setCalMonth={setCalMonth}
              onDayClick={(iso) => setCalDrillDay(calDrillDay === iso ? null : iso)}
            />
            {/* Colour legend */}
            <div style={{ display: "flex", gap: 14, marginTop: 10, justifyContent: "center" }}>
              {[["#e74c3c",`< ${DAY_THR.orange}h`],["#e67e22",`${DAY_THR.orange}–${DAY_THR.green}h`],["#27ae60",`≥ ${DAY_THR.green}h`]].map(([c,l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#888" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Day drill-down */}
          {calDrillDay && (() => {
            const dayE = timeEntries
              .filter(t => t.date === calDrillDay && (selectedWorker === "all" || t.worker === selectedWorker))
              .sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));
            const dayTotal = dayE.reduce((s,t)=>s+t.hours, 0);
            const d = new Date(calDrillDay + "T12:00:00");
            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {d.toLocaleDateString("en-AU", { weekday:"long", day:"numeric", month:"long" })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: dayColour(dayTotal) }}>{dayTotal.toFixed(1)}h</span>
                    <button className="btn btn-ghost btn-xs" onClick={() => setCalDrillDay(null)}>✕</button>
                  </div>
                </div>
                {dayE.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: 20 }}>No entries</div>
                ) : dayE.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  return (
                    <div key={entry.id} style={{ background: "#fff", border: "1px solid #e8e8e8", borderLeft: `4px solid ${dayColour(entry.hours)}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 18, color: dayColour(entry.hours), minWidth: 44 }}>{entry.hours.toFixed(1)}h</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.worker}</div>
                        {job && <div style={{ fontSize: 12, color: "#888" }}>{job.title}</div>}
                        {entry.description && <div style={{ fontSize: 11, color: "#aaa" }}>{entry.description}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {canEditEntry(entry) && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(entry)}><Icon name="edit" size={12} /></button>}
                        {canDeleteEntry(entry) && <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Log / Edit modal */}
      {showLogModal && (
        <LogTimeModal
          jobs={jobs}
          editEntry={editEntry}
          onSave={saveEntry}
          onClose={() => { setShowLogModal(false); setEditEntry(null); }}
          staff={staff}
        />
      )}
    </div>
  );
};


export default TimeTracking;
