import { useState, useEffect, useRef, useMemo, Fragment, memo } from "react";
import { useAppStore } from "../lib/store";
import { useAuth } from "../lib/AuthContext";
import { addLog, calcHoursFromTimes, addMinsToTime } from "../utils/helpers";
import { Icon } from "../components/Icon";
import { SectionDrawer } from "../components/shared";
import { SECTION_COLORS, TEAM } from "../fixtures/seedData.jsx";
import { createTimeEntry, updateTimeEntry, deleteTimeEntry } from "../lib/db";
import { getTodayStr } from "../utils/timezone";
import s from './TimeTracking.module.css';

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
  const today = getTodayStr();
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
        <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: SECTION_COLORS.time.accent }} onClick={() => setMode("edit")}>
          <Icon name="edit" size={13} /> Edit
        </button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={() => editEntry ? setMode("view") : onClose()}>{editEntry ? "Cancel" : "Cancel"}</button>
        <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: SECTION_COLORS.time.accent }} onClick={save} disabled={hours <= 0 || !form.jobId}>
          <Icon name="check" size={13} /> {isNewTime ? "Log Time" : "Save Changes"}
        </button>
      </>}
      onClose={onClose}
    >
      {mode === "view" ? (
        <div className={s.viewPad}>
          <div className="grid-2">
            <ViewField label="Job" value={jobName} />
            <ViewField label="Worker" value={form.worker} />
          </div>
          <ViewField label="Date" value={form.date} />
          <div className="grid-2">
            <ViewField label="Start Time" value={form.startTime} />
            <ViewField label="End Time" value={form.endTime} />
          </div>
          <div className={s.hoursBox} style={{ background: SECTION_COLORS.time.light }}>
            <div className={s.hoursValue} style={{ color: SECTION_COLORS.time.accent }}>
              {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
            </div>
            <div className={s.hoursLabel}>hours logged</div>
          </div>
          {form.description && <ViewField label="Description" value={form.description} />}
          <div className={s.billableBadge} style={{ background: form.billable ? "#ecfdf5" : "#f5f5f5", color: form.billable ? "#059669" : "#888" }}>
            {form.billable ? "Billable" : "Non-billable"}
          </div>
        </div>
      ) : (
      <div className={s.viewPad}>
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
              <input className={`form-control ${s.disabledInput}`} value={auth.currentUserName} disabled />
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
        <div className={s.hoursBox} style={{ background: SECTION_COLORS.time.light }}>
          <div className={s.hoursValue} style={{ color: hours > 0 ? SECTION_COLORS.time.accent : "#ccc" }}>
            {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
          </div>
          <div className={s.hoursLabel}>hours logged</div>
        </div>

        {/* Quick-select presets */}
        <div className={s.quickSelectLabel}>Quick Select</div>
        <div className={s.presetGrid}>
          {TIME_PRESETS.map(p => (
            <button key={p.label}
              onClick={() => applyPreset(p.mins, p.label)}
              className={s.presetBtn}
              style={{
                border: activePreset === p.label ? `2px solid ${SECTION_COLORS.time.accent}` : "2px solid #e0e0e0",
                background: activePreset === p.label ? SECTION_COLORS.time.accent : "#f5f5f5",
                color: activePreset === p.label ? "#fff" : "#555",
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
  const today = getTodayStr();
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
        className={s.calCell}
        style={{
          boxShadow: isToday ? "0 0 0 2px #111" : "0 1px 4px rgba(0,0,0,0.06)",
          opacity: isFuture ? 0.4 : 1,
          cursor: hrs > 0 ? "pointer" : "default",
        }}>
        <div className={s.calDayNum}>{d}</div>
        <div className={s.calDayHrs} style={{ color: hrs > 0 ? clr : "#ddd" }}>
          {hrs > 0 ? `${hrs.toFixed(1)}h` : "·"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={s.calNav}>
        <button className={`btn btn-ghost btn-sm ${s.calNavBtn}`} onClick={() => setCalMonth(m => m - 1)}>‹</button>
        <span className={s.calMonthLabel}>{monthLabel}</span>
        <button className={`btn btn-ghost btn-sm ${s.calNavBtn}`} onClick={() => setCalMonth(m => m + 1)}>›</button>
      </div>
      <div className={s.calGrid}>
        {DOW.map(d => <div key={d} className={s.calDow}>{d}</div>)}
        {cells}
      </div>
    </div>
  );
};

// ── Week strip ────────────────────────────────────────────────────────────────
const WeekStrip = ({ timeEntries, selectedWorker, weekOffset, setWeekOffset, selectedDay, setSelectedDay }) => {
  const today = getTodayStr();
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
    <div className={s.weekStrip}>
      <div className={s.weekNav}>
        <button className={`btn btn-ghost btn-sm ${s.weekNavBtn}`} onClick={() => setWeekOffset(w => w - 1)}>‹</button>
        <span className={s.weekLabel}>{weekLabel}</span>
        <button className={`btn btn-ghost btn-sm ${s.weekNavBtn}`} onClick={() => setWeekOffset(w => w + 1)}>›</button>
      </div>
      <div className={s.weekDays}>
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
              className={s.weekDay}
              style={{
                background: isActive ? "#f5f5f5" : "transparent",
                borderBottom: isActive ? "3px solid #111" : "3px solid transparent",
              }}>
              <div className={s.weekDayLabel} style={{ color: isActive ? "#111" : "#aaa" }}>
                {DAYS[d.getDay()]}
              </div>
              <div className={s.weekDayDate} style={{ color: isToday ? "#111" : "#444" }}>{d.getDate()}</div>
              <div className={s.weekDayHrs} style={{ color: hrs > 0 || isPast ? clr : "transparent" }}>
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
  const today = getTodayStr();
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
      <div className={s.summaryGrid}>
        {[
          { label: "Today", val: todayHrs, o: DAY_THR.orange, g: DAY_THR.green },
          { label: "This Week", val: weekHrs, o: DAY_THR.orange * 5, g: DAY_THR.green * 5 },
          { label: "This Month", val: monthHrs, o: DAY_THR.orange * 20, g: DAY_THR.green * 20 },
          { label: "Total Entries", val: workerEntries.length, o: 1, g: 1 },
        ].map(st => {
          const color = statClr(st.val, st.o, st.g);
          const isCount = st.label === "Total Entries";
          return (
            <div key={st.label} className={`stat-card ${s.statCardPad}`} style={{ borderTop: `3px solid ${color}` }}>
              <div className="stat-label">{st.label}</div>
              <div className={`stat-value ${s.statValueSize}`} style={{ color }}>{isCount ? st.val : `${st.val.toFixed(1)}h`}</div>
              <div className="stat-sub">{isCount ? (st.val === 1 ? "entry" : "entries") : st.val > 0 ? `${(st.val / st.g * 100).toFixed(0)}% of target` : "No hours logged"}</div>
            </div>
          );
        })}
      </div>
      {/* Controls row */}
      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries, jobs..." />
        </div>
        <select className={`form-control ${s.workerSelect}`} value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}>
          <option value="all">All Team</option>
          {staffNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="section-action-btns"><button className={`btn btn-primary ${s.logTimeBtn}`} onClick={openNew} style={{ background: SECTION_COLORS.time.accent }}><Icon name="plus" size={14} />Log Time</button></div>
      </div>

      {/* Sub-tabs */}
      <div className={`tabs ${s.tabsNoMargin}`}>
        {[["week","Week View"],["team","Team"],["calendar","Calendar"]].map(([id,label]) => (
          <div key={id} className={`tab ${tsTab === id ? "active" : ""}`} onClick={() => setTsTab(id)}>{label}</div>
        ))}
      </div>

      {/* ── Week View ── */}
      {tsTab === "week" && (
        <div className={s.weekPanel}>
          <WeekStrip timeEntries={timeEntries} selectedWorker={selectedWorker === "all" ? null : selectedWorker}
            weekOffset={weekOffset} setWeekOffset={setWeekOffset}
            selectedDay={selectedDay} setSelectedDay={setSelectedDay} />

          <div className={s.weekPanelInner}>
            <div className={s.dayHeading}>
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}
              <span style={{ color: dayColour(dayEntries.reduce((sum,t) => sum+t.hours, 0)) }}>
                {dayEntries.reduce((sum,t) => sum+t.hours, 0).toFixed(1)}h
              </span>
            </div>

            {dayEntries.length === 0 ? (
              <div className={`empty-state ${s.emptyDayState}`}>
                <div className="empty-state-icon">⏱</div>
                <div className="empty-state-text">No entries for this day</div>
                <div className="empty-state-sub">Click "Log Time" to add one</div>
              </div>
            ) : (
              dayEntries.map(entry => {
                const job = jobs.find(j => j.id === entry.jobId);
                const clr = dayColour(entry.hours);
                return (
                  <div key={entry.id} onClick={() => canEditEntry(entry) ? openEdit(entry) : null}
                    className={s.entryCard}
                    style={{ borderLeft: `4px solid ${clr}`, cursor: canEditEntry(entry) ? "pointer" : "default" }}>
                    <div className={s.entryHoursCol}>
                      <div className={s.entryHoursVal} style={{ color: clr }}>{entry.hours.toFixed(1)}h</div>
                      {entry.startTime && <div className={s.entryTimeRange}>{entry.startTime}–{entry.endTime}</div>}
                    </div>
                    <div className={s.entryBody}>
                      <div className={s.entryMeta}>
                        <div className={`avatar ${s.entryAvatar}`}>
                          {entry.worker.split(" ").map(w=>w[0]).join("")}
                        </div>
                        <span className={s.entryWorker}>{entry.worker}</span>
                        <span className={`badge ${entry.billable ? s.entryBadgeBillable : s.entryBadgeNonBill}`}>
                          {entry.billable ? "Billable" : "Non-bill"}
                        </span>
                      </div>
                      {job && <div className={s.entryJob}>{job.title}</div>}
                      {entry.description && <div className={s.entryDesc}>{entry.description}</div>}
                    </div>
                    {canDeleteEntry(entry) && (
                    <div className={s.entryActions} onClick={e => e.stopPropagation()}>
                      <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>
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
        <div className={s.teamSection}>
          {byWorker.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-text">No time logged yet</div></div>
          ) : (
            byWorker.map(w => (
              <div key={w.name} className={s.teamCard}>
                <div className={s.teamCardHeader}>
                  <div className={s.teamCardLeft}>
                    <div className={`avatar ${s.teamAvatar}`}>{w.name.split(" ").map(p=>p[0]).join("")}</div>
                    <div>
                      <div className={s.teamName}>{w.name}</div>
                      <div className={s.teamEntryCount}>{w.count} entries</div>
                    </div>
                  </div>
                  <div className={s.teamCardRight}>
                    <div className={s.teamTotalHrs} style={{ color: dayColour(w.total / 20) }}>{w.total.toFixed(1)}h</div>
                    <div className={s.teamTotalLabel}>all time</div>
                  </div>
                </div>
                <div className="time-team-stats">
                  {[
                    { label: "Today", val: w.today, clr: dayColour(w.today) },
                    { label: "This Week", val: w.week, clr: dayColour(w.week / 5) },
                    { label: "Billable", val: w.billable, clr: "#27ae60" },
                    { label: "Non-Bill", val: w.total - w.billable, clr: "#e67e22" },
                  ].map(st => (
                    <div key={st.label} className={s.teamStatBox}>
                      <div className={s.teamStatVal} style={{ color: st.clr }}>{st.val.toFixed(1)}h</div>
                      <div className={s.teamStatLabel}>{st.label}</div>
                    </div>
                  ))}
                </div>
                <div className={s.teamProgressWrap}>
                  <div className={`progress-bar ${s.progressHeight}`}>
                    <div className="progress-fill" style={{ width: `${(w.billable / (w.total || 1)) * 100}%`, background: "#27ae60" }} />
                  </div>
                  <div className={s.billablePercent}>
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
        <div className={s.calSection}>
          <div className={`card ${s.calCard}`}>
            <TimeCalendar
              timeEntries={timeEntries}
              selectedWorker={selectedWorker === "all" ? null : selectedWorker}
              calMonth={calMonth} setCalMonth={setCalMonth}
              onDayClick={(iso) => setCalDrillDay(calDrillDay === iso ? null : iso)}
            />
            {/* Colour legend */}
            <div className={s.calLegend}>
              {[["#e74c3c",`< ${DAY_THR.orange}h`],["#e67e22",`${DAY_THR.orange}–${DAY_THR.green}h`],["#27ae60",`≥ ${DAY_THR.green}h`]].map(([c,l]) => (
                <div key={l} className={s.calLegendItem}>
                  <span className={s.calLegendDot} style={{ background: c }} />
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
            const dayTotal = dayE.reduce((sum,t)=>sum+t.hours, 0);
            const d = new Date(calDrillDay + "T12:00:00");
            return (
              <div>
                <div className={s.calDrillHeader}>
                  <div className={s.calDrillTitle}>
                    {d.toLocaleDateString("en-AU", { weekday:"long", day:"numeric", month:"long" })}
                  </div>
                  <div className={s.calDrillRight}>
                    <span className={s.calDrillTotal} style={{ color: dayColour(dayTotal) }}>{dayTotal.toFixed(1)}h</span>
                    <button className="btn btn-ghost btn-xs" onClick={() => setCalDrillDay(null)}>✕</button>
                  </div>
                </div>
                {dayE.length === 0 ? (
                  <div className={s.calDrillEmpty}>No entries</div>
                ) : dayE.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  return (
                    <div key={entry.id} className={s.calDrillEntry} style={{ borderLeft: `4px solid ${dayColour(entry.hours)}` }}>
                      <div className={s.calDrillHrs} style={{ color: dayColour(entry.hours) }}>{entry.hours.toFixed(1)}h</div>
                      <div className={s.calDrillBody}>
                        <div className={s.calDrillWorker}>{entry.worker}</div>
                        {job && <div className={s.calDrillJob}>{job.title}</div>}
                        {entry.description && <div className={s.calDrillDesc}>{entry.description}</div>}
                      </div>
                      <div className={s.calDrillActions}>
                        {canEditEntry(entry) && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(entry)}><Icon name="edit" size={12} /></button>}
                        {canDeleteEntry(entry) && <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>}
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


export default memo(TimeTracking);
