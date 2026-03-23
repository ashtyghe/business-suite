import { useState, useEffect, useRef, Fragment } from "react";
import { useAppStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { fmt, calcQuoteTotal, daysUntil, getContractorComplianceCount } from '../utils/helpers';
import { Icon } from '../components/Icon';
import { SectionLabel, StatusBadge, AvatarGroup } from '../components/shared';
import { SECTION_COLORS, ORDER_STATUS_COLORS } from '../fixtures/seedData.jsx';
import s from './Dashboard.module.css';

const Dashboard = ({ onNav }) => {
  const { jobs, clients, quotes, invoices, bills, timeEntries, schedule, workOrders, purchaseOrders, contractors, suppliers } = useAppStore();
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
  const overdueJobs = jobs.filter(j => j.dueDate && daysUntil(j.dueDate) < 0 && j.status !== "completed" && j.status !== "cancelled").length;
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
  const todayStr = new Date().toISOString().slice(0, 10);
  const startOfWeek = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const endOfWeek = (() => { const d = new Date(startOfWeek); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();

  // ── Profit margin ──
  const totalBillsCost = bills.reduce((s, b) => s + b.amount, 0);
  const totalInvoiced = invoices.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const margin = totalInvoiced > 0 ? Math.round(((totalInvoiced - totalBillsCost) / totalInvoiced) * 100) : 0;

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
  if (overdueJobs > 0) actionItems.push({ label: `${overdueJobs} overdue job${overdueJobs > 1 ? "s" : ""}`, color: "#dc2626", section: "jobs", icon: "jobs" });
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
    activeJobs, completedJobs, overdueJobs,
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
      // Reset chat with the initial insight as first assistant message
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
        // Parse insight text into cards
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
            {/* Header */}
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
            {/* Expandable content */}
            {aiExpanded && (
              <div className={s.aiExpandBody}>
                {aiLoading && !aiInsight && <div className={s.aiLoadingText}>Analysing your business data...</div>}
                {aiError && <div className={s.aiErrorText}>Failed to generate insight: {aiError}</div>}
                {/* Insight cards */}
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

                {/* Chat section */}
                {aiInsight && (
                  <div className={s.aiChatSection}>
                    {/* Chat messages (skip the first assistant message which is shown as insight cards above) */}
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

                    {/* Suggested questions (only show when no chat history yet) */}
                    {aiChatMessages.length <= 1 && (
                      <div className={s.aiSuggestedWrap}>
                        {suggestedQuestions.map((q, i) => (
                          <button key={i} onClick={() => { setAiChatInput(q); }} className={s.aiSuggestBtn}>{q}</button>
                        ))}
                      </div>
                    )}

                    {/* Chat input */}
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

      {/* ── ROW 1: Financial Hero Strip (full width) ── */}
      <div className={`stat-grid ${s.financialGrid}`}>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.quotes.accent}` }} onClick={() => onNav("quotes")}>
          <div className={s.statHeaderRow}><Icon name="quotes" size={13} /><div className="stat-label">Total Quoted</div></div>
          <div className="stat-value">{fmt(totalQuoted)}</div>
          <div className="stat-sub">{quotes.filter(q => q.status !== "declined").length} quotes in pipeline</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.invoices.accent}` }} onClick={() => onNav("invoices")}>
          <div className={s.statHeaderRow}><Icon name="invoices" size={13} /><div className="stat-label">Revenue Collected</div></div>
          <div className="stat-value">{fmt(revenueCollected)}</div>
          <div className={s.progressRow}>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: totalQuoted > 0 ? `${Math.min(100, Math.round((revenueCollected / totalQuoted) * 100))}%` : "0%", background: SECTION_COLORS.invoices.accent }} />
            </div>
            <span className={s.progressLabel}>{totalQuoted > 0 ? Math.round((revenueCollected / totalQuoted) * 100) : 0}%</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${outstandingInvCount > 0 ? "#dc2626" : "#e5e5e5"}` }} onClick={() => onNav("invoices")}>
          <div className={s.statHeaderRow}><Icon name="invoices" size={13} /><div className="stat-label">Outstanding</div></div>
          <div className="stat-value" style={{ color: outstandingInvCount > 0 ? "#dc2626" : undefined }}>{fmt(outstandingInv)}</div>
          <div className="stat-sub">{outstandingInvCount > 0 ? `${outstandingInvCount} unpaid — action needed` : "All invoices paid ✓"}</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.bills.accent}` }} onClick={() => onNav("bills")}>
          <div className={s.statHeaderRow}><Icon name="bills" size={13} /><div className="stat-label">Costs to Process</div></div>
          <div className="stat-value">{fmt(unpostedBillsTotal)}</div>
          <div className={s.billPillRow}>
            {["inbox", "linked", "approved"].map(st => {
              const c = bills.filter(b => b.status === st).length;
              return c > 0 ? <span key={st} className={s.billPill} style={{ background: billStatusColors[st] }}>{c} {billStatusLabels[st]}</span> : null;
            })}
          </div>
        </div>
      </div>

      {/* ── ROW 2: Operational KPI Cards (5 cards with progress/actions) ── */}
      <SectionLabel>Operations</SectionLabel>
      <div className={`stat-grid ${s.opsGrid}`}>
        {/* Active Jobs */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.jobs.accent}` }} onClick={() => onNav("jobs")}>
          <div className={s.statHeaderRow}><Icon name="jobs" size={13} /><div className="stat-label">Active Jobs</div></div>
          <div className="stat-value">{activeJobs}</div>
          <div className={s.progressRow}>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: jobs.length > 0 ? `${Math.round((completedJobs / jobs.length) * 100)}%` : "0%", background: "#16a34a" }} />
            </div>
            <span className={s.progressLabel}>{completedJobs}/{jobs.length}</span>
          </div>
          {overdueJobs > 0 && <div className={s.overdueText}>⚠ {overdueJobs} overdue</div>}
        </div>

        {/* Work Orders */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.wo.accent}` }} onClick={() => onNav("orders")}>
          <div className={s.statHeaderRow}><Icon name="orders" size={13} /><div className="stat-label">Work Orders</div></div>
          <div className="stat-value">{activeWOs}</div>
          <div className="stat-sub">{workOrders.length} total · {fmt(workOrders.reduce((s, wo) => s + (parseFloat(wo.poLimit) || 0), 0))}</div>
          {woAwaitingAcceptance > 0 && <div className={s.accentText} style={{ color: SECTION_COLORS.wo.accent }}>{woAwaitingAcceptance} awaiting acceptance</div>}
          {overdueWOs > 0 && <div className={s.accentText} style={{ color: "#dc2626" }}>⚠ {overdueWOs} overdue</div>}
        </div>

        {/* Purchase Orders */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.po.accent}` }} onClick={() => onNav("orders")}>
          <div className={s.statHeaderRow}><Icon name="orders" size={13} /><div className="stat-label">Purchase Orders</div></div>
          <div className="stat-value">{activePOs}</div>
          <div className="stat-sub">{purchaseOrders.length} total</div>
          {overduePOs > 0 && <div className={s.accentText} style={{ color: "#dc2626" }}>⚠ {overduePOs} overdue</div>}
        </div>

        {/* Hours Logged */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.time.accent}` }} onClick={() => onNav("time")}>
          <div className={s.statHeaderRow}><Icon name="time" size={13} /><div className="stat-label">Hours Logged</div></div>
          <div className="stat-value">{totalHours}h</div>
          <div className={s.progressRow}>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: `${billableRatio}%`, background: SECTION_COLORS.time.accent }} />
            </div>
            <span className={s.progressLabel}>{billableRatio}%</span>
          </div>
          <div className="stat-sub">{billableHours}h billable</div>
        </div>

      </div>

      {/* ── ROW 3: This Week Schedule (full width, week grid) ── */}
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
          return (
            <div className={`schedule-day-col${isCompact ? " schedule-day-compact" : ""}`} style={{ background: isToday ? "#ecfeff" : isWeekend ? "#fafafa" : "#fff", borderColor: isToday ? schAccent : "#e5e5e5" }} onClick={() => onNav("schedule")}>
              <div className="schedule-day-header" style={{ background: isToday ? schAccent : isPast ? "#e0e0e0" : "#f5f5f5", color: isToday ? "#fff" : isPast ? "#999" : "#333" }}>
                <span className={s.dayHeaderLabel}>{dayName}</span>
                <span className={isCompact ? s.dayHeaderDateCompact : s.dayHeaderDateFull}>{d.getDate()}</span>
              </div>
              <div className="schedule-day-body">
                {dayEntries.length === 0 && <div className={`${s.emptyDay} ${isCompact ? s.emptyDayCompact : s.emptyDayFull}`}>—</div>}
                {dayEntries.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  return (
                    <div key={entry.id} className="schedule-card" style={{ borderLeft: `3px solid ${isPast ? "#ddd" : schAccent}` }}>
                      <div className={s.scheduleEntryTitle}>{entry.title}</div>
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

      {/* ── ROW 4: Detail Panels (2-col grid) ── */}
      <div className={`dashboard-grid ${s.detailGrid}`}>

        {/* Panel 1: Jobs by Status */}
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
            {/* Job completion rate */}
            <div className={s.summaryBar}>
              <span className={s.summaryLabel}>Completion Rate</span>
              <span className={s.summaryValue} style={{ color: jobs.length > 0 ? "#16a34a" : "#999" }}>{jobs.length > 0 ? Math.round((completedJobs / jobs.length) * 100) : 0}%</span>
            </div>
          </div>
        </div>

        {/* Panel 2: Quote & Invoice Pipeline */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Quote & Invoice Pipeline</span>
          </div>
          <div className="card-body">
            <div className={s.sectionBetween}>
              <SectionLabel>Quotes</SectionLabel>
              <button className={`btn btn-ghost btn-sm ${s.btnNudgeUp}`} onClick={() => onNav("quotes")}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
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
            {/* Quote conversion rate */}
            {quotes.length > 0 && (
              <div className={s.summaryBar}>
                <span className={s.summaryLabel}>Conversion Rate</span>
                <span className={s.summaryValue} style={{ color: "#16a34a" }}>{Math.round((quotes.filter(q => q.status === "accepted").length / quotes.length) * 100)}%</span>
              </div>
            )}
            <div className={`${s.sectionBetween} ${s.sectionBetweenTop}`}>
              <SectionLabel>Invoices</SectionLabel>
              <button className={`btn btn-ghost btn-sm ${s.btnNudgeUp}`} onClick={() => onNav("invoices")}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
            {invoices.length === 0 && <div className={s.emptyText}>No invoices yet</div>}
            {invoices.map(inv => {
              const job = jobs.find(j => j.id === inv.jobId);
              const overdue = inv.dueDate && daysUntil(inv.dueDate) < 0 && inv.status !== "paid";
              return (
                <div key={inv.id} className={s.listRow}>
                  <div className={s.listRowLeft}>
                    <div className={s.listRowTitle}>{inv.number}</div>
                    <div className={s.listRowSub} style={{ color: overdue ? "#dc2626" : undefined }}>{job?.title}{inv.dueDate ? ` · Due ${inv.dueDate}` : ""}{overdue ? " — OVERDUE" : ""}</div>
                  </div>
                  <div className={s.listRowRight}>
                    <div className={s.listRowAmount}>{fmt(calcQuoteTotal(inv))}</div>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel 3: Bills & Cost Tracking */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Bills & Cost Tracking</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("bills")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {/* Bill workflow pipeline */}
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
            {/* Margin indicator */}
            <div className={s.summaryBar}>
              <span className={s.summaryLabel}>Gross Margin</span>
              <span className={s.summaryValue} style={{ color: margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626" }}>{margin}%</span>
            </div>
          </div>
        </div>

        {/* Panel 4: Orders Snapshot */}
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
                    <div className={s.listRowSub}>{wo.contractorName}{wo.trade ? ` · ${wo.trade}` : ""}{wo.dueDate ? ` · Due ${wo.dueDate}` : ""}</div>
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
                    <div className={s.listRowSub}>{po.supplierName}{po.dueDate ? ` · Due ${po.dueDate}` : ""}</div>
                  </div>
                  <div className={s.orderRightCol}>
                    {overdue && <span className={s.overdueLabel}>OVERDUE</span>}
                    {dueSoon && !overdue && <span className={s.dueSoonLabel}>DUE SOON</span>}
                    <span className={s.orderStatusPill} style={{ background: (ORDER_STATUS_COLORS[po.status] || {}).bg || "#f0f0f0", color: (ORDER_STATUS_COLORS[po.status] || {}).text || "#666" }}>{po.status}</span>
                  </div>
                </div>
              );
            })}
            {/* Order value summary */}
            <div className={s.summaryBar}>
              <span className={s.summaryLabel}>Total Committed</span>
              <span className={s.summaryValue} style={{ color: "#333" }}>{fmt(workOrders.reduce((s, wo) => s + (parseFloat(wo.poLimit) || 0), 0) + purchaseOrders.reduce((s, po) => s + ((po.lines || []).reduce((ls, l) => ls + (l.qty || 0) * (l.rate || 0), 0)), 0))}</span>
            </div>
          </div>
        </div>

        {/* Panel 5: Team & Time */}
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
                    <div className={s.listRowSub}>{job?.title} · {t.date}</div>
                  </div>
                  <div className={s.timeEntryRight}>
                    <div className={s.timeEntryHours}>{t.hours}h</div>
                    {t.billable && <span className={s.billableTag}>BILLABLE</span>}
                    {!t.billable && <span className={s.nonBillTag}>NON-BILL</span>}
                  </div>
                </div>
              );
            })}
            {/* Overall billable rate */}
            <div className={s.summaryBar}>
              <span className={s.summaryLabel}>Billable Rate</span>
              <span className={s.summaryValue} style={{ color: billableRatio >= 80 ? "#16a34a" : billableRatio >= 50 ? "#d97706" : "#dc2626" }}>{billableRatio}%</span>
            </div>
          </div>
        </div>

        {/* Panel 6: Profitability by Job */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Job Profitability</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("jobs")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {jobs.map(job => {
              const jobQuotes = quotes.filter(q => q.jobId === job.id);
              const jobInvoices = invoices.filter(inv => inv.jobId === job.id);
              const jobBills = bills.filter(b => b.jobId === job.id);
              const quoted = jobQuotes.reduce((s, q) => s + calcQuoteTotal(q), 0);
              const invoiced = jobInvoices.reduce((s, inv) => s + calcQuoteTotal(inv), 0);
              const costs = jobBills.reduce((s, b) => s + b.amount, 0);
              const jobMargin = invoiced > 0 ? Math.round(((invoiced - costs) / invoiced) * 100) : (quoted > 0 ? Math.round(((quoted - costs) / quoted) * 100) : null);
              const costPct = quoted > 0 ? Math.min(100, Math.round((costs / quoted) * 100)) : 0;
              return (
                <div key={job.id} className={s.profitRow}>
                  <div className={s.profitRowHeader}>
                    <span className={s.profitJobTitle}>
                      {job.title}
                      <StatusBadge status={job.status} />
                    </span>
                    {jobMargin !== null && <span className={s.profitMargin} style={{ color: jobMargin >= 20 ? "#16a34a" : jobMargin >= 0 ? "#d97706" : "#dc2626" }}>{jobMargin}% margin</span>}
                  </div>
                  <div className={s.profitBarRow}>
                    <div className={s.profitTrack}>
                      <div className={s.profitFill} style={{ width: `${costPct}%`, background: costPct > 90 ? "#dc2626" : costPct > 70 ? "#d97706" : "#16a34a" }} />
                    </div>
                    <span className={s.profitAmount}>{fmt(costs)} / {fmt(quoted || invoiced)}</span>
                  </div>
                </div>
              );
            })}
            {/* Total margin */}
            <div className={`${s.summaryBar} ${s.summaryBarTop}`}>
              <span className={s.summaryLabel}>Overall Margin</span>
              <span className={s.summaryValue} style={{ color: margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626" }}>{margin}%</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};




// ── Jobs ──────────────────────────────────────────────────────────────────────


export default Dashboard;
