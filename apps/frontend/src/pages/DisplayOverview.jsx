import { useState, useEffect } from "react";
import { useAppStore } from '../lib/store';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';

// ── Display Dashboard Styles ──
const DS = {
  accent: "#0891b2",
  root: { background: "#fafafa", color: "#111", fontFamily: "'Open Sans', sans-serif", height: "100vh", padding: "28px 36px", boxSizing: "border-box", display: "flex", flexDirection: "column" },
  card: { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" },
  heading: { fontSize: 32, fontWeight: 700, color: "#111" },
};

// Sydney timezone date helper
const sydneyToday = () => {
  const syd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return syd;
};

const displayGetMonday = (d) => {
  const dt = new Date(d + "T12:00:00");
  const day = dt.getDay();
  const diff = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
};

// Auto-refresh hook for display pages
const useDisplayRefresh = (intervalMs = 30000) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
};

const DisplayOverview = () => {
  const { jobs, quotes, timeEntries, schedule, clients } = useAppStore();
  useDisplayRefresh(30000);
  const today = sydneyToday();
  const todayMon = displayGetMonday(today);
  const weekEnd = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() + 4); return d.toISOString().slice(0, 10); })();
  const accent = DS.accent;

  // Deliver This Week — jobs with schedule entries this week
  const thisWeekEntries = schedule.filter(e => e.date >= todayMon && e.date <= weekEnd);
  const deliverJobIds = [...new Set(thisWeekEntries.map(e => e.jobId))];
  const deliverJobs = deliverJobIds.map(id => jobs.find(j => j.id === id)).filter(Boolean);

  // Priorities — high priority active jobs
  const priorities = jobs.filter(j => j.priority === "high" && j.status !== "completed" && j.status !== "cancelled");

  // Quotes — draft or sent
  const openQuotes = quotes.filter(q => q.status === "draft" || q.status === "sent");

  // Hours chart — weekly hours for last 16 weeks
  const weeksData = [];
  for (let w = 15; w >= 0; w--) {
    const wMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() - w * 7); return d.toISOString().slice(0, 10); })();
    const wFri = (() => { const d = new Date(wMon + "T12:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();
    const weekHours = timeEntries.filter(t => t.date >= wMon && t.date <= wFri).reduce((s, t) => s + (t.hours || 0), 0);
    const label = (() => { const d = new Date(wMon + "T12:00:00"); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; })();
    weeksData.push({ label, hours: weekHours });
  }
  const maxHours = Math.max(...weeksData.map(w => w.hours), 1);
  const avgHours = weeksData.reduce((s, w) => s + w.hours, 0) / weeksData.length;

  // Targets — last week & last month actual vs target
  const lastWeekMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();
  const lastWeekFri = (() => { const d = new Date(lastWeekMon + "T12:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();
  const lastWeekHours = timeEntries.filter(t => t.date >= lastWeekMon && t.date <= lastWeekFri).reduce((s, t) => s + (t.hours || 0), 0);
  const weeklyTarget = 95;
  const lastMonthStart = (() => { const d = new Date(today + "T12:00:00"); d.setMonth(d.getMonth() - 1); d.setDate(1); return d.toISOString().slice(0, 10); })();
  const lastMonthEnd = (() => { const d = new Date(today + "T12:00:00"); d.setDate(0); return d.toISOString().slice(0, 10); })();
  const lastMonthHours = timeEntries.filter(t => t.date >= lastMonthStart && t.date <= lastMonthEnd).reduce((s, t) => s + (t.hours || 0), 0);
  const monthlyTarget = 380;

  const cardStyle = (borderColor) => ({ ...DS.card, display: "flex", flexDirection: "column", borderTop: `3px solid ${borderColor}`, padding: "24px 28px" });

  return (
    <div style={{ ...DS.root, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 20 }}>
      {/* Row 1: Deliver, Priorities, Quotes */}
      <div style={cardStyle(SECTION_COLORS.schedule.accent)}>
        <div style={{ ...DS.heading, marginBottom: 16 }}>Deliver This Week</div>
        {deliverJobs.length === 0 ? <div style={{ color: "#aaa", fontSize: 20 }}>No deliveries scheduled</div> :
          <ol style={{ margin: 0, paddingLeft: 30, fontSize: 22, lineHeight: 2.2, color: "#333" }}>
            {deliverJobs.map(j => <li key={j.id}>{j.title}</li>)}
          </ol>
        }
      </div>
      <div style={cardStyle(SECTION_COLORS.jobs.accent)}>
        <div style={{ ...DS.heading, marginBottom: 16 }}>Priorities</div>
        {priorities.length === 0 ? <div style={{ color: "#aaa", fontSize: 20 }}>No high-priority jobs</div> :
          <ol style={{ margin: 0, paddingLeft: 30, fontSize: 22, lineHeight: 2.2, color: "#333" }}>
            {priorities.map(j => <li key={j.id}>{j.title}</li>)}
          </ol>
        }
      </div>
      <div style={cardStyle(SECTION_COLORS.quotes.accent)}>
        <div style={{ ...DS.heading, marginBottom: 16 }}>Quotes</div>
        {openQuotes.length === 0 ? <div style={{ color: "#aaa", fontSize: 20 }}>No open quotes</div> :
          <ol style={{ margin: 0, paddingLeft: 30, fontSize: 22, lineHeight: 2.2, color: "#333" }}>
            {openQuotes.map(q => {
              const job = jobs.find(j => j.id === q.jobId);
              return <li key={q.id}>{job?.title || q.number}</li>;
            })}
          </ol>
        }
      </div>

      {/* Row 2: Hours (spans 2 cols), Targets */}
      <div style={{ ...cardStyle(SECTION_COLORS.time.accent), gridColumn: "1 / 3" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
          <div style={{ ...DS.heading, marginBottom: 0 }}>Hours</div>
          <div style={{ display: "flex", gap: 16, fontSize: 15, color: "#999" }}>
            <span><span style={{ color: accent }}>■</span> Actual</span>
            <span><span style={{ color: "#ccc" }}>●</span> Average</span>
          </div>
        </div>
        {/* Bar chart */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          {/* Y-axis labels */}
          {[0, 25, 50, 75, 100, 125].map(v => (
            <div key={v} style={{ position: "absolute", left: 0, bottom: `calc(${(v / 125) * 100}% * 0.85 + 30px)`, fontSize: 13, color: "#aaa", width: 36, textAlign: "right" }}>{v}</div>
          ))}
          {/* Grid lines */}
          {[0, 25, 50, 75, 100, 125].map(v => (
            <div key={v} style={{ position: "absolute", left: 44, right: 0, bottom: `calc(${(v / 125) * 100}% * 0.85 + 30px)`, height: 1, background: "#f0f0f0" }} />
          ))}
          {/* Bars */}
          <div style={{ position: "absolute", left: 44, right: 0, bottom: 30, top: 0, display: "flex", alignItems: "flex-end", gap: 4 }}>
            {weeksData.map((w, i) => {
              const barPct = (w.hours / 125) * 100;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{w.hours > 0 ? w.hours : ""}</div>
                  <div style={{ width: "70%", height: `${barPct}%`, background: accent, borderRadius: "3px 3px 0 0", opacity: 0.85 }} />
                </div>
              );
            })}
          </div>
          {/* Average line */}
          <div style={{ position: "absolute", left: 44, right: 0, bottom: `calc(${(avgHours / 125) * 100}% * 0.85 + 30px)`, height: 2, borderTop: "2px dashed #ccc", zIndex: 2 }} />
          {/* X-axis labels */}
          <div style={{ position: "absolute", left: 44, right: 0, bottom: 0, display: "flex" }}>
            {weeksData.map((w, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#aaa", transform: "rotate(-45deg)", transformOrigin: "top center", whiteSpace: "nowrap" }}>{w.label}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={cardStyle(SECTION_COLORS.invoices.accent)}>
        <div style={{ ...DS.heading, marginBottom: 24, flexShrink: 0 }}>Targets</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 }}>
          {/* Last Week */}
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 14, color: "#555" }}>Last Week</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: `${Math.min((lastWeekHours / weeklyTarget) * 100, 100)}%`, height: 26, background: accent, borderRadius: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>{lastWeekHours}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: "100%", height: 26, background: "#e5e5e5", borderRadius: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 700, color: "#999", whiteSpace: "nowrap" }}>{weeklyTarget}</span>
            </div>
          </div>
          {/* Last Month */}
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 14, color: "#555" }}>Last Month</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: `${Math.min((lastMonthHours / monthlyTarget) * 100, 100)}%`, height: 26, background: accent, borderRadius: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>{lastMonthHours}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: "100%", height: 26, background: "#e5e5e5", borderRadius: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 700, color: "#999", whiteSpace: "nowrap" }}>{monthlyTarget}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 15, color: "#999", marginTop: 16, flexShrink: 0 }}>
          <span><span style={{ color: accent }}>■</span> Actual</span>
          <span><span style={{ color: "#e5e5e5" }}>■</span> Target</span>
        </div>
      </div>
    </div>
  );
};

export default DisplayOverview;
