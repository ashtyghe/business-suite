import { useState, useEffect } from "react";
import { useAppStore } from '../lib/store';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import s from './DisplayOverview.module.css';

// ── Display Dashboard Constants ──
const accent = "#0891b2";

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

  return (
    <div className={s.root}>
      {/* Row 1: Deliver, Priorities, Quotes */}
      <div className={s.card} style={{ borderTop: `3px solid ${SECTION_COLORS.schedule.accent}` }}>
        <div className={s.heading}>Deliver This Week</div>
        {deliverJobs.length === 0 ? <div className={s.emptyText}>No deliveries scheduled</div> :
          <ol className={s.orderedList}>
            {deliverJobs.map(j => <li key={j.id}>{j.title}</li>)}
          </ol>
        }
      </div>
      <div className={s.card} style={{ borderTop: `3px solid ${SECTION_COLORS.jobs.accent}` }}>
        <div className={s.heading}>Priorities</div>
        {priorities.length === 0 ? <div className={s.emptyText}>No high-priority jobs</div> :
          <ol className={s.orderedList}>
            {priorities.map(j => <li key={j.id}>{j.title}</li>)}
          </ol>
        }
      </div>
      <div className={s.card} style={{ borderTop: `3px solid ${SECTION_COLORS.quotes.accent}` }}>
        <div className={s.heading}>Quotes</div>
        {openQuotes.length === 0 ? <div className={s.emptyText}>No open quotes</div> :
          <ol className={s.orderedList}>
            {openQuotes.map(q => {
              const job = jobs.find(j => j.id === q.jobId);
              return <li key={q.id}>{job?.title || q.number}</li>;
            })}
          </ol>
        }
      </div>

      {/* Row 2: Hours (spans 2 cols), Targets */}
      <div className={`${s.card} ${s.hoursSpan2}`} style={{ borderTop: `3px solid ${SECTION_COLORS.time.accent}` }}>
        <div className={s.hoursHeader}>
          <div className={s.headingNoMargin}>Hours</div>
          <div className={s.legend}>
            <span><span style={{ color: accent }}>■</span> Actual</span>
            <span><span style={{ color: "#ccc" }}>●</span> Average</span>
          </div>
        </div>
        {/* Bar chart */}
        <div className={s.chartContainer}>
          {/* Y-axis labels */}
          {[0, 25, 50, 75, 100, 125].map(v => (
            <div key={v} className={s.yAxisLabel} style={{ bottom: `calc(${(v / 125) * 100}% * 0.85 + 30px)` }}>{v}</div>
          ))}
          {/* Grid lines */}
          {[0, 25, 50, 75, 100, 125].map(v => (
            <div key={v} className={s.gridLine} style={{ bottom: `calc(${(v / 125) * 100}% * 0.85 + 30px)` }} />
          ))}
          {/* Bars */}
          <div className={s.barsContainer}>
            {weeksData.map((w, i) => {
              const barPct = (w.hours / 125) * 100;
              return (
                <div key={i} className={s.barColumn}>
                  <div className={s.barLabel}>{w.hours > 0 ? w.hours : ""}</div>
                  <div className={s.bar} style={{ height: `${barPct}%`, background: accent }} />
                </div>
              );
            })}
          </div>
          {/* Average line */}
          <div className={s.averageLine} style={{ bottom: `calc(${(avgHours / 125) * 100}% * 0.85 + 30px)` }} />
          {/* X-axis labels */}
          <div className={s.xAxisContainer}>
            {weeksData.map((w, i) => (
              <div key={i} className={s.xAxisLabel}>{w.label}</div>
            ))}
          </div>
        </div>
      </div>

      <div className={s.card} style={{ borderTop: `3px solid ${SECTION_COLORS.invoices.accent}` }}>
        <div className={s.targetsHeading}>Targets</div>
        <div className={s.targetsBody}>
          {/* Last Week */}
          <div>
            <div className={s.targetGroupLabel}>Last Week</div>
            <div className={s.targetRow}>
              <div className={s.targetBar} style={{ width: `${Math.min((lastWeekHours / weeklyTarget) * 100, 100)}%`, background: accent }} />
              <span className={s.targetValue}>{lastWeekHours}</span>
            </div>
            <div className={s.targetRowLast}>
              <div className={s.targetBarBg} />
              <span className={s.targetLabel}>{weeklyTarget}</span>
            </div>
          </div>
          {/* Last Month */}
          <div>
            <div className={s.targetGroupLabel}>Last Month</div>
            <div className={s.targetRow}>
              <div className={s.targetBar} style={{ width: `${Math.min((lastMonthHours / monthlyTarget) * 100, 100)}%`, background: accent }} />
              <span className={s.targetValue}>{lastMonthHours}</span>
            </div>
            <div className={s.targetRowLast}>
              <div className={s.targetBarBg} />
              <span className={s.targetLabel}>{monthlyTarget}</span>
            </div>
          </div>
        </div>
        <div className={s.targetsLegend}>
          <span><span style={{ color: accent }}>■</span> Actual</span>
          <span><span style={{ color: "#e5e5e5" }}>■</span> Target</span>
        </div>
      </div>
    </div>
  );
};

export default DisplayOverview;
