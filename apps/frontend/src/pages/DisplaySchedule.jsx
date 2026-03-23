import { useState, useEffect } from "react";
import { useAppStore } from '../lib/store';
import { getTodayStr, getTimezone } from '../utils/timezone';
import s from './DisplaySchedule.module.css';

// ── Display Dashboard Constants ──
const ACCENT = "#0891b2";

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
  const today = getTodayStr();
  const allDays = (mon) => Array.from({ length: 7 }, (_, i) => { const d = new Date(mon + "T12:00:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const todayMon = displayGetMonday(today);
  const nextMon = (() => { const d = new Date(todayMon + "T12:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const thisWeekAll = allDays(todayMon);
  const nextWeekAll = allDays(nextMon);
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
    const headerBg = isToday ? ACCENT : isPast ? "#e0e0e0" : isWeekend ? "#f8f8f8" : "#f5f5f5";
    const headerColor = isToday ? "#fff" : isPast ? "#bbb" : "#333";
    const w = weather[dateStr];
    const weatherColor = isToday ? "rgba(255,255,255,0.85)" : isPast ? "#ccc" : "#666";
    return (
      <div
        className={isCompact ? s.dayColCompact : s.dayCol}
        style={{
          background: isToday ? "#ecfeff" : isPast ? "#fafafa" : isWeekend ? "#fafafa" : "#fff",
          border: `1px solid ${isToday ? ACCENT : "#e5e5e5"}`,
          opacity: isPast ? 0.7 : 1,
        }}
      >
        <div
          className={`${s.dayHeader} ${isCompact ? s.dayHeaderCompact : isLarge ? s.dayHeaderLarge : s.dayHeaderDefault}`}
          style={{ background: headerBg }}
        >
          <div className={isCompact ? s.dayHeaderInfoCompact : s.dayHeaderInfo}>
            <span className={isCompact ? s.dayNameDefault : isLarge ? s.dayNameLarge : s.dayNameDefault} style={{ color: headerColor }}>{DAY_NAMES[d.getDay()]}</span>
            <span className={isCompact ? s.dayNumberCompact : isLarge ? s.dayNumberLarge : s.dayNumberDefault} style={{ color: headerColor }}>{d.getDate()}</span>
          </div>
          {w && !isCompact ? (
            <div className={`${s.weatherInfo} ${isLarge ? s.weatherInfoLarge : s.weatherInfoDefault}`} style={{ color: weatherColor }}>
              <span className={s.weatherTemp}>{Math.round(w.minTemp)}–{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span style={{ color: isToday ? "rgba(255,255,255,0.85)" : w.rainChance >= 50 ? "#2563eb" : "#888" }}>💧{w.rainChance}%{w.rain > 0 ? ` ${w.rain}mm` : ""}</span>}
            </div>
          ) : w && isCompact ? (
            <div className={`${s.weatherInfo} ${s.weatherInfoCompact}`} style={{ color: weatherColor }}>
              <span>{Math.round(w.maxTemp)}°</span>
              {w.rainChance > 0 && <span>💧{w.rainChance}%</span>}
            </div>
          ) : (
            <span className={isCompact ? s.monthLabelCompact : isLarge ? s.monthLabelLarge : s.monthLabelDefault} style={{ color: isToday ? "rgba(255,255,255,0.7)" : isPast ? "#ccc" : "#aaa" }}>{MONTH_SHORT[d.getMonth()]}</span>
          )}
        </div>
        <div className={`${s.dayEntries} ${isCompact ? s.dayEntriesCompact : isLarge ? s.dayEntriesLarge : s.dayEntriesDefault}`}>
          {dayEntries.length === 0 ? (
            <div className={isCompact ? s.emptyDayCompact : isLarge ? s.emptyDayLarge : s.emptyDayDefault} style={{ color: isPast ? "#ddd" : "#ccc" }}>—</div>
          ) : (
            dayEntries.map(entry => {
              const job = jobs.find(j => j.id === entry.jobId);
              const client = clients.find(c => c.id === job?.clientId);
              const title = client ? `${client.name} – ${job?.title || entry.title}` : (job?.title || entry.title || "Untitled");
              return (
                <div
                  key={entry.id}
                  className={isCompact ? s.entryCardCompact : s.entryCard}
                  style={{
                    background: isPast ? "#fafafa" : "#fff",
                    border: `1px solid ${isPast ? "#f0f0f0" : "#e8e8e8"}`,
                    padding: isCompact ? "4px 6px" : isLarge ? "10px 12px" : "6px 8px",
                    borderLeft: `3px solid ${isPast ? "#ddd" : ACCENT}`,
                  }}
                >
                  <div className={isCompact ? s.entryTitleCompact : isLarge ? s.entryTitleLarge : s.entryTitleDefault} style={{ color: isPast ? "#bbb" : "#333" }}>{title}</div>
                  {entry.startTime && !isCompact && <div className={isLarge ? s.entryTimeLarge : s.entryTimeDefault} style={{ color: isPast ? "#ccc" : "#aaa" }}>{entry.startTime}{entry.endTime ? `–${entry.endTime}` : ""}</div>}
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
      <div className={s.weekContainer} style={{ flex }}>
        <div className={s.weekHeader}>
          <span className={isLarge ? s.weekLabelLarge : s.weekLabelSmall}>{label}</span>
        </div>
        <div className={s.weekGrid}>
          {weekdays.map(dateStr => (
            <DayCol key={dateStr} dateStr={dateStr} isLarge={isLarge} />
          ))}
          <div className={s.weekendCol}>
            {weekend.map(dateStr => (
              <DayCol key={dateStr} dateStr={dateStr} isLarge={isLarge} isCompact />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={s.root}>
      {renderWeek("This Week", thisWeekAll, 2)}
      {renderWeek("Next Week", nextWeekAll, 1)}
    </div>
  );
};

export default DisplaySchedule;
