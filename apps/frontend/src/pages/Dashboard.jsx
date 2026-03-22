import { useState, useEffect, useRef } from "react";
import { useAppStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { fmt, calcQuoteTotal, daysUntil, getContractorComplianceCount } from '../utils/helpers';
import { Icon } from '../components/Icon';
import { SectionLabel, StatusBadge } from '../components/shared';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';

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
          <div style={{ background: "linear-gradient(135deg, #111 0%, #1e293b 100%)", borderRadius: 12, marginBottom: 20, color: "#fff", overflow: "hidden" }}>
            {/* Header */}
            <div onClick={() => setAiExpanded(e => !e)} style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>&#10024;</span>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.03em" }}>AI Business Insight</span>
                {insightCards.length > 0 && !aiExpanded && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>{insightCards.length} insights</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={e => { e.stopPropagation(); generateInsight(); }} disabled={aiLoading} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: "#fff", cursor: "pointer", opacity: aiLoading ? 0.5 : 1, fontFamily: "'Open Sans', sans-serif" }}>
                  {aiLoading ? "Analysing..." : "Refresh"}
                </button>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: aiExpanded ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="5 8 10 13 15 8"/></svg>
              </div>
            </div>
            {/* Expandable content */}
            {aiExpanded && (
              <div style={{ padding: "0 24px 20px" }}>
                {aiLoading && !aiInsight && <div style={{ fontSize: 13, color: "#94a3b8" }}>Analysing your business data...</div>}
                {aiError && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>Failed to generate insight: {aiError}</div>}
                {/* Insight cards */}
                {insightCards.length > 0 && !aiLoading && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {insightCards.map((card, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "14px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{card.heading}</div>
                        {card.detail && <div style={{ fontSize: 12, lineHeight: 1.5, color: "#94a3b8" }}>{card.detail}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {!aiLoading && !aiError && aiInsight && insightCards.length === 0 && (
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: "#e2e8f0", whiteSpace: "pre-wrap", marginBottom: 16 }}>{aiInsight}</div>
                )}

                {/* Chat section */}
                {aiInsight && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
                    {/* Chat messages (skip the first assistant message which is shown as insight cards above) */}
                    {aiChatMessages.length > 1 && (
                      <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12, paddingRight: 4 }}>
                        {aiChatMessages.slice(1).map((msg, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                            <div style={{
                              maxWidth: "85%",
                              background: msg.role === "user" ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)",
                              border: msg.role === "user" ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.1)",
                              borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                              padding: "10px 14px",
                            }}>
                              {msg.role === "assistant" && <div style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>AI Analyst</div>}
                              <div style={{ fontSize: 13, lineHeight: 1.6, color: msg.role === "user" ? "#e2e8f0" : "#cbd5e1", whiteSpace: "pre-wrap" }}>{msg.content}</div>
                            </div>
                          </div>
                        ))}
                        {aiChatLoading && (
                          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px 12px 12px 4px", padding: "10px 14px" }}>
                              <div style={{ fontSize: 13, color: "#94a3b8" }}>Thinking...</div>
                            </div>
                          </div>
                        )}
                        <div ref={aiChatEndRef} />
                      </div>
                    )}

                    {/* Suggested questions (only show when no chat history yet) */}
                    {aiChatMessages.length <= 1 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                        {suggestedQuestions.map((q, i) => (
                          <button key={i} onClick={() => { setAiChatInput(q); }} style={{
                            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20,
                            padding: "6px 14px", fontSize: 12, color: "#94a3b8", cursor: "pointer", fontFamily: "'Open Sans', sans-serif",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => { e.target.style.background = "rgba(255,255,255,0.12)"; e.target.style.color = "#e2e8f0"; }}
                          onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.06)"; e.target.style.color = "#94a3b8"; }}
                          >{q}</button>
                        ))}
                      </div>
                    )}

                    {/* Chat input */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        value={aiChatInput}
                        onChange={e => setAiChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                        placeholder="Ask a follow-up question..."
                        style={{
                          flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fff",
                          fontFamily: "'Open Sans', sans-serif", outline: "none",
                        }}
                      />
                      <button
                        onClick={sendChatMessage}
                        disabled={!aiChatInput.trim() || aiChatLoading}
                        style={{
                          background: aiChatInput.trim() && !aiChatLoading ? "#6366f1" : "rgba(255,255,255,0.08)",
                          border: "none", borderRadius: 8, padding: "10px 16px", cursor: aiChatInput.trim() && !aiChatLoading ? "pointer" : "default",
                          transition: "all 0.15s", display: "flex", alignItems: "center",
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={aiChatInput.trim() && !aiChatLoading ? "#fff" : "#666"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
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
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 24 }}>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.quotes.accent}`, cursor: "pointer" }} onClick={() => onNav("quotes")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="quotes" size={13} /><div className="stat-label">Total Quoted</div></div>
          <div className="stat-value">{fmt(totalQuoted)}</div>
          <div className="stat-sub">{quotes.filter(q => q.status !== "declined").length} quotes in pipeline</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.invoices.accent}`, cursor: "pointer" }} onClick={() => onNav("invoices")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="invoices" size={13} /><div className="stat-label">Revenue Collected</div></div>
          <div className="stat-value">{fmt(revenueCollected)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: totalQuoted > 0 ? `${Math.min(100, Math.round((revenueCollected / totalQuoted) * 100))}%` : "0%", background: SECTION_COLORS.invoices.accent, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>{totalQuoted > 0 ? Math.round((revenueCollected / totalQuoted) * 100) : 0}%</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${outstandingInvCount > 0 ? "#dc2626" : "#e5e5e5"}`, cursor: "pointer" }} onClick={() => onNav("invoices")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="invoices" size={13} /><div className="stat-label">Outstanding</div></div>
          <div className="stat-value" style={{ color: outstandingInvCount > 0 ? "#dc2626" : undefined }}>{fmt(outstandingInv)}</div>
          <div className="stat-sub">{outstandingInvCount > 0 ? `${outstandingInvCount} unpaid — action needed` : "All invoices paid ✓"}</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.bills.accent}`, cursor: "pointer" }} onClick={() => onNav("bills")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="bills" size={13} /><div className="stat-label">Costs to Process</div></div>
          <div className="stat-value">{fmt(unpostedBillsTotal)}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {["inbox", "linked", "approved"].map(st => {
              const c = bills.filter(b => b.status === st).length;
              return c > 0 ? <span key={st} style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: billStatusColors[st], color: "#fff" }}>{c} {billStatusLabels[st]}</span> : null;
            })}
          </div>
        </div>
      </div>

      {/* ── ROW 2: Operational KPI Cards (5 cards with progress/actions) ── */}
      <SectionLabel>Operations</SectionLabel>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 24 }}>
        {/* Active Jobs */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.jobs.accent}`, cursor: "pointer" }} onClick={() => onNav("jobs")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="jobs" size={13} /><div className="stat-label">Active Jobs</div></div>
          <div className="stat-value">{activeJobs}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: jobs.length > 0 ? `${Math.round((completedJobs / jobs.length) * 100)}%` : "0%", background: "#16a34a", borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>{completedJobs}/{jobs.length}</span>
          </div>
          {overdueJobs > 0 && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 4 }}>⚠ {overdueJobs} overdue</div>}
        </div>

        {/* Work Orders */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.wo.accent}`, cursor: "pointer" }} onClick={() => onNav("orders")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="orders" size={13} /><div className="stat-label">Work Orders</div></div>
          <div className="stat-value">{activeWOs}</div>
          <div className="stat-sub">{workOrders.length} total · {fmt(workOrders.reduce((s, wo) => s + (parseFloat(wo.poLimit) || 0), 0))}</div>
          {woAwaitingAcceptance > 0 && <div style={{ fontSize: 11, color: SECTION_COLORS.wo.accent, fontWeight: 600, marginTop: 2 }}>{woAwaitingAcceptance} awaiting acceptance</div>}
          {overdueWOs > 0 && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 2 }}>⚠ {overdueWOs} overdue</div>}
        </div>

        {/* Purchase Orders */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.po.accent}`, cursor: "pointer" }} onClick={() => onNav("orders")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="orders" size={13} /><div className="stat-label">Purchase Orders</div></div>
          <div className="stat-value">{activePOs}</div>
          <div className="stat-sub">{purchaseOrders.length} total</div>
          {overduePOs > 0 && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 2 }}>⚠ {overduePOs} overdue</div>}
        </div>

        {/* Hours Logged */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.time.accent}`, cursor: "pointer" }} onClick={() => onNav("time")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="time" size={13} /><div className="stat-label">Hours Logged</div></div>
          <div className="stat-value">{totalHours}h</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${billableRatio}%`, background: SECTION_COLORS.time.accent, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>{billableRatio}%</span>
          </div>
          <div className="stat-sub">{billableHours}h billable</div>
        </div>

        {/* Open Quotes */}
        <div className="stat-card" style={{ borderTop: `3px solid ${SECTION_COLORS.quotes.accent}`, cursor: "pointer" }} onClick={() => onNav("quotes")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><Icon name="quotes" size={13} /><div className="stat-label">Open Quotes</div></div>
          <div className="stat-value">{pipelineQuotes.length}</div>
          <div className="stat-sub">{fmt(pipelineTotal)} pending</div>
          {quoteDrafts > 0 && <div style={{ fontSize: 11, color: SECTION_COLORS.quotes.accent, fontWeight: 600, marginTop: 2 }}>{quoteDrafts} draft{quoteDrafts > 1 ? "s" : ""} to send</div>}
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
            <div className={`schedule-day-col${isCompact ? " schedule-day-compact" : ""}`} style={{ background: isToday ? "#ecfeff" : isWeekend ? "#fafafa" : "#fff", borderColor: isToday ? schAccent : "#e5e5e5", cursor: "pointer" }} onClick={() => onNav("schedule")}>
              <div className="schedule-day-header" style={{ background: isToday ? schAccent : isPast ? "#e0e0e0" : "#f5f5f5", color: isToday ? "#fff" : isPast ? "#999" : "#333" }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{dayName}</span>
                <span style={{ fontSize: isCompact ? 13 : 16, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</span>
              </div>
              <div className="schedule-day-body">
                {dayEntries.length === 0 && <div style={{ fontSize: 11, color: "#ccc", textAlign: "center", padding: isCompact ? "6px 0" : "12px 0" }}>—</div>}
                {dayEntries.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  return (
                    <div key={entry.id} className="schedule-card" style={{ borderLeft: `3px solid ${isPast ? "#ddd" : schAccent}` }}>
                      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2, lineHeight: 1.3 }}>{entry.title}</div>
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

        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="schedule" size={16} /> This Week
                {todaySchedule.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: schAccent, color: "#fff" }}>{todaySchedule.length} today</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>{thisWeekTotal} task{thisWeekTotal !== 1 ? "s" : ""}</span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav("schedule")}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
            <div style={{ padding: "12px 16px" }}>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {actionItems.map((item, i) => (
            <div key={i} onClick={() => onNav(item.section)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "#fff", border: `1px solid ${item.color}30`, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = item.color + "10"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}>
              <Icon name={item.icon} size={12} />
              <span style={{ fontSize: 12, fontWeight: 600, color: item.color }}>{item.label}</span>
              <Icon name="arrow_right" size={10} />
            </div>
          ))}
        </div>
      )}

      {/* ── ROW 4: Detail Panels (2-col grid) ── */}
      <div className="dashboard-grid" style={{ display: "grid", gap: 20 }}>

        {/* Panel 1: Jobs by Status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Jobs by Status</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("jobs")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {["draft","scheduled","quoted","in_progress","completed"].map(s => {
              const count = jobs.filter(j => j.status === s).length;
              const pct = jobs.length ? (count / jobs.length) * 100 : 0;
              return (
                <div key={s} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: jobStatusColors[s], display: "inline-block" }} />
                      {jobStatusLabels[s]}
                    </span>
                    <span style={{ color: "#999" }}>{count} job{count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: jobStatusColors[s] }} />
                  </div>
                </div>
              );
            })}
            {/* Job completion rate */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Completion Rate</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: jobs.length > 0 ? "#16a34a" : "#999" }}>{jobs.length > 0 ? Math.round((completedJobs / jobs.length) * 100) : 0}%</span>
            </div>
          </div>
        </div>

        {/* Panel 2: Quote & Invoice Pipeline */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Quote & Invoice Pipeline</span>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <SectionLabel>Quotes</SectionLabel>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav("quotes")} style={{ marginTop: -4 }}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
            {quotes.map(q => {
              const job = jobs.find(j => j.id === q.jobId);
              return (
                <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{q.number}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{job?.title}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(calcQuoteTotal(q))}</div>
                    <StatusBadge status={q.status} />
                  </div>
                </div>
              );
            })}
            {/* Quote conversion rate */}
            {quotes.length > 0 && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Conversion Rate</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#16a34a" }}>{Math.round((quotes.filter(q => q.status === "accepted").length / quotes.length) * 100)}%</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 8 }}>
              <SectionLabel>Invoices</SectionLabel>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav("invoices")} style={{ marginTop: -4 }}>View all <Icon name="arrow_right" size={12} /></button>
            </div>
            {invoices.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No invoices yet</div>}
            {invoices.map(inv => {
              const job = jobs.find(j => j.id === inv.jobId);
              const overdue = inv.dueDate && daysUntil(inv.dueDate) < 0 && inv.status !== "paid";
              return (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{inv.number}</div>
                    <div style={{ fontSize: 12, color: overdue ? "#dc2626" : "#999" }}>{job?.title}{inv.dueDate ? ` · Due ${inv.dueDate}` : ""}{overdue ? " — OVERDUE" : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(calcQuoteTotal(inv))}</div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
              {["inbox", "linked", "approved", "posted"].map((st, i) => {
                const count = bills.filter(b => b.status === st).length;
                return (
                  <Fragment key={st}>
                    <div style={{ flex: 1, textAlign: "center", padding: "6px 4px", borderRadius: 6, background: count > 0 ? billStatusColors[st] + "15" : "#f5f5f5", border: `1px solid ${count > 0 ? billStatusColors[st] + "40" : "#e5e5e5"}` }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: count > 0 ? billStatusColors[st] : "#ccc" }}>{count}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: count > 0 ? billStatusColors[st] : "#bbb", letterSpacing: "0.04em" }}>{billStatusLabels[st]}</div>
                    </div>
                    {i < 3 && <span style={{ color: "#ccc", fontSize: 12 }}>→</span>}
                  </Fragment>
                );
              })}
            </div>
            {recentBills.map(b => {
              const job = jobs.find(j => j.id === b.jobId);
              return (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{b.invoiceNo}{job ? ` · ${job.title}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(b.amount)}</div>
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              );
            })}
            {/* Margin indicator */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Gross Margin</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626" }}>{margin}%</span>
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
            {workOrders.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No work orders</div>}
            {workOrders.map(wo => {
              const overdue = wo.dueDate && daysUntil(wo.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(wo.status);
              const dueSoon = wo.dueDate && daysUntil(wo.dueDate) >= 0 && daysUntil(wo.dueDate) <= 3 && !["Cancelled", "Billed", "Completed"].includes(wo.status);
              return (
                <div key={wo.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace" }}>{wo.ref}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{wo.contractorName}{wo.trade ? ` · ${wo.trade}` : ""}{wo.dueDate ? ` · Due ${wo.dueDate}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626" }}>OVERDUE</span>}
                    {dueSoon && !overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#d97706" }}>DUE SOON</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: (ORDER_STATUS_COLORS[wo.status] || {}).bg || "#f0f0f0", color: (ORDER_STATUS_COLORS[wo.status] || {}).text || "#666" }}>{wo.status}</span>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 14 }}><SectionLabel>Purchase Orders</SectionLabel></div>
            {purchaseOrders.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No purchase orders</div>}
            {purchaseOrders.map(po => {
              const overdue = po.dueDate && daysUntil(po.dueDate) < 0 && !["Cancelled", "Billed", "Completed"].includes(po.status);
              const dueSoon = po.dueDate && daysUntil(po.dueDate) >= 0 && daysUntil(po.dueDate) <= 3 && !["Cancelled", "Billed", "Completed"].includes(po.status);
              return (
                <div key={po.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, fontFamily: "monospace" }}>{po.ref}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{po.supplierName}{po.dueDate ? ` · Due ${po.dueDate}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626" }}>OVERDUE</span>}
                    {dueSoon && !overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#d97706" }}>DUE SOON</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: (ORDER_STATUS_COLORS[po.status] || {}).bg || "#f0f0f0", color: (ORDER_STATUS_COLORS[po.status] || {}).text || "#666" }}>{po.status}</span>
                  </div>
                </div>
              );
            })}
            {/* Order value summary */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Total Committed</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#333" }}>{fmt(workOrders.reduce((s, wo) => s + (parseFloat(wo.poLimit) || 0), 0) + purchaseOrders.reduce((s, po) => s + ((po.lines || []).reduce((ls, l) => ls + (l.qty || 0) * (l.rate || 0), 0)), 0))}</span>
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
                <div key={name} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#111", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{name.split(" ").map(n => n[0]).join("")}</span>
                      {name}
                    </span>
                    <span style={{ color: "#999" }}>{hrs.total}h <span style={{ color: ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : "#dc2626", fontWeight: 700 }}>({Math.round(ratio)}%)</span></span>
                  </div>
                  <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${ratio}%`, background: ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : SECTION_COLORS.time.accent, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
            {workerHours.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No time entries</div>}
            <div style={{ marginTop: 14 }}><SectionLabel>Recent Entries</SectionLabel></div>
            {recentTime.map(t => {
              const job = jobs.find(j => j.id === t.jobId);
              return (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t.worker}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{job?.title} · {t.date}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.hours}h</div>
                    {t.billable && <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>BILLABLE</span>}
                    {!t.billable && <span style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>NON-BILL</span>}
                  </div>
                </div>
              );
            })}
            {/* Overall billable rate */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Billable Rate</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: billableRatio >= 80 ? "#16a34a" : billableRatio >= 50 ? "#d97706" : "#dc2626" }}>{billableRatio}%</span>
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
                <div key={job.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {job.title}
                      <StatusBadge status={job.status} />
                    </span>
                    {jobMargin !== null && <span style={{ fontWeight: 700, color: jobMargin >= 20 ? "#16a34a" : jobMargin >= 0 ? "#d97706" : "#dc2626" }}>{jobMargin}% margin</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                      <div style={{ position: "absolute", height: "100%", width: `${costPct}%`, background: costPct > 90 ? "#dc2626" : costPct > 70 ? "#d97706" : "#16a34a", borderRadius: 3, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#999", minWidth: 80, textAlign: "right" }}>{fmt(costs)} / {fmt(quoted || invoiced)}</span>
                  </div>
                </div>
              );
            })}
            {/* Total margin */}
            <div style={{ marginTop: 4, padding: "10px 12px", background: "#f8fafb", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Overall Margin</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626" }}>{margin}%</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};




// ── Jobs ──────────────────────────────────────────────────────────────────────


export default Dashboard;
