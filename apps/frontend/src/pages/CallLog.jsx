import { useState, useMemo } from "react";
import { useAppStore } from '../lib/store';

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
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
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
  const statusColor = (s) => s === "completed" ? "#059669" : s === "missed" ? "#dc2626" : "#f59e0b";
  const dirIcon = (dir) => dir === "inbound" ? "↙" : "↗";
  const dirColor = (dir) => dir === "inbound" ? "#2563eb" : "#7c3aed";
  const actionTypeIcon = { reminder: "🔔", note: "📝", schedule: "📅", quote: "📄", task: "✅", confirmation: "✓" };

  const selectStyle = { padding: "7px 10px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: 13, background: "#fff", color: "#333", fontFamily: "'Open Sans', sans-serif", minWidth: 120 };

  return (
    <div style={{ padding: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search calls..." style={{ ...selectStyle, width: "100%", paddingLeft: 32 }} />
        </div>
        <select value={filterDir} onChange={e => setFilterDir(e.target.value)} style={selectStyle}>
          <option value="all">All Directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="no_answer">No Answer</option>
        </select>
        <div style={{ fontSize: 12, color: "#888" }}>{filtered.length} call{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 140px 100px 90px 90px", padding: "10px 14px", background: "#f9fafb", borderBottom: "2px solid #e5e5e5", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555" }}></div>
          <div onClick={() => toggleSort("name")} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none" }}>Contact{sortIcon("name")}</div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555" }}>Phone</div>
          <div onClick={() => toggleSort("date")} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none" }}>Date{sortIcon("date")}</div>
          <div onClick={() => toggleSort("duration")} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none" }}>Duration{sortIcon("duration")}</div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", textAlign: "center" }}>Status</div>
        </div>
        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>No calls found</div>
        ) : filtered.map(call => (
          <div key={call.id}>
            <div
              onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
              style={{ display: "grid", gridTemplateColumns: "40px 1fr 140px 100px 90px 90px", padding: "12px 14px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", gap: 8, alignItems: "center", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
              onMouseLeave={e => e.currentTarget.style.background = expandedId === call.id ? "#f9fafb" : ""}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: dirColor(call.direction) }}>{dirIcon(call.direction)}</span>
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{call.from || call.to}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{call.direction === "inbound" ? "Inbound" : "Outbound"}{call.actions?.length ? ` · ${call.actions.length} action${call.actions.length > 1 ? "s" : ""}` : ""}</div>
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>{call.phone}</div>
              <div>
                <div style={{ fontSize: 12, color: "#333" }}>{formatDate(call.date)}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{formatTime(call.date)}</div>
              </div>
              <div style={{ fontSize: 13, color: "#333", fontVariantNumeric: "tabular-nums" }}>{formatDuration(call.duration)}</div>
              <div style={{ textAlign: "center" }}>
                <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: statusColor(call.status) + "18", color: statusColor(call.status) }}>{statusLabel[call.status] || call.status}</span>
              </div>
            </div>
            {/* Expanded actions */}
            {expandedId === call.id && call.actions?.length > 0 && (
              <div style={{ padding: "0 14px 14px 54px", background: "#f9fafb", borderBottom: "1px solid #e5e5e5" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888", marginBottom: 8 }}>Actions from this call</div>
                {call.actions.map((a, i) => (
                  <div key={i}
                    onClick={a.link ? (e) => { e.stopPropagation(); onNav && onNav(a.link.page); } : undefined}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", margin: "0 -10px", borderRadius: 6, borderBottom: i < call.actions.length - 1 ? "1px solid #eee" : "none", cursor: a.link ? "pointer" : "default", transition: "background 0.15s" }}
                    onMouseEnter={e => { if (a.link) e.currentTarget.style.background = "#eef2ff"; }}
                    onMouseLeave={e => { if (a.link) e.currentTarget.style.background = ""; }}
                  >
                    <span style={{ fontSize: 14, minWidth: 20, textAlign: "center" }}>{actionTypeIcon[a.type] || "•"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: a.link ? "#2563eb" : "#333" }}>{a.description}</div>
                    </div>
                    {a.link && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>}
                    <div style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>{a.time}</div>
                  </div>
                ))}
              </div>
            )}
            {expandedId === call.id && (!call.actions || call.actions.length === 0) && (
              <div style={{ padding: "12px 14px 12px 54px", background: "#f9fafb", borderBottom: "1px solid #e5e5e5", fontSize: 13, color: "#999", fontStyle: "italic" }}>No actions recorded for this call</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CallLog;
