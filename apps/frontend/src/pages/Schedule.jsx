import { useState, useEffect, useRef, memo } from "react";
import { createScheduleEntry, updateScheduleEntry, deleteScheduleEntry } from '../lib/db';
import { useAppStore } from '../lib/store';
import { SECTION_COLORS, ViewField, TEAM } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import { AvatarGroup, SectionDrawer } from '../components/shared';

const Schedule = () => {
  const { schedule, setSchedule, futureSchedule, setFutureSchedule, jobs, clients, staff } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [schedMode, setSchedMode] = useState("edit");
  const [form, setForm] = useState({ jobId: "", date: new Date().toISOString().slice(0,10), assignedTo: [], notes: "" });
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grouped");
  const dragEntryRef = useRef(null);
  const [showFutureModal, setShowFutureModal] = useState(false);
  const [editFutureEntry, setEditFutureEntry] = useState(null);
  const [futureMode, setFutureMode] = useState("edit");
  const [futureForm, setFutureForm] = useState({ jobId: "", weekStart: "", title: "", assignedTo: [], notes: "" });
  const dragFutureRef = useRef(null);

  // Weather data for Coffs Harbour NSW (-30.2963, 153.1157)
  const [weather, setWeather] = useState({});
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=-30.2963&longitude=153.1157&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Australia%2FSydney&forecast_days=14");
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

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...schedule].sort((a, b) => a.date > b.date ? 1 : -1);
  const displayed = sorted.filter(e => {
    const matchDate = !filterDate || e.date === filterDate;
    if (!matchDate) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const job = jobs.find(j => j.id === e.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    const site = job?.siteId ? (client?.sites || []).find(s => s.id === job.siteId) : null;
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
  const openEdit = (s) => {
    setEditEntry(s);
    setSchedMode("view");
    setForm({ jobId: s.jobId, date: s.date, assignedTo: s.assignedTo || [], notes: s.notes || "" });
    setShowModal(true);
  };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editEntry) {
        const saved = await updateScheduleEntry(editEntry.id, data);
        setSchedule(s => s.map(e => e.id === editEntry.id ? saved : e));
      } else {
        const saved = await createScheduleEntry(data);
        setSchedule(s => [...s, saved]);
      }
    } catch (err) { console.error('Failed to save schedule entry:', err); }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteScheduleEntry(id);
      setSchedule(s => s.filter(e => e.id !== id));
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
    const entry = schedule.find(s => s.id === entryId);
    dragEntryRef.current = null;
    if (!entry || entry.date === dateStr) return;
    // Update locally first for instant feedback
    const movedEntry = { ...entry, date: dateStr };
    setSchedule(s => s.map(x => x.id === entry.id ? movedEntry : x));
    try {
      const saved = await updateScheduleEntry(entry.id, movedEntry);
      setSchedule(s => s.map(x => x.id === entry.id ? saved : x));
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{dayName}</span>
            <span style={{ fontSize: isCompact ? 13 : 16, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</span>
          </div>
          {w && !isCompact && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, fontSize: 10, color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#bbb" : "#666" }}>
              <span title="Temperature" style={{ fontWeight: 600 }}>{Math.round(w.minTemp)}–{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span title="Chance of rain" style={{ color: isToday ? "rgba(255,255,255,0.85)" : w.rainChance >= 50 ? "#2563eb" : "#888" }}>💧{w.rainChance}%{w.rain > 0 ? ` ${w.rain}mm` : ""}</span>}
            </div>
          )}
          {w && isCompact && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0, fontSize: 9, color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#bbb" : "#666" }}>
              <span>{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span>💧{w.rainChance}%</span>}
            </div>
          )}
        </div>
        <div className="schedule-day-body">
          {dayEntries.length === 0 && <div style={{ fontSize: 11, color: "#ccc", textAlign: "center", padding: isCompact ? "6px 0" : "12px 0" }}>—</div>}
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
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2, lineHeight: 1.3 }}>{entry.title || job?.title || "Unknown"}</div>
                {client && <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{client.name}</div>}
                {entry.startTime && <div style={{ fontSize: 10, color: "#aaa" }}>{entry.startTime}{entry.endTime ? `–${entry.endTime}` : ""}</div>}
                {(entry.assignedTo || []).length > 0 && (
                  <div style={{ marginTop: 4 }}><AvatarGroup names={entry.assignedTo} max={2} /></div>
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
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
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
        {filterDate && <button className="btn btn-ghost btn-sm" onClick={() => setFilterDate("")} style={{ fontSize: 12 }}>Clear</button>}
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
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
                    <tr key={entry.id} onClick={() => openEdit(entry)} style={{ cursor: "pointer" }}>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{entry.date}</td>
                      <td>{job?.title || "Unknown Job"}</td>
                      <td style={{ fontSize: 12, color: "#666" }}>{client?.name || "—"}</td>
                      <td>{(entry.assignedTo || []).length > 0 ? <AvatarGroup names={entry.assignedTo} max={3} /> : "—"}</td>
                      <td style={{ fontSize: 12, color: "#888", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.notes || "—"}</td>
                      <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button></td>
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
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Future Schedule</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {futureWeeks.map(weekMon => {
                const weekEntries = activeFuture.filter(e => e.weekStart === weekMon);
                const counterRef = { current: 0 };
                return (
                  <div key={weekMon} className="future-week-col"
                    style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, minHeight: 160, display: "flex", flexDirection: "column", overflow: "hidden", transition: "border-color 0.15s, box-shadow 0.15s" }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDragEnter={e => { e.preventDefault(); counterRef.current++; e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}33`; }}
                    onDragLeave={e => { counterRef.current--; if (counterRef.current <= 0) { counterRef.current = 0; e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.boxShadow = "none"; } }}
                    onDrop={e => { e.preventDefault(); counterRef.current = 0; e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.boxShadow = "none"; const entryId = dragFutureRef.current; dragFutureRef.current = null; if (!entryId) return; setFutureSchedule(fs => fs.map(x => x.id === entryId ? { ...x, weekStart: weekMon } : x)); }}
                  >
                    <div style={{ background: "#f5f5f5", padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e5e5" }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#888", letterSpacing: "0.04em" }}>Week of</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{formatWeekLabel(weekMon)}</div>
                      </div>
                      <button className="btn btn-ghost btn-xs" style={{ padding: "2px 6px" }} onClick={() => openFutureNew(weekMon)}>
                        <Icon name="plus" size={11} />
                      </button>
                    </div>
                    <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {weekEntries.length === 0 && <div style={{ fontSize: 11, color: "#ccc", textAlign: "center", padding: "16px 0" }}>No plans yet</div>}
                      {weekEntries.map(entry => {
                        const job = jobs.find(j => j.id === entry.jobId);
                        const client = clients.find(c => c.id === job?.clientId);
                        return (
                          <div key={entry.id}
                            draggable="true"
                            onDragStart={e => { dragFutureRef.current = entry.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(entry.id)); requestAnimationFrame(() => e.target.style.opacity = "0.4"); }}
                            onDragEnd={e => { dragFutureRef.current = null; e.target.style.opacity = "1"; document.querySelectorAll('.future-week-col').forEach(el => { el.style.borderColor = "#e5e5e5"; el.style.boxShadow = "none"; }); }}
                            style={{ background: "#f8f8f8", borderRadius: 8, padding: "8px 10px", borderLeft: `3px solid ${accent}`, cursor: "grab" }}
                            onClick={() => { if (!dragFutureRef.current) openFutureEdit(entry); }}>
                            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2, lineHeight: 1.3 }}>{entry.title || job?.title || "Unknown"}</div>
                            {client && <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{client.name}</div>}
                            {(entry.assignedTo || []).length > 0 && (
                              <div style={{ marginTop: 3 }}><AvatarGroup names={entry.assignedTo} max={3} /></div>
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
          title={editEntry ? `${form.date} · ${schedJobName}` : "Schedule a Job"}
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
            <div style={{ padding: "20px 24px" }}>
              <ViewField label="Job" value={schedJobName} />
              <ViewField label="Date" value={form.date} />
              {(form.assignedTo || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>Assigned To</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {form.assignedTo.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {form.notes && <ViewField label="Notes" value={form.notes} />}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
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
                {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
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
            <div style={{ display: "flex", gap: 6 }}>
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
            <div style={{ padding: "20px 24px" }}>
              <ViewField label="Job" value={futJobName} />
              <ViewField label="Week" value={formatWeekLabel(futureForm.weekStart)} />
              {futureForm.title && <ViewField label="Title" value={futureForm.title} />}
              {(futureForm.assignedTo || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>Assigned To</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {futureForm.assignedTo.map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
              )}
              {futureForm.notes && <ViewField label="Notes" value={futureForm.notes} />}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
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
                {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
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
