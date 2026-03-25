import { useState, useEffect, useRef, memo } from "react";
import { createScheduleEntry, updateScheduleEntry, deleteScheduleEntry } from '../lib/db';
import { useAppStore } from '../lib/store';
import { SECTION_COLORS, ViewField, TEAM } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import { AvatarGroup, SectionDrawer } from '../components/shared';
import { getTodayStr, getTimezone } from '../utils/timezone';
import { fmtDate } from '../utils/helpers';
import s from './Schedule.module.css';

const Schedule = () => {
  const { schedule, setSchedule, futureSchedule, setFutureSchedule, jobs, clients, staff } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [schedMode, setSchedMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", date: getTodayStr(), assignedTo: [], notes: "" });
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grouped");
  const dragEntryRef = useRef(null);
  const [showFutureModal, setShowFutureModal] = useState(false);
  const [editFutureEntry, setEditFutureEntry] = useState(null);
  const [futureMode, setFutureMode] = useState("edit");
  const [futureForm, setFutureForm] = useState({ jobId: "", weekStart: "", title: "", assignedTo: [], notes: "" });
  const dragFutureRef = useRef(null);

  const [weather, setWeather] = useState({});
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const tz = encodeURIComponent(getTimezone());
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=-30.2963&longitude=153.1157&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=${tz}&forecast_days=14`);
        const data = await res.json();
        if (data.daily) {
          const w = {};
          data.daily.time.forEach((date, i) => {
            w[date] = {
              maxTemp: data.daily.temperature_2m_max[i],
              minTemp: data.daily.temperature_2m_min[i],
              rain: data.daily.precipitation_sum[i],
              rainChance: data.daily.precipitation_probability_max[i],
            };
          });
          setWeather(w);
        }
      } catch (err) { console.error("Weather fetch failed:", err); }
    };
    fetchWeather();
  }, []);

  const today = getTodayStr();
  const sorted = [...schedule].sort((a, b) => a.date > b.date ? 1 : -1);
  const displayed = sorted.filter(e => {
    const matchDate = !filterDate || e.date === filterDate;
    if (!matchDate) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const job = jobs.find(j => j.id === e.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    const site = job?.siteId ? (client?.sites || []).find(st => st.id === job.siteId) : null;
    return (job?.title || "").toLowerCase().includes(q) ||
      (client?.name || "").toLowerCase().includes(q) ||
      (e.notes || "").toLowerCase().includes(q) ||
      (e.assignedTo || []).some(n => n.toLowerCase().includes(q)) ||
      (site?.name || "").toLowerCase().includes(q) ||
      (site?.address || "").toLowerCase().includes(q) ||
      (client?.address || "").toLowerCase().includes(q);
  });

  const openNew = () => {
    setEditEntry(null);
    setSchedMode("edit");
    setForm({ jobId: jobs[0]?.id || "", date: today, assignedTo: [], notes: "" });
    setShowModal(true);
  };
  const openEdit = (entry) => {
    setEditEntry(entry);
    setSchedMode("view");
    setForm({ jobId: entry.jobId, date: entry.date, assignedTo: entry.assignedTo || [], notes: entry.notes || "" });
    setShowModal(true);
  };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editEntry) {
        const saved = await updateScheduleEntry(editEntry.id, data);
        setSchedule(prev => prev.map(e => e.id === editEntry.id ? saved : e));
      } else {
        const saved = await createScheduleEntry(data);
        setSchedule(prev => [...prev, saved]);
      }
    } catch (err) { console.error('Failed to save schedule entry:', err); }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteScheduleEntry(id);
      setSchedule(prev => prev.filter(e => e.id !== id));
    } catch (err) { console.error('Failed to delete schedule entry:', err); }
  };

  const grouped = displayed.reduce((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc; }, {});

  // Week helpers for kanban view
  const getMonday = (d) => { const dt = new Date(d + "T12:00:00"); const day = dt.getDay(); const diff = day === 0 ? -6 : 1 - day; dt.setDate(dt.getDate() + diff); return dt.toISOString().slice(0, 10); };
  const todayMon = getMonday(today);
  const nextMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const weekDays = (mon) => Array.from({ length: 7 }, (_, i) => { const d = new Date(mon + "T12:00:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const thisWeekDays = weekDays(todayMon);
  const nextWeekDays = weekDays(nextMon);
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const accent = SECTION_COLORS.schedule.accent;

  const handleDrop = async (dateStr, e) => {
    e.preventDefault();
    // Clear all drag-over highlights
    document.querySelectorAll(".schedule-day-col.drag-over").forEach(el => el.classList.remove("drag-over"));
    const entryId = dragEntryRef.current;
    if (!entryId) return;
    const entry = schedule.find(x => x.id === entryId);
    dragEntryRef.current = null;
    if (!entry || entry.date === dateStr) return;
    // Update locally first for instant feedback
    const movedEntry = { ...entry, date: dateStr };
    setSchedule(prev => prev.map(x => x.id === entry.id ? movedEntry : x));
    try {
      const saved = await updateScheduleEntry(entry.id, movedEntry);
      setSchedule(prev => prev.map(x => x.id === entry.id ? saved : x));
    } catch (err) { console.error('Failed to persist schedule move:', err); }
  };

  const DayCol = ({ dateStr, dayName, allEntries, isCompact }) => {
    const d = new Date(dateStr + "T12:00:00");
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    const isWeekend = dayName === "Sat" || dayName === "Sun";
    const dayEntries = allEntries.filter(e => e.date === dateStr);
    const counterRef = useRef(0);
    const w = weather[dateStr];
    return (
      <div className={`schedule-day-col${isCompact ? " schedule-day-compact" : ""}`}
        style={{ background: isToday ? "#ecfeff" : isWeekend ? "#fafafa" : "#fff", borderColor: isToday ? accent : "#e5e5e5" }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDragEnter={e => { e.preventDefault(); counterRef.current++; e.currentTarget.classList.add("drag-over"); }}
        onDragLeave={e => { counterRef.current--; if (counterRef.current <= 0) { counterRef.current = 0; e.currentTarget.classList.remove("drag-over"); } }}
        onDrop={e => { counterRef.current = 0; handleDrop(dateStr, e); }}
      >
        <div className="schedule-day-header" style={{ background: isToday ? accent : isPast ? "#e0e0e0" : "#f5f5f5", color: isToday ? "#fff" : isPast ? "#999" : "#333", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <div className={s.dayHeaderContent}>
            <span className={s.dayName}>{dayName}</span>
            <span className={isCompact ? s.dayDateCompact : s.dayDateFull}>{d.getDate()}</span>
          </div>
          {w && !isCompact && (
            <div className={s.weatherFull} style={{ color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#bbb" : "#666" }}>
              <span className={s.weatherTemp} title="Temperature">{Math.round(w.minTemp)}–{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span title="Chance of rain" style={{ color: isToday ? "rgba(255,255,255,0.85)" : w.rainChance >= 50 ? "#2563eb" : "#888" }}>💧{w.rainChance}%{w.rain > 0 ? ` ${w.rain}mm` : ""}</span>}
            </div>
          )}
          {w && isCompact && (
            <div className={s.weatherCompact} style={{ color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#bbb" : "#666" }}>
              <span>{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span>💧{w.rainChance}%</span>}
            </div>
          )}
        </div>
        <div className="schedule-day-body">
          {dayEntries.length === 0 && <div className={isCompact ? s.emptyDayCompact : s.emptyDayFull}>—</div>}
          {dayEntries.map(entry => {
            const job = jobs.find(j => j.id === entry.jobId);
            const client = clients.find(c => c.id === job?.clientId);
            return (
              <div key={entry.id} className="schedule-card"
                draggable="true"
                onDragStart={e => {
                  dragEntryRef.current = entry.id;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", entry.id);
                  requestAnimationFrame(() => e.target.classList.add("dragging"));
                }}
                onDragEnd={e => { dragEntryRef.current = null; e.target.classList.remove("dragging"); document.querySelectorAll(".schedule-day-col.drag-over").forEach(el => el.classList.remove("drag-over")); }}
                onClick={() => { if (!dragEntryRef.current) openEdit(entry); }}
                style={{ borderLeft: `3px solid ${isPast ? "#ddd" : accent}` }}>
                <div className={s.cardTitle}>{entry.title || job?.title || "Unknown"}</div>
                {client && <div className={s.cardClient}>{client.name}</div>}
                {entry.startTime && <div className={s.cardTime}>{entry.startTime}{entry.endTime ? `–${entry.endTime}` : ""}</div>}
                {(entry.assignedTo || []).length > 0 && (
                  <div className={s.cardAvatars}><AvatarGroup names={entry.assignedTo} max={2} /></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const WeekRow = ({ label, days, entries: allEntries }) => {
    const weekdays = days.slice(0, 5);
    const weekend = days.slice(5);
    return (
      <div className={s.weekRow}>
        <div className={s.weekLabel}>{label}</div>
        <div className="schedule-week-grid">
          {weekdays.map((dateStr, i) => (
            <DayCol key={dateStr} dateStr={dateStr} dayName={DAY_NAMES[i]} allEntries={allEntries} />
          ))}
          <div className="schedule-weekend-stack">
            {weekend.map((dateStr, i) => (
              <DayCol key={dateStr} dateStr={dateStr} dayName={DAY_NAMES[5 + i]} allEntries={allEntries} isCompact />
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Future schedule (weeks 3–8 from current Monday) ──
  const futureWeeks = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(todayMon + "T12:00:00");
    d.setDate(d.getDate() + (i + 2) * 7);
    return d.toISOString().slice(0, 10);
  });

  // Auto-clean: filter out future entries whose weekStart is now this/next week
  const activeFuture = (futureSchedule || []).filter(e => e.weekStart >= futureWeeks[0]);

  const openFutureNew = (weekStart) => {
    setEditFutureEntry(null);
    setFutureMode("edit");
    setFutureForm({ jobId: jobs[0]?.id || "", weekStart, title: "", assignedTo: [], notes: "" });
    setShowFutureModal(true);
  };
  const openFutureEdit = (entry) => {
    setEditFutureEntry(entry);
    setFutureMode("view");
    setFutureForm({ jobId: entry.jobId, weekStart: entry.weekStart, title: entry.title || "", assignedTo: entry.assignedTo || [], notes: entry.notes || "" });
    setShowFutureModal(true);
  };
  const saveFuture = () => {
    const data = { ...futureForm };
    if (editFutureEntry) {
      setFutureSchedule(fs => fs.map(e => e.id === editFutureEntry.id ? { ...editFutureEntry, ...data } : e));
    } else {
      const newId = Math.max(0, ...(futureSchedule || []).map(e => e.id)) + 1;
      setFutureSchedule(fs => [...fs, { id: newId, ...data }]);
    }
    setShowFutureModal(false);
  };
  const delFuture = (id) => {
    setFutureSchedule(fs => fs.filter(e => e.id !== id));
  };

  const formatWeekLabel = (mon) => {
    const d = new Date(mon + "T12:00:00");
    const end = new Date(d); end.setDate(end.getDate() + 6);
    const mShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()} ${mShort[d.getMonth()]} – ${end.getDate()} ${mShort[end.getMonth()]}`;
  };

  return (
    <div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, team..." />
        </div>
        <input type="date" className="form-control" style={{ width: "auto" }} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        {filterDate && <button className={`btn btn-ghost btn-sm ${s.clearFilterBtn}`} onClick={() => setFilterDate("")}>Clear</button>}
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grouped" ? "" : "btn-ghost"}`} style={view === "grouped" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("grouped")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: accent }} onClick={openNew}><Icon name="plus" size={14} />Schedule Job</button></div>
      </div>

      {displayed.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No schedule entries{filterDate ? " for this date" : ""}</div></div>
      )}

      {view === "list" && displayed.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Job</th><th>Client</th><th>Assigned</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {displayed.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  return (
                    <tr key={entry.id} onClick={() => openEdit(entry)} className={s.cursorPointer}>
                      <td className={s.dateCell}>{fmtDate(entry.date)}</td>
                      <td>{job?.title || "Unknown Job"}</td>
                      <td className={s.clientCell}>{client?.name || "—"}</td>
                      <td>{(entry.assignedTo || []).length > 0 ? <AvatarGroup names={entry.assignedTo} max={3} /> : "—"}</td>
                      <td className={s.notesCell}>{entry.notes || "—"}</td>
                      <td onClick={e => e.stopPropagation()}><button className={`btn btn-ghost btn-xs ${s.deleteColor}`} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grouped" && (
        <>
          <WeekRow label="This Week" days={thisWeekDays} entries={displayed} />
          <WeekRow label="Next Week" days={nextWeekDays} entries={displayed} />

          {/* Future Schedule — 6 weeks */}
          <div className={s.futureSection}>
            <div className={s.weekLabel}>Future Schedule</div>
            <div className={s.futureGrid}>
              {futureWeeks.map(weekMon => {
                const weekEntries = activeFuture.filter(e => e.weekStart === weekMon);
                const counterRef = { current: 0 };
                return (
                  <div key={weekMon} className={`future-week-col ${s.futureWeekCol}`}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDragEnter={e => { e.preventDefault(); counterRef.current++; e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}33`; }}
                    onDragLeave={e => { counterRef.current--; if (counterRef.current <= 0) { counterRef.current = 0; e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.boxShadow = "none"; } }}
                    onDrop={e => { e.preventDefault(); counterRef.current = 0; e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.boxShadow = "none"; const entryId = dragFutureRef.current; dragFutureRef.current = null; if (!entryId) return; setFutureSchedule(fs => fs.map(x => x.id === entryId ? { ...x, weekStart: weekMon } : x)); }}
                  >
                    <div className={s.futureWeekHeader}>
                      <div>
                        <div className={s.futureWeekOfLabel}>Week of</div>
                        <div className={s.futureWeekDate}>{formatWeekLabel(weekMon)}</div>
                      </div>
                      <button className={`btn btn-ghost btn-xs ${s.futureAddBtn}`} onClick={() => openFutureNew(weekMon)}>
                        <Icon name="plus" size={11} />
                      </button>
                    </div>
                    <div className={s.futureWeekBody}>
                      {weekEntries.length === 0 && <div className={s.futureEmptyState}>No plans yet</div>}
                      {weekEntries.map(entry => {
                        const job = jobs.find(j => j.id === entry.jobId);
                        const client = clients.find(c => c.id === job?.clientId);
                        return (
                          <div key={entry.id}
                            draggable="true"
                            onDragStart={e => { dragFutureRef.current = entry.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(entry.id)); requestAnimationFrame(() => e.target.style.opacity = "0.4"); }}
                            onDragEnd={e => { dragFutureRef.current = null; e.target.style.opacity = "1"; document.querySelectorAll('.future-week-col').forEach(el => { el.style.borderColor = "#e5e5e5"; el.style.boxShadow = "none"; }); }}
                            className={s.futureCard}
                            style={{ borderLeft: `3px solid ${accent}` }}
                            onClick={() => { if (!dragFutureRef.current) openFutureEdit(entry); }}>
                            <div className={s.cardTitle}>{entry.title || job?.title || "Unknown"}</div>
                            {client && <div className={s.cardClient}>{client.name}</div>}
                            {(entry.assignedTo || []).length > 0 && (
                              <div className={s.futureCardAvatars}><AvatarGroup names={entry.assignedTo} max={3} /></div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {showModal && (() => {
        const schedJobName = jobs.find(j => String(j.id) === String(form.jobId))?.title || "Unknown Job";
        const isNewSched = !editEntry;
        return (
        <SectionDrawer
          accent={SECTION_COLORS.schedule.accent}
          icon={<Icon name="schedule" size={16} />}
          typeLabel="Schedule"
          title={editEntry ? `${fmtDate(form.date)} · ${schedJobName}` : "Schedule a Job"}
          mode={schedMode} setMode={setSchedMode}
          showToggle={!isNewSched}
          isNew={isNewSched}
          footer={schedMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.schedule.accent, color: "#fff", border: "none" }} onClick={() => setSchedMode("edit")}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editEntry ? setSchedMode("view") : setShowModal(false)}>{editEntry ? "Cancel" : "Cancel"}</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.schedule.accent, color: "#fff", border: "none" }} onClick={() => { save(); if (editEntry) setSchedMode("view"); }} disabled={!form.jobId || !form.date}>
              <Icon name="check" size={13} /> {isNewSched ? "Add to Schedule" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {schedMode === "view" ? (
            <div className={s.drawerBody}>
              <ViewField label="Job" value={schedJobName} />
              <ViewField label="Date" value={fmtDate(form.date)} />
              {(form.assignedTo || []).length > 0 && (
                <div className={s.viewAssignedBlock}>
                  <div className={s.viewAssignedLabel}>Assigned To</div>
                  <div className={s.chipWrap}>
                    {form.assignedTo.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {form.notes && <ViewField label="Notes" value={form.notes} />}
            </div>
          ) : (
          <div className={s.drawerBody}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Job *</label>
                <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned To</label>
              <div className="multi-select">
                {(staff && staff.length > 0 ? staff.map(st => st.name) : TEAM).map(t => (
                  <span key={t} className={`multi-option ${form.assignedTo.includes(t) ? "selected" : ""}`}
                    onClick={() => setForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Access instructions, special requirements..." />
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}

      {showFutureModal && (() => {
        const futJobName = jobs.find(j => String(j.id) === String(futureForm.jobId))?.title || "Unknown Job";
        const isNewFuture = !editFutureEntry;
        return (
        <SectionDrawer
          accent={accent}
          icon={<Icon name="schedule" size={16} />}
          typeLabel="Future Plan"
          title={editFutureEntry ? `${futureForm.title || futJobName}` : "Plan Future Week"}
          mode={futureMode} setMode={setFutureMode}
          showToggle={!isNewFuture}
          isNew={isNewFuture}
          footer={futureMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowFutureModal(false)}>Close</button>
            <div className={s.futureFooterActions}>
              <button className="btn btn-ghost btn-sm" style={{ color: "#c00" }} onClick={() => { delFuture(editFutureEntry.id); setShowFutureModal(false); }}>
                <Icon name="trash" size={13} /> Delete
              </button>
              <button className="btn btn-sm" style={{ background: accent, color: "#fff", border: "none" }} onClick={() => setFutureMode("edit")}>
                <Icon name="edit" size={13} /> Edit
              </button>
            </div>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editFutureEntry ? setFutureMode("view") : setShowFutureModal(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: accent, color: "#fff", border: "none" }} onClick={() => { saveFuture(); if (editFutureEntry) setFutureMode("view"); }} disabled={!futureForm.jobId}>
              <Icon name="check" size={13} /> {isNewFuture ? "Add Plan" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowFutureModal(false)}
        >
          {futureMode === "view" ? (
            <div className={s.drawerBody}>
              <ViewField label="Job" value={futJobName} />
              <ViewField label="Week" value={formatWeekLabel(futureForm.weekStart)} />
              {futureForm.title && <ViewField label="Title" value={futureForm.title} />}
              {(futureForm.assignedTo || []).length > 0 && (
                <div className={s.viewAssignedBlock}>
                  <div className={s.viewAssignedLabel}>Assigned To</div>
                  <div className={s.chipWrap}>
                    {futureForm.assignedTo.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {futureForm.notes && <ViewField label="Notes" value={futureForm.notes} />}
            </div>
          ) : (
          <div className={s.drawerBody}>
            <div className="form-group">
              <label className="form-label">Job *</label>
              <select className="form-control" value={futureForm.jobId} onChange={e => setFutureForm(f => ({ ...f, jobId: e.target.value }))}>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-control" value={futureForm.title} onChange={e => setFutureForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Painting & Touch-ups" />
            </div>
            <div className="form-group">
              <label className="form-label">Week</label>
              <select className="form-control" value={futureForm.weekStart} onChange={e => setFutureForm(f => ({ ...f, weekStart: e.target.value }))}>
                {futureWeeks.map(w => <option key={w} value={w}>{formatWeekLabel(w)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned To</label>
              <div className="multi-select">
                {(staff && staff.length > 0 ? staff.map(st => st.name) : TEAM).map(t => (
                  <span key={t} className={`multi-option ${futureForm.assignedTo.includes(t) ? "selected" : ""}`}
                    onClick={() => setFutureForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={futureForm.notes} onChange={e => setFutureForm(f => ({ ...f, notes: e.target.value }))} placeholder="Planning notes, requirements..." />
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}
    </div>
  );
};

export default memo(Schedule);
