import { useState, useMemo } from "react";
import { useAppStore } from '../lib/store';
import s from './CallLog.module.css';

const CallLog = ({ onNav }) => {
  const { callLog } = useAppStore();
  const [search, setSearch] = useState("");
  const [filterDir, setFilterDir] = useState("all");
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

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const filtered = useMemo(() => {
    let list = [...callLog];
    if (filterDir !== "all") list = list.filter(c => c.direction === filterDir);
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
  }, [callLog, filterDir, filterStatus, search, sortField, sortDir]);

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

  return (
    <div className={s.wrapper}>
      <div className={s.filterBar}>
        <div className={s.searchWrapper}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={s.searchIcon}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search calls..." className={s.searchInput} />
        </div>
        <select value={filterDir} onChange={e => setFilterDir(e.target.value)} className={s.selectInput}>
          <option value="all">All Directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={s.selectInput}>
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="no_answer">No Answer</option>
        </select>
        <div className={s.filterCount}>{filtered.length} call{filtered.length !== 1 ? "s" : ""}</div>
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
