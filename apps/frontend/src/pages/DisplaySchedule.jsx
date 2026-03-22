import { useState, useEffect } from "react";
import { useAppStore } from '../lib/store';

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
  return syd; // returns YYYY-MM-DD
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

const DisplaySchedule = () => {
  const { schedule, jobs, clients } = useAppStore();
  useDisplayRefresh(30000);
  const today = sydneyToday();
  const allDays = (mon) => Array.from({ length: 7 }, (_, i) => { const d = new Date(mon + "T12:00:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const todayMon = displayGetMonday(today);
  const nextMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const thisWeekAll = allDays(todayMon);
  const nextWeekAll = allDays(nextMon);
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const accent = DS.accent;

  // Weather data for Coffs Harbour NSW
  const [weather, setWeather] = useState({});
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=-30.2963&longitude=153.1157&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Australia%2FSydney&forecast_days=14");
        const data = await res.json();
        if (data.daily) {
          const w = {};
          data.daily.time.forEach((date, i) => {
            w[date] = { maxTemp: data.daily.temperature_2m_max[i], minTemp: data.daily.temperature_2m_min[i], rain: data.daily.precipitation_sum[i], rainChance: data.daily.precipitation_probability_max[i] };
          });
          setWeather(w);
        }
      } catch (err) { console.error("Weather fetch failed:", err); }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const DayCol = ({ dateStr, isLarge, isCompact }) => {
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    const d = new Date(dateStr + "T12:00:00");
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const dayEntries = schedule.filter(e => e.date === dateStr);
    const headerBg = isToday ? accent : isPast ? "#e0e0e0" : isWeekend ? "#f8f8f8" : "#f5f5f5";
    const headerColor = isToday ? "#fff" : isPast ? "#bbb" : "#333";
    const w = weather[dateStr];
    return (
      <div style={{ flex: isCompact ? undefined : 1, background: isToday ? "#ecfeff" : isPast ? "#fafafa" : isWeekend ? "#fafafa" : "#fff", border: `1px solid ${isToday ? accent : "#e5e5e5"}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", opacity: isPast ? 0.7 : 1 }}>
        <div style={{ background: headerBg, padding: isCompact ? "6px 10px" : isLarge ? "10px 16px" : "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: isCompact ? "row" : "column", alignItems: isCompact ? "center" : "flex-start", gap: isCompact ? 8 : 0 }}>
            <span style={{ fontSize: isCompact ? 11 : isLarge ? 14 : 11, fontWeight: 700, textTransform: "uppercase", color: headerColor }}>{DAY_NAMES[d.getDay()]}</span>
            <span style={{ fontSize: isCompact ? 14 : isLarge ? 25 : 18, fontWeight: 800, lineHeight: 1, color: headerColor }}>{d.getDate()}</span>
          </div>
          {w && !isCompact ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, fontSize: isLarge ? 13 : 11, color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#ccc" : "#666" }}>
              <span style={{ fontWeight: 600 }}>{Math.round(w.minTemp)}–{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span style={{ color: isToday ? "rgba(255,255,255,0.85)" : w.rainChance >= 50 ? "#2563eb" : "#888" }}>💧{w.rainChance}%{w.rain > 0 ? ` ${w.rain}mm` : ""}</span>}
            </div>
          ) : w && isCompact ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0, fontSize: 9, color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#ccc" : "#666" }}>
              <span>{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span>💧{w.rainChance}%</span>}
            </div>
          ) : (
            <span style={{ fontSize: isCompact ? 10 : isLarge ? 14 : 11, color: isToday ? "rgba(255,255,255,0.7)" : isPast ? "#ccc" : "#aaa", fontWeight: 400 }}>{MONTH_SHORT[d.getMonth()]}</span>
          )}
        </div>
        <div style={{ padding: isCompact ? "4px 8px" : isLarge ? "12px 14px" : "8px 10px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: isCompact ? 4 : 8 }}>
          {dayEntries.length === 0 ? (
            <div style={{ fontSize: isCompact ? 11 : isLarge ? 16 : 13, color: isPast ? "#ddd" : "#ccc", textAlign: "center", padding: isCompact ? "4px 0" : "12px 0" }}>—</div>
          ) : (
            dayEntries.map(entry => {
              const job = jobs.find(j => j.id === entry.jobId);
              const client = clients.find(c => c.id === job?.clientId);
              const title = client ? `${client.name} – ${job?.title || entry.title}` : (job?.title || entry.title || "Untitled");
              return (
                <div key={entry.id} style={{ background: isPast ? "#fafafa" : "#fff", border: `1px solid ${isPast ? "#f0f0f0" : "#e8e8e8"}`, borderRadius: isCompact ? 6 : 8, padding: isCompact ? "4px 6px" : isLarge ? "10px 12px" : "6px 8px", borderLeft: `3px solid ${isPast ? "#ddd" : accent}` }}>
                  <div style={{ fontWeight: 700, fontSize: isCompact ? 11 : isLarge ? 16 : 13, lineHeight: 1.4, color: isPast ? "#bbb" : "#333" }}>{title}</div>
                  {entry.startTime && !isCompact && <div style={{ fontSize: isLarge ? 13 : 11, color: isPast ? "#ccc" : "#aaa", marginTop: 2 }}>{entry.startTime}{entry.endTime ? `–${entry.endTime}` : ""}</div>}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderWeek = (label, days, flex) => {
    const isLarge = flex >= 2;
    const weekdays = days.slice(0, 5);
    const weekend = days.slice(5);
    return (
      <div style={{ flex, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexShrink: 0 }}>
          <span style={{ fontSize: isLarge ? 32 : 25, fontWeight: 700, color: "#111" }}>{label}</span>
        </div>
        <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
          {weekdays.map(dateStr => (
            <DayCol key={dateStr} dateStr={dateStr} isLarge={isLarge} />
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, flex: 1 }}>
            {weekend.map(dateStr => (
              <DayCol key={dateStr} dateStr={dateStr} isLarge={isLarge} isCompact />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ ...DS.root, gap: 20 }}>
      {renderWeek("This Week", thisWeekAll, 2)}
      {renderWeek("Next Week", nextWeekAll, 1)}
    </div>
  );
};

export default DisplaySchedule;
