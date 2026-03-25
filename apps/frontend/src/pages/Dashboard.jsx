import { useState, useEffect, useRef, Fragment } from "react";
import { useAppStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { updateScheduleEntry } from '../lib/db';
import { fmt, fmtDate, calcQuoteTotal, daysUntil, getContractorComplianceCount } from '../utils/helpers';
import { getTodayStr } from '../utils/timezone';
import { Icon } from '../components/Icon';
import { SectionLabel, StatusBadge, AvatarGroup } from '../components/shared';
import { SECTION_COLORS, ORDER_STATUS_COLORS } from '../fixtures/seedData.jsx';
import s from './Dashboard.module.css';

const Dashboard = ({ onNav }) => {
  const { jobs, clients, quotes, invoices, bills, timeEntries, schedule, setSchedule, workOrders, purchaseOrders, contractors, suppliers } = useAppStore();
  // ── Financial KPIs ──
  const totalQuoted = quotes.filter(q => q.status !== "declined").reduce((s, q) => s + calcQuoteTotal(q), 0);
  const revenueCollected = invoices.filter(i => i.status === "paid").reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const outstandingInv = invoices.filter(i => ["sent", "overdue"].includes(i.status)).reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const outstandingInvCount = invoices.filter(i => ["sent", "overdue"].includes(i.status)).length;
  const unpostedBills = bills.filter(b => ["inbox", "linked", "approved"].includes(b.status));
  const unpostedBillsTotal = unpostedBills.reduce((s, b) => s + b.amount, 0);

  // ── Section counts & metrics ──
  const activeJobs = jobs.filter(j => j.status === "in_progress").length;
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const overdueJobs = jobs.filter(j => j.dueDate && daysUntil(j.dueDate) < 0 && j.status !== "completed" && j.status !== "cancelled");
  const activeWOs = workOrders.filter(wo => !["Cancelled", "Billed", "Completed"].includes(wo.status)).length;
  const overdueWOs = workOrders.filter(wo => wo.dueDate && daysUntil(wo.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(wo.status)).length;
  const woAwaitingAcceptance = workOrders.filter(wo => wo.status === "Sent").length;
  const activePOs = purchaseOrders.filter(po => !["Cancelled", "Billed", "Completed"].includes(po.status)).length;
  const overduePOs = purchaseOrders.filter(po => po.dueDate && daysUntil(po.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(po.status)).length;
  const totalHours = timeEntries.reduce((s, t) => s + t.hours, 0);
  const billableHours = timeEntries.filter(t => t.billable).reduce((s, t) => s + t.hours, 0);
  const billableRatio = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;
  const pipelineQuotes = quotes.filter(q => ["draft", "sent"].includes(q.status));
  const pipelineTotal = pipelineQuotes.reduce((s, q) => s + calcQuoteTotal(q), 0);
  const quoteDrafts = quotes.filter(q => q.status === "draft").length;
  const todayStr = getTodayStr();
  const dashDragRef = useRef(null);
  const dashHandleDrop = async (dateStr, e) => {
    e.preventDefault();
    document.querySelectorAll(".schedule-day-col.drag-over").forEach(el => el.classList.remove("drag-over"));
    const entryId = dashDragRef.current;
    if (!entryId) return;
    const entry = schedule.find(x => x.id === entryId);
    dashDragRef.current = null;
    if (!entry || entry.date === dateStr) return;
    const movedEntry = { ...entry, date: dateStr };
    setSchedule(prev => prev.map(x => x.id === entry.id ? movedEntry : x));
    try {
      const saved = await updateScheduleEntry(entry.id, movedEntry);
      setSchedule(prev => prev.map(x => x.id === entry.id ? saved : x));
    } catch (err) { console.error('Failed to persist schedule move:', err); }
  };
  const startOfWeek = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const endOfWeek = (() => { const d = new Date(startOfWeek); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();

  // ── Profit margin ──
  const totalBillsCost = bills.reduce((s, b) => s + b.amount, 0);
  const totalInvoiced = invoices.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const margin = totalInvoiced > 0 ? Math.round(((totalInvoiced - totalBillsCost) / totalInvoiced) * 100) : 0;

  // ── New Row 2 KPIs ──
  const jobsDueThisWeek = jobs.filter(j => j.dueDate && j.dueDate >= todayStr && j.dueDate <= endOfWeek && j.status !== "completed" && j.status !== "cancelled");
  const jobsToBill = jobs.filter(j => j.status === "completed" && !invoices.some(inv => inv.jobId === j.id));
  const unpaidInvoices = invoices.filter(i => ["sent", "overdue"].includes(i.status));

  // ── Lists ──
  const upcomingSchedule = [...schedule].filter(s => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  const todaySchedule = schedule.filter(s => s.date === todayStr);
  const recentBills = [...bills].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  const recentTime = [...timeEntries].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 4);
  const workerHours = Object.entries(
    timeEntries.reduce((acc, t) => {
      if (!acc[t.worker]) acc[t.worker] = { total: 0, billable: 0 };
      acc[t.worker].total += t.hours;
      if (t.billable) acc[t.worker].billable += t.hours;
      return acc;
    }, {})
  ).sort((a, b) => b[1].total - a[1].total);

  // ── Action items (things needing attention) ──
  const actionItems = [];
  if (overdueJobs.length > 0) actionItems.push({ label: `${overdueJobs.length} overdue job${overdueJobs.length > 1 ? "s" : ""}`, color: "#dc2626", section: "jobs", icon: "jobs" });
  if (quoteDrafts > 0) actionItems.push({ label: `${quoteDrafts} draft quote${quoteDrafts > 1 ? "s" : ""} to send`, color: SECTION_COLORS.quotes.accent, section: "quotes", icon: "quotes" });
  if (overdueWOs > 0) actionItems.push({ label: `${overdueWOs} overdue work order${overdueWOs > 1 ? "s" : ""}`, color: "#dc2626", section: "orders", icon: "orders" });
  if (woAwaitingAcceptance > 0) actionItems.push({ label: `${woAwaitingAcceptance} WO${woAwaitingAcceptance > 1 ? "s" : ""} awaiting acceptance`, color: SECTION_COLORS.wo.accent, section: "orders", icon: "orders" });
  const inboxBills = bills.filter(b => b.status === "inbox").length;
  if (inboxBills > 0) actionItems.push({ label: `${inboxBills} bill${inboxBills > 1 ? "s" : ""} in inbox to link`, color: SECTION_COLORS.bills.accent, section: "bills", icon: "bills" });
  if (outstandingInvCount > 0) actionItems.push({ label: `${outstandingInvCount} outstanding invoice${outstandingInvCount > 1 ? "s" : ""}`, color: "#dc2626", section: "invoices", icon: "invoices" });

  const jobStatusLabels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed" };
  const jobStatusColors = { draft: "#888", scheduled: "#0891b2", quoted: "#7c3aed", in_progress: "#ea580c", completed: "#16a34a" };
  const billStatusColors = { inbox: "#888", linked: "#2563eb", approved: "#059669", posted: "#111" };
  const billStatusLabels = { inbox: "Inbox", linked: "Linked", approved: "Approved", posted: "Posted" };

  // ── Weather ──
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

  // ── AI Business Insight + Chat ──
  const [aiInsight, setAiInsight] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const aiChatEndRef = useRef(null);

  const getKpiData = () => ({
    totalQuoted, revenueCollected, outstandingInv, outstandingInvCount,
    unpostedBills: unpostedBills.length, unpostedBillsTotal,
    activeJobs, completedJobs, overdueJobs: overdueJobs.length,
    activeWOs, overdueWOs, woAwaitingAcceptance, activePOs, overduePOs,
    totalHours, billableHours, billableRatio, margin,
    pipelineTotal, quoteDrafts, todayScheduleCount: todaySchedule.length,
    contractorComplianceIssues: contractors.reduce((sum, c) => sum + getContractorComplianceCount(c), 0),
    actionItemsCount: actionItems.length,
    actionItemsSummary: actionItems.map(a => a.label).join(", "),
  });

  const generateInsight = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      if (!supabase) throw new Error("Supabase not configured — add VITE_SUPABASE_URL to enable AI insights");
      const { data, error } = await supabase.functions.invoke("ai-insight", {
        body: { kpis: getKpiData() },
      });
      if (error) {
        const msg = typeof error === "object" && error.context
          ? await error.context.text?.() || error.message
          : error.message;
        throw new Error(msg || "AI insight failed");
      }
      const result = typeof data === "string" ? JSON.parse(data) : data;
      const insight = result?.insight || "No insight generated.";
      setAiInsight(insight);
      setAiChatMessages([{ role: "assistant", content: insight }]);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const sendChatMessage = async () => {
    const question = aiChatInput.trim();
    if (!question || aiChatLoading) return;
    setAiChatInput("");
    setAiChatLoading(true);
    const updatedMessages = [...aiChatMessages, { role: "user", content: question }];
    setAiChatMessages(updatedMessages);
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { data, error } = await supabase.functions.invoke("ai-insight", {
        body: { kpis: getKpiData(), messages: aiChatMessages, question },
      });
      if (error) {
        const msg = typeof error === "object" && error.context
          ? await error.context.text?.() || error.message
          : error.message;
        throw new Error(msg || "AI chat failed");
      }
      const result = typeof data === "string" ? JSON.parse(data) : data;
      setAiChatMessages([...updatedMessages, { role: "assistant", content: result?.reply || "No response." }]);
    } catch (err) {
      setAiChatMessages([...updatedMessages, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setAiChatLoading(false);
    }
  };

  useEffect(() => { if (aiChatEndRef.current) aiChatEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [aiChatMessages]);
  useEffect(() => { generateInsight(); }, []);

  return (
    <div>
      {/* ── AI Business Insight + Chat ── */}
      {(() => {
        const parseInsightCards = (text) => text ? text.split(/\n/).filter(l => l.trim()).reduce((cards, line) => {
          const trimmed = line.trim();
          const bulletMatch = trimmed.match(/^[•\-\*]\s*\*?\*?(.+?)\*?\*?:\s*(.+)/) || trimmed.match(/^[•\-\*]\s*\*?\*?(.+?)\*?\*?\s*[—–-]\s*(.+)/) || trimmed.match(/^\d+\.\s*\*?\*?(.+?)\*?\*?:\s*(.+)/);
          if (bulletMatch) {
            cards.push({ heading: bulletMatch[1].replace(/\*+/g, "").trim(), detail: bulletMatch[2].replace(/\*+/g, "").trim() });
          } else if (trimmed.match(/^[•\-\*\d]/)) {
            const clean = trimmed.replace(/^[•\-\*\d.]+\s*/, "").replace(/\*+/g, "");
            const colonSplit = clean.indexOf(":") > 0 && clean.indexOf(":") < 60 ? [clean.slice(0, clean.indexOf(":")), clean.slice(clean.indexOf(":") + 1)] : null;
            if (colonSplit) cards.push({ heading: colonSplit[0].trim(), detail: colonSplit[1].trim() });
            else cards.push({ heading: clean.length > 60 ? clean.slice(0, 60) + "..." : clean, detail: clean.length > 60 ? clean : "" });
          }
          return cards;
        }, []) : [];

        const insightCards = parseInsightCards(aiInsight);
        const suggestedQuestions = [
          "How can I improve cash flow?",
          "Which jobs need attention?",
          "Break down my margins",
          "What should I focus on this week?",
        ];

        return (
          <div className={s.aiPanel}>
            <div onClick={() => setAiExpanded(e => !e)} className={s.aiHeader}>
              <div className={s.aiHeaderLeft}>
                <span className={s.aiTitle}>Business Insights</span>
                {insightCards.length > 0 && !aiExpanded && <span className={s.aiInsightCount}>{insightCards.length} insights</span>}
              </div>
              <div className={s.aiHeaderRight}>
                <button onClick={e => { e.stopPropagation(); generateInsight(); }} disabled={aiLoading} className={s.aiRefreshBtn}>
                  {aiLoading ? "Analysing..." : "Refresh"}
                </button>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" className={`${s.chevron} ${aiExpanded ? s.chevronExpanded : ""}`}><polyline points="5 8 10 13 15 8"/></svg>
              </div>
            </div>
            {aiExpanded && (
              <div className={s.aiExpandBody}>
                {aiLoading && !aiInsight && <div className={s.aiLoadingText}>Analysing your business data...</div>}
                {aiError && <div className={s.aiErrorText}>Failed to generate insight: {aiError}</div>}
                {insightCards.length > 0 && !aiLoading && (
                  <div className={s.aiCardsGrid}>
                    {insightCards.map((card, i) => (
                      <div key={i} className={s.aiCard}>
                        <div className={s.aiCardHeading}>{card.heading}</div>
                        {card.detail && <div className={s.aiCardDetail}>{card.detail}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {!aiLoading && !aiError && aiInsight && insightCards.length === 0 && (
                  <div className={s.aiInsightFallback}>{aiInsight}</div>
                )}
                {aiInsight && (
                  <div className={s.aiChatSection}>
                    {aiChatMessages.length > 1 && (
                      <div className={s.aiChatScroll}>
                        {aiChatMessages.slice(1).map((msg, i) => (
                          <div key={i} className={`${s.aiChatRow} ${msg.role === "user" ? s.aiChatRowUser : s.aiChatRowAssistant}`}>
                            <div className={`${s.aiChatBubble} ${msg.role === "user" ? s.aiChatBubbleUser : s.aiChatBubbleAssistant}`}>
                              {msg.role === "assistant" && <div className={s.aiChatLabel}>Analyst</div>}
                              <div className={msg.role === "user" ? s.aiChatTextUser : s.aiChatTextAssistant}>{msg.content}</div>
                            </div>
                          </div>
                        ))}
                        {aiChatLoading && (
                          <div className={`${s.aiChatRow} ${s.aiChatRowAssistant}`}>
                            <div className={`${s.aiChatBubble} ${s.aiChatBubbleAssistant}`}>
                              <div className={s.aiThinking}>Thinking...</div>
                            </div>
                          </div>
                        )}
                        <div ref={aiChatEndRef} />
                      </div>
                    )}
                    {aiChatMessages.length <= 1 && (
                      <div className={s.aiSuggestedWrap}>
                        {suggestedQuestions.map((q, i) => (
                          <button key={i} onClick={() => { setAiChatInput(q); }} className={s.aiSuggestBtn}>{q}</button>
                        ))}
                      </div>
                    )}
                    <div className={s.aiInputRow}>
                      <input
                        type="text"
                        value={aiChatInput}
                        onChange={e => setAiChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                        placeholder="Ask a follow-up question..."
                        className={s.aiInput}
                      />
                      <button
                        onClick={sendChatMessage}
                        disabled={!aiChatInput.trim() || aiChatLoading}
                        className={`${s.aiSendBtn} ${aiChatInput.trim() && !aiChatLoading ? s.aiSendBtnActive : s.aiSendBtnDisabled}`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={aiChatInput.trim() && !aiChatLoading ? "#fff" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ROW 1: Two wide tiles — Timesheets + Profitability ── */}
      <div className={`stat-grid ${s.heroGrid}`}>
        {/* Timesheets */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.time.accent}` }} onClick={() => onNav("time")}>
          <div className={s.statHeaderRow}><Icon name="time" size={13} /><div className="stat-label">Timesheets</div></div>
          <div className={s.heroRow}>
            <div className={s.heroBig}>
              <span className="stat-value">{totalHours}h</span>
              <span className={s.heroSub}>total</span>
            </div>
            <div className={s.heroMeta}>
              <div className={s.heroMetaRow}><span className={s.heroMetaLabel}>Billable</span><span className={s.heroMetaValue}>{billableHours}h</span></div>
              <div className={s.heroMetaRow}><span className={s.heroMetaLabel}>Non-billable</span><span className={s.heroMetaValue}>{totalHours - billableHours}h</span></div>
              <div className={s.heroMetaRow}><span className={s.heroMetaLabel}>Billable %</span><span className={s.heroMetaValue} style={{ color: billableRatio >= 80 ? "#16a34a" : billableRatio >= 50 ? "#d97706" : "#dc2626" }}>{billableRatio}%</span></div>
            </div>
          </div>
          {/* Team utilisation bars */}
          {workerHours.slice(0, 4).map(([name, hrs]) => {
            const ratio = hrs.total > 0 ? (hrs.billable / hrs.total) * 100 : 0;
            return (
              <div key={name} className={s.workerRowMini}>
                <div className={s.workerRowMiniHeader}>
                  <span className={s.workerRowMiniName}>
                    <span className={s.workerAvatarSm}>{name.split(" ").map(n => n[0]).join("")}</span>
                    {name}
                  </span>
                  <span className={s.workerRowMiniHours}>{hrs.total}h</span>
                </div>
                <div className={s.thinProgressTrack}>
                  <div className={s.thinProgressFill} style={{ width: `${ratio}%`, background: ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : SECTION_COLORS.time.accent }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Profitability */}
        <div className="stat-card" style={{ borderTop: `3px solid ${margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626"}` }} onClick={() => onNav("jobs")}>
          <div className={s.statHeaderRow}><Icon name="jobs" size={13} /><div className="stat-label">Profitability</div></div>
          <div className={s.heroRow}>
            <div className={s.heroBig}>
              <span className="stat-value" style={{ color: margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626" }}>{margin}%</span>
              <span className={s.heroSub}>margin</span>
            </div>
            <div className={s.heroMeta}>
              <div className={s.heroMetaRow}><span className={s.heroMetaLabel}>Revenue</span><span className={s.heroMetaValue}>{fmt(totalInvoiced)}</span></div>
              <div className={s.heroMetaRow}><span className={s.heroMetaLabel}>Costs</span><span className={s.heroMetaValue}>{fmt(totalBillsCost)}</span></div>
              <div className={s.heroMetaRow}><span className={s.heroMetaLabel}>Profit</span><span className={s.heroMetaValue} style={{ color: margin >= 20 ? "#16a34a" : "#d97706" }}>{fmt(totalInvoiced - totalBillsCost)}</span></div>
            </div>
          </div>
          {/* Top job margins */}
          {jobs.slice(0, 3).map(job => {
            const jobInvoices = invoices.filter(inv => inv.jobId === job.id);
            const jobBills = bills.filter(b => b.jobId === job.id);
            const invoiced = jobInvoices.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
            const costs = jobBills.reduce((s, b) => s + b.amount, 0);
            const jobMargin = invoiced > 0 ? Math.round(((invoiced - costs) / invoiced) * 100) : null;
            if (jobMargin === null) return null;
            const costPct = invoiced > 0 ? Math.min(100, Math.round((costs / invoiced) * 100)) : 0;
            return (
              <div key={job.id} className={s.profitRowMini}>
                <div className={s.profitRowMiniHeader}>
                  <span className={s.profitRowMiniTitle}>{job.title}</span>
                  <span style={{ color: jobMargin >= 20 ? "#16a34a" : jobMargin >= 0 ? "#d97706" : "#dc2626", fontWeight: 700, fontSize: 11 }}>{jobMargin}%</span>
                </div>
                <div className={s.thinProgressTrack}>
                  <div className={s.thinProgressFill} style={{ width: `${costPct}%`, background: costPct > 90 ? "#dc2626" : costPct > 70 ? "#d97706" : "#16a34a" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ROW 2: Four action tiles ── */}
      <div className={`stat-grid ${s.opsGrid}`}>
        {/* Overdue Jobs */}
        <div className="stat-card" style={{ borderTop: `3px solid ${overdueJobs.length > 0 ? "#dc2626" : "#e5e5e5"}` }} onClick={() => onNav("jobs")}>
          <div className={s.statHeaderRow}><Icon name="jobs" size={13} /><div className="stat-label">Overdue Jobs</div></div>
          <div className="stat-value" style={{ color: overdueJobs.length > 0 ? "#dc2626" : undefined }}>{overdueJobs.length}</div>
          {overdueJobs.length > 0 ? (
            <div className={s.tileList}>
              {overdueJobs.slice(0, 3).map(j => (
                <div key={j.id} className={s.tileListItem}><span className={s.tileListTitle}>{j.title}</span><span className={s.tileListSub}>Due {fmtDate(j.dueDate)}</span></div>
              ))}
              {overdueJobs.length > 3 && <div className={s.tileListMore}>+{overdueJobs.length - 3} more</div>}
            </div>
          ) : <div className="stat-sub" style={{ color: "#16a34a" }}>All on track ✓</div>}
        </div>

        {/* Jobs Due This Week */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.jobs.accent}` }} onClick={() => onNav("jobs")}>
          <div className={s.statHeaderRow}><Icon name="jobs" size={13} /><div className="stat-label">Due This Week</div></div>
          <div className="stat-value">{jobsDueThisWeek.length}</div>
          {jobsDueThisWeek.length > 0 ? (
            <div className={s.tileList}>
              {jobsDueThisWeek.slice(0, 3).map(j => (
                <div key={j.id} className={s.tileListItem}><span className={s.tileListTitle}>{j.title}</span><span className={s.tileListSub}>{fmtDate(j.dueDate)}</span></div>
              ))}
              {jobsDueThisWeek.length > 3 && <div className={s.tileListMore}>+{jobsDueThisWeek.length - 3} more</div>}
            </div>
          ) : <div className="stat-sub">No jobs due this week</div>}
        </div>

        {/* Jobs To Bill */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.invoices.accent}` }} onClick={() => onNav("invoices")}>
          <div className={s.statHeaderRow}><Icon name="invoices" size={13} /><div className="stat-label">Jobs To Bill</div></div>
          <div className="stat-value">{jobsToBill.length}</div>
          {jobsToBill.length > 0 ? (
            <div className={s.tileList}>
              {jobsToBill.slice(0, 3).map(j => (
                <div key={j.id} className={s.tileListItem}><span className={s.tileListTitle}>{j.title}</span><span className={s.tileListSub}>Completed — no invoice</span></div>
              ))}
              {jobsToBill.length > 3 && <div className={s.tileListMore}>+{jobsToBill.length - 3} more</div>}
            </div>
          ) : <div className="stat-sub">All billed ✓</div>}
        </div>

        {/* Unpaid Invoices */}
        <div className="stat-card" style={{ borderTop: `3px solid ${unpaidInvoices.length > 0 ? "#dc2626" : "#e5e5e5"}` }} onClick={() => onNav("invoices")}>
          <div className={s.statHeaderRow}><Icon name="invoices" size={13} /><div className="stat-label">Unpaid Invoices</div></div>
          <div className="stat-value" style={{ color: unpaidInvoices.length > 0 ? "#dc2626" : undefined }}>{fmt(outstandingInv)}</div>
          <div className="stat-sub">{unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? "s" : ""} outstanding</div>
          {unpaidInvoices.length > 0 && (
            <div className={s.tileList}>
              {unpaidInvoices.slice(0, 3).map(inv => {
                const job = jobs.find(j => j.id === inv.jobId);
                return <div key={inv.id} className={s.tileListItem}><span className={s.tileListTitle}>{inv.number}</span><span className={s.tileListSub}>{fmt(calcQuoteTotal(inv))}</span></div>;
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: This Week Schedule with Weather ── */}
      {(() => {
        const schAccent = SECTION_COLORS.schedule.accent;
        const getMonday = (d) => { const dt = new Date(d + "T12:00:00"); const day = dt.getDay(); const diff = day === 0 ? -6 : 1 - day; dt.setDate(dt.getDate() + diff); return dt.toISOString().slice(0, 10); };
        const mon = getMonday(todayStr);
        const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon + "T12:00:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const weekdays = weekDays.slice(0, 5);
        const weekend = weekDays.slice(5);
        const weekEntries = schedule.filter(s => s.date >= weekDays[0] && s.date <= weekDays[6]);
        const thisWeekTotal = weekEntries.length;

        const DashDayCol = ({ dateStr, dayName, isCompact }) => {
          const d = new Date(dateStr + "T12:00:00");
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          const isWeekend = dayName === "Sat" || dayName === "Sun";
          const dayEntries = weekEntries.filter(e => e.date === dateStr);
          const counterRef = useRef(0);
          const w = weather[dateStr];
          return (
            <div className={`schedule-day-col${isCompact ? " schedule-day-compact" : ""}`}
              style={{ background: isToday ? "#ecfeff" : isWeekend ? "#fafafa" : "#fff", borderColor: isToday ? schAccent : "#e5e5e5" }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDragEnter={e => { e.preventDefault(); counterRef.current++; e.currentTarget.classList.add("drag-over"); }}
              onDragLeave={e => { counterRef.current--; if (counterRef.current <= 0) { counterRef.current = 0; e.currentTarget.classList.remove("drag-over"); } }}
              onDrop={e => { counterRef.current = 0; dashHandleDrop(dateStr, e); }}
            >
              <div className="schedule-day-header" style={{ background: isToday ? schAccent : isPast ? "#e0e0e0" : "#f5f5f5", color: isToday ? "#fff" : isPast ? "#999" : "#333", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <div className={s.dayHeaderContent}>
                  <span className={s.dayHeaderLabel}>{dayName}</span>
                  <span className={isCompact ? s.dayHeaderDateCompact : s.dayHeaderDateFull}>{d.getDate()}</span>
                </div>
                {w && !isCompact && (
                  <div className={s.weatherFull} style={{ color: isToday ? "rgba(255,255,255,0.85)" : isPast ? "#bbb" : "#666" }}>
                    <span className={s.weatherTemp}>{Math.round(w.minTemp)}–{Math.round(w.maxTemp)}°</span>
                    {w.rainChance > 0 && <span style={{ color: isToday ? "rgba(255,255,255,0.85)" : w.rainChance >= 50 ? "#2563eb" : "#888" }}>💧{w.rainChance}%{w.rain > 0 ? ` ${w.rain}mm` : ""}</span>}
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
                {dayEntries.length === 0 && <div className={`${s.emptyDay} ${isCompact ? s.emptyDayCompact : s.emptyDayFull}`}>—</div>}
                {dayEntries.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  const client = clients.find(c => c.id === job?.clientId);
                  return (
                    <div key={entry.id} className="schedule-card"
                      draggable="true"
                      onDragStart={e => {
                        dashDragRef.current = entry.id;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", entry.id);
                        requestAnimationFrame(() => e.target.classList.add("dragging"));
                      }}
                      onDragEnd={e => { dashDragRef.current = null; e.target.classList.remove("dragging"); document.querySelectorAll(".schedule-day-col.drag-over").forEach(el => el.classList.remove("drag-over")); }}
                      style={{ borderLeft: `3px solid ${isPast ? "#ddd" : schAccent}` }}>
                      <div className={s.scheduleEntryTitle}>{entry.title || job?.title || "Unknown"}</div>
                      {client && <div className={s.scheduleEntryClient}>{client.name}</div>}
                      {entry.startTime && <div className={s.scheduleEntryTime}>{entry.startTime}{entry.endTime ? `–${entry.endTime}` : ""}</div>}
                      {(entry.assignedTo || []).length > 0 && (
                        <div className={s.scheduleEntryAvatars}><AvatarGroup names={entry.assignedTo} max={2} /></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        };

        return (
          <div className={`card ${s.scheduleCard}`}>
            <div className="card-header">
              <span className={`card-title ${s.scheduleCardTitle}`}>
                <Icon name="schedule" size={16} /> This Week
                {todaySchedule.length > 0 && <span className={s.todayBadge} style={{ background: schAccent }}>{todaySchedule.length} today</span>}
                <span className={s.weekTaskCount}>{thisWeekTotal} task{thisWeekTotal !== 1 ? "s" : ""}</span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav("schedule")}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
            <div className={s.schedulePadding}>
              <div className="schedule-week-grid">
                {weekdays.map((dateStr, i) => (
                  <DashDayCol key={dateStr} dateStr={dateStr} dayName={dayNames[i]} />
                ))}
                <div className="schedule-weekend-stack">
                  {weekend.map((dateStr, i) => (
                    <DashDayCol key={dateStr} dateStr={dateStr} dayName={dayNames[5 + i]} isCompact />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Action Items Banner (if any) ── */}
      {actionItems.length > 0 && (
        <div className={s.actionBanner}>
          {actionItems.map((item, i) => (
            <div key={i} onClick={() => onNav(item.section)} className={s.actionItem} style={{ border: `1px solid ${item.color}30` }}
              onMouseEnter={e => { e.currentTarget.style.background = item.color + "10"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}>
              <Icon name={item.icon} size={12} />
              <span className={s.actionLabel} style={{ color: item.color }}>{item.label}</span>
              <Icon name="arrow_right" size={10} />
            </div>
          ))}
        </div>
      )}

      {/* ── ROW 4: Detail Panels (2-col grid, reordered) ── */}
      <div className={`dashboard-grid ${s.detailGrid}`}>

        {/* Panel 1: Team & Time */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Team & Time</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("time")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            <SectionLabel>Team Utilisation</SectionLabel>
            {workerHours.map(([name, hrs]) => {
              const ratio = hrs.total > 0 ? (hrs.billable / hrs.total) * 100 : 0;
              return (
                <div key={name} className={s.workerRow}>
                  <div className={s.workerRowHeader}>
                    <span className={s.workerName}>
                      <span className={s.workerAvatar}>{name.split(" ").map(n => n[0]).join("")}</span>
                      {name}
                    </span>
                    <span className={s.workerHours}>{hrs.total}h <span className={s.workerRatio} style={{ color: ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : "#dc2626" }}>({Math.round(ratio)}%)</span></span>
                  </div>
                  <div className={s.thinProgressTrack}>
                    <div className={s.thinProgressFill} style={{ width: `${ratio}%`, background: ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : SECTION_COLORS.time.accent }} />
                  </div>
                </div>
              );
            })}
            {workerHours.length === 0 && <div className={s.emptyText}>No time entries</div>}
            <div className={s.sectionSpacer}><SectionLabel>Recent Entries</SectionLabel></div>
            {recentTime.map(t => {
              const job = jobs.find(j => j.id === t.jobId);
              return (
                <div key={t.id} className={s.listRow}>
                  <div className={s.listRowLeft}>
                    <div className={s.listRowTitle}>{t.worker}</div>
                    <div className={s.listRowSub}>{job?.title} · {fmtDate(t.date)}</div>
                  </div>
                  <div className={s.timeEntryRight}>
                    <div className={s.timeEntryHours}>{t.hours}h</div>
                    {t.billable && <span className={s.billableTag}>BILLABLE</span>}
                    {!t.billable && <span className={s.nonBillTag}>NON-BILL</span>}
                  </div>
                </div>
              );
            })}
            <div className={s.summaryBar}>
              <span className={s.summaryLabel}>Billable Rate</span>
              <span className={s.summaryValue} style={{ color: billableRatio >= 80 ? "#16a34a" : billableRatio >= 50 ? "#d97706" : "#dc2626" }}>{billableRatio}%</span>
            </div>
          </div>
        </div>

        {/* Panel 2: Quotes */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Quotes</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("quotes")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {quotes.length === 0 && <div className={s.emptyText}>No quotes yet</div>}
            {quotes.map(q => {
              const job = jobs.find(j => j.id === q.jobId);
              return (
                <div key={q.id} className={s.listRow}>
                  <div className={s.listRowLeft}>
                    <div className={s.listRowTitle}>{q.number}</div>
                    <div className={s.listRowSub}>{job?.title}</div>
                  </div>
                  <div className={s.listRowRight}>
                    <div className={s.listRowAmount}>{fmt(calcQuoteTotal(q))}</div>
                    <StatusBadge status={q.status} />
                  </div>
                </div>
              );
            })}
            {quotes.length > 0 && (
              <div className={s.summaryBar}>
                <span className={s.summaryLabel}>Conversion Rate</span>
                <span className={s.summaryValue} style={{ color: "#16a34a" }}>{Math.round((quotes.filter(q => q.status === "accepted").length / quotes.length) * 100)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Panel 3: Jobs by Status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Jobs by Status</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("jobs")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {["draft","scheduled","quoted","in_progress","completed"].map(st => {
              const count = jobs.filter(j => j.status === st).length;
              const pct = jobs.length ? (count / jobs.length) * 100 : 0;
              return (
                <div key={st} className={s.statusRow}>
                  <div className={s.statusRowHeader}>
                    <span className={s.statusRowLabel}>
                      <span className={s.statusDot} style={{ background: jobStatusColors[st] }} />
                      {jobStatusLabels[st]}
                    </span>
                    <span className={s.statusCount}>{count} job{count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: jobStatusColors[st] }} />
                  </div>
                </div>
              );
            })}
            <div className={s.summaryBar}>
              <span className={s.summaryLabel}>Completion Rate</span>
              <span className={s.summaryValue} style={{ color: jobs.length > 0 ? "#16a34a" : "#999" }}>{jobs.length > 0 ? Math.round((completedJobs / jobs.length) * 100) : 0}%</span>
            </div>
          </div>
        </div>

        {/* Panel 4: Orders */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Orders</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("orders")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            <SectionLabel>Work Orders</SectionLabel>
            {workOrders.length === 0 && <div className={s.emptyText}>No work orders</div>}
            {workOrders.map(wo => {
              const overdue = wo.dueDate && daysUntil(wo.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(wo.status);
              const dueSoon = wo.dueDate && daysUntil(wo.dueDate) >= 0 && daysUntil(wo.dueDate) <= 3 && !["Cancelled", "Billed", "Completed"].includes(wo.status);
              return (
                <div key={wo.id} className={s.listRow}>
                  <div className={s.listRowLeft}>
                    <div className={s.orderRef}>{wo.ref}</div>
                    <div className={s.listRowSub}>{wo.contractorName}{wo.trade ? ` · ${wo.trade}` : ""}{wo.dueDate ? ` · Due ${fmtDate(wo.dueDate)}` : ""}</div>
                  </div>
                  <div className={s.orderRightCol}>
                    {overdue && <span className={s.overdueLabel}>OVERDUE</span>}
                    {dueSoon && !overdue && <span className={s.dueSoonLabel}>DUE SOON</span>}
                    <span className={s.orderStatusPill} style={{ background: (ORDER_STATUS_COLORS[wo.status] || {}).bg || "#f0f0f0", color: (ORDER_STATUS_COLORS[wo.status] || {}).text || "#666" }}>{wo.status}</span>
                  </div>
                </div>
              );
            })}
            <div className={s.sectionSpacer}><SectionLabel>Purchase Orders</SectionLabel></div>
            {purchaseOrders.length === 0 && <div className={s.emptyText}>No purchase orders</div>}
            {purchaseOrders.map(po => {
              const overdue = po.dueDate && daysUntil(po.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(po.status);
              const dueSoon = po.dueDate && daysUntil(po.dueDate) >= 0 && daysUntil(po.dueDate) <= 3 && !["Cancelled", "Billed", "Completed"].includes(po.status);
              return (
                <div key={po.id} className={s.listRow}>
                  <div className={s.listRowLeft}>
                    <div className={s.orderRef}>{po.ref}</div>
                    <div className={s.listRowSub}>{po.supplierName}{po.dueDate ? ` · Due ${fmtDate(po.dueDate)}` : ""}</div>
                  </div>
                  <div className={s.orderRightCol}>
                    {overdue && <span className={s.overdueLabel}>OVERDUE</span>}
                    {dueSoon && !overdue && <span className={s.dueSoonLabel}>DUE SOON</span>}
                    <span className={s.orderStatusPill} style={{ background: (ORDER_STATUS_COLORS[po.status] || {}).bg || "#f0f0f0", color: (ORDER_STATUS_COLORS[po.status] || {}).text || "#666" }}>{po.status}</span>
                  </div>
                </div>
              );
            })}
            <div className={s.summaryBar}>
              <span className={s.summaryLabel}>Total Committed</span>
              <span className={s.summaryValue} style={{ color: "#333" }}>{fmt(workOrders.reduce((s, wo) => s + (parseFloat(wo.poLimit) || 0), 0) + purchaseOrders.reduce((s, po) => s + ((po.lines || []).reduce((ls, l) => ls + (l.qty || 0) * (l.rate || 0), 0)), 0))}</span>
            </div>
          </div>
        </div>

        {/* Panel 5: Bills & Costs */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Bills & Costs</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("bills")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            <div className={s.billPipeline}>
              {["inbox", "linked", "approved", "posted"].map((st, i) => {
                const count = bills.filter(b => b.status === st).length;
                return (
                  <Fragment key={st}>
                    <div className={s.billPipelineStep} style={{ background: count > 0 ? billStatusColors[st] + "15" : "#f5f5f5", border: `1px solid ${count > 0 ? billStatusColors[st] + "40" : "#e5e5e5"}` }}>
                      <div className={s.billPipelineCount} style={{ color: count > 0 ? billStatusColors[st] : "#ccc" }}>{count}</div>
                      <div className={s.billPipelineLabel} style={{ color: count > 0 ? billStatusColors[st] : "#bbb" }}>{billStatusLabels[st]}</div>
                    </div>
                    {i < 3 && <span className={s.pipelineArrow}>→</span>}
                  </Fragment>
                );
              })}
            </div>
            {recentBills.map(b => {
              const job = jobs.find(j => j.id === b.jobId);
              return (
                <div key={b.id} className={s.listRow}>
                  <div className={s.listRowLeft}>
                    <div className={s.listRowTitle}>{b.supplier}</div>
                    <div className={s.listRowSub}>{b.invoiceNo}{job ? ` · ${job.title}` : ""}</div>
                  </div>
                  <div className={s.listRowRight}>
                    <div className={s.listRowAmount}>{fmt(b.amount)}</div>
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              );
            })}
            <div className={s.summaryBar}>
              <span className={s.summaryLabel}>Gross Margin</span>
              <span className={s.summaryValue} style={{ color: margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626" }}>{margin}%</span>
            </div>
          </div>
        </div>

        {/* Panel 6: Invoices Pipeline */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Invoices Pipeline</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("invoices")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {invoices.length === 0 && <div className={s.emptyText}>No invoices yet</div>}
            {invoices.map(inv => {
              const job = jobs.find(j => j.id === inv.jobId);
              const overdue = inv.dueDate && daysUntil(inv.dueDate) < 0 && inv.status !== "paid";
              return (
                <div key={inv.id} className={s.listRow}>
                  <div className={s.listRowLeft}>
                    <div className={s.listRowTitle}>{inv.number}</div>
                    <div className={s.listRowSub} style={{ color: overdue ? "#dc2626" : undefined }}>{job?.title}{inv.dueDate ? ` · Due ${fmtDate(inv.dueDate)}` : ""}{overdue ? " — OVERDUE" : ""}</div>
                  </div>
                  <div className={s.listRowRight}>
                    <div className={s.listRowAmount}>{fmt(calcQuoteTotal(inv))}</div>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              );
            })}
            {invoices.length > 0 && (
              <div className={s.summaryBar}>
                <span className={s.summaryLabel}>Total Outstanding</span>
                <span className={s.summaryValue} style={{ color: outstandingInvCount > 0 ? "#dc2626" : "#16a34a" }}>{fmt(outstandingInv)}</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};




// ── Jobs ──────────────────────────────────────────────────────────────────────


export default Dashboard;
