import { useState, useMemo } from "react";
import { useAppStore } from '../lib/store';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import { getTimezone } from '../utils/timezone';
import s from './CallLog.module.css';

const CallLog = ({ onNav }) => {
  const { callLog, sectionView, setSectionView } = useAppStore();
  const view = sectionView === "kanban" ? "list" : sectionView;
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedId, setExpandedId] = useState(null);

  const formatDuration = (secs) => {
    if (!secs) return "0:00";
    const m = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const tz = getTimezone();
  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: tz });
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz });
  };

  const filtered = useMemo(() => {
    let list = [...callLog];
    if (filterStatus !== "all") list = list.filter(c => c.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.from || c.to || "").toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.actions || []).some(a => a.description.toLowerCase().includes(q)) || (c.notes || "").toLowerCase().includes(q) || (c.summary || "").toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let va, vb;
      if (sortField === "date") { va = a.date; vb = b.date; }
      else if (sortField === "name") { va = (a.from || a.to || "").toLowerCase(); vb = (b.from || b.to || "").toLowerCase(); }
      else if (sortField === "duration") { va = a.duration; vb = b.duration; }
      else { va = a.date; vb = b.date; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [callLog, filterStatus, search, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };
  const sortIcon = (field) => sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const statusLabel = { completed: "Completed", missed: "Missed", no_answer: "No Answer" };
  const statusColor = (st) => st === "completed" ? "#059669" : st === "missed" ? "#dc2626" : "#f59e0b";
  const dirIcon = (dir) => dir === "inbound" ? "↙" : "↗";
  const dirColor = (dir) => dir === "inbound" ? "#2563eb" : "#7c3aed";
  const actionTypeIcon = { reminder: "🔔", note: "📝", schedule: "📅", quote: "📄", task: "✅", confirmation: "✓" };

  const accent = SECTION_COLORS.calllog.accent;

  return (
    <div>
      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search calls..." />
        </div>
        <select className={`form-control ${s.filterSelect}`} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="no_answer">No Answer</option>
        </select>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setSectionView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accent, color: '#fff' } : undefined} onClick={() => setSectionView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${sectionView === "kanban" ? "" : "btn-ghost"}`} style={sectionView === "kanban" ? { background: accent, color: '#fff' } : undefined} onClick={() => setSectionView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
      </div>

      <div className={s.tableContainer}>
        {/* Header */}
        <div className={s.tableHeader}>
          <div className={s.colHeader}></div>
          <div onClick={() => toggleSort("name")} className={s.colHeaderSortable}>Contact{sortIcon("name")}</div>
          <div className={s.colHeader}>Phone</div>
          <div onClick={() => toggleSort("date")} className={s.colHeaderSortable}>Date{sortIcon("date")}</div>
          <div onClick={() => toggleSort("duration")} className={s.colHeaderSortable}>Duration{sortIcon("duration")}</div>
          <div className={s.colHeaderCenter}>Status</div>
        </div>
        {/* Rows */}
        {filtered.length === 0 ? (
          <div className={s.emptyState}>No calls found</div>
        ) : filtered.map(call => (
          <div key={call.id}>
            <div
              onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
              className={s.row}
              onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
              onMouseLeave={e => e.currentTarget.style.background = expandedId === call.id ? "#f9fafb" : ""}
            >
              <div className={s.dirCell}>
                <span className={s.dirIcon} style={{ color: dirColor(call.direction) }}>{dirIcon(call.direction)}</span>
              </div>
              <div>
                <div className={s.contactName}>{call.from || call.to}</div>
                <div className={s.contactSub}>{call.direction === "inbound" ? "Inbound" : "Outbound"}{call.actions?.length ? ` · ${call.actions.length} action${call.actions.length > 1 ? "s" : ""}` : ""}</div>
              </div>
              <div className={s.phoneCell}>{call.phone}</div>
              <div>
                <div className={s.dateText}>{formatDate(call.date)}</div>
                <div className={s.timeText}>{formatTime(call.date)}</div>
              </div>
              <div className={s.durationCell}>{formatDuration(call.duration)}</div>
              <div className={s.statusCell}>
                <span className={s.statusBadge} style={{ background: statusColor(call.status) + "18", color: statusColor(call.status) }}>{statusLabel[call.status] || call.status}</span>
              </div>
            </div>
            {/* Expanded actions */}
            {expandedId === call.id && call.actions?.length > 0 && (
              <div className={s.expandedPanel}>
                <div className={s.expandedTitle}>Actions from this call</div>
                {call.actions.map((a, i) => (
                  <div key={i}
                    onClick={a.link ? (e) => { e.stopPropagation(); onNav && onNav(a.link.page); } : undefined}
                    className={s.actionRow}
                    style={{ borderBottom: i < call.actions.length - 1 ? "1px solid #eee" : "none", cursor: a.link ? "pointer" : "default" }}
                    onMouseEnter={e => { if (a.link) e.currentTarget.style.background = "#eef2ff"; }}
                    onMouseLeave={e => { if (a.link) e.currentTarget.style.background = ""; }}
                  >
                    <span className={s.actionIcon}>{actionTypeIcon[a.type] || "•"}</span>
                    <div className={s.actionContent}>
                      <div className={a.link ? s.actionDescLink : s.actionDesc}>{a.description}</div>
                    </div>
                    {a.link && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={s.actionChevron}><polyline points="9 18 15 12 9 6"/></svg>}
                    <div className={s.actionTime}>{a.time}</div>
                  </div>
                ))}
              </div>
            )}
            {expandedId === call.id && (!call.actions || call.actions.length === 0) && (
              <div className={s.emptyActions}>No actions recorded for this call</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CallLog;
