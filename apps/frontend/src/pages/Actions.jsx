import { useState } from "react";
import { useAppStore } from '../lib/store';
import {
  SEED_CLIENTS, SECTION_COLORS, ORDER_TERMINAL,
} from '../fixtures/seedData.jsx';
import {
  daysUntil, hexToRgba,
  COMPLIANCE_DOC_TYPES, getComplianceStatus,
} from '../utils/helpers';

const Actions = ({ onNav }) => {
  const { jobs, quotes, invoices, bills, workOrders, purchaseOrders, contractors, reminders } = useAppStore();
  const today = new Date().toISOString().split("T")[0];
  const accent = SECTION_COLORS.actions.accent;

  // Build action items per category
  const categories = [
    {
      id: "overdue-reminders", label: "Overdue Reminders", color: "#f59e0b", nav: "reminders",
      items: reminders.filter(r => r.status === "pending" && r.dueDate < today).map(r => {
        const job = r.jobId ? jobs.find(j => j.id === r.jobId) : null;
        return { id: `rem-${r.id}`, title: r.text, sub: job?.title, detail: `Due ${r.dueDate}`, severity: "high" };
      }),
    },
    {
      id: "overdue-jobs", label: "Overdue Jobs", color: "#111", nav: "jobs",
      items: jobs.filter(j => j.dueDate && daysUntil(j.dueDate) < 0 && j.status !== "completed" && j.status !== "cancelled").map(j => {
        const client = SEED_CLIENTS.find(c => c.id === j.clientId);
        const days = Math.abs(daysUntil(j.dueDate));
        return { id: `job-${j.id}`, title: j.title, sub: client?.name, detail: `${days} day${days !== 1 ? "s" : ""} overdue`, severity: "high" };
      }),
    },
    {
      id: "overdue-orders", label: "Overdue Orders", color: "#2563eb", nav: "orders",
      items: [...workOrders, ...purchaseOrders].filter(o => !ORDER_TERMINAL.includes(o.status) && daysUntil(o.dueDate) < 0).map(o => {
        const job = o.jobId ? jobs.find(j => j.id === o.jobId) : null;
        const days = Math.abs(daysUntil(o.dueDate));
        return { id: `ord-${o.id}`, title: `${o.ref} — ${o.contractorName || o.supplierName || ""}`, sub: job?.title, detail: `${days} day${days !== 1 ? "s" : ""} overdue`, severity: "high" };
      }),
    },
    {
      id: "wo-awaiting", label: "Awaiting Acceptance", color: "#2563eb", nav: "orders",
      items: workOrders.filter(wo => wo.status === "Sent").map(wo => {
        const job = wo.jobId ? jobs.find(j => j.id === wo.jobId) : null;
        const days = wo.issueDate ? Math.abs(daysUntil(wo.issueDate)) : null;
        return { id: `woa-${wo.id}`, title: `${wo.ref} — ${wo.contractorName || ""}`, sub: job?.title, detail: days ? `Sent ${days} day${days !== 1 ? "s" : ""} ago` : "Sent", severity: "medium" };
      }),
    },
    {
      id: "bills", label: "Bills to Process", color: "#dc2626", nav: "bills",
      items: bills.filter(b => b.status === "inbox" || b.status === "linked" || b.status === "approved").map(b => {
        const job = b.jobId ? jobs.find(j => j.id === b.jobId) : null;
        return { id: `bill-${b.id}`, title: `${b.supplier} — ${b.invoiceNo || ""}`, sub: job?.title, detail: `$${(b.amount || 0).toLocaleString()} · ${b.status}`, severity: b.status === "inbox" ? "medium" : "low" };
      }),
    },
    {
      id: "invoices", label: "Unpaid Invoices", color: "#4f46e5", nav: "invoices",
      items: invoices.filter(i => i.status !== "paid" && i.status !== "void").map(inv => {
        const job = inv.jobId ? jobs.find(j => j.id === inv.jobId) : null;
        const total = (inv.lineItems || []).reduce((s, li) => s + (li.qty || 0) * (li.rate || 0), 0);
        const isOverdue = inv.dueDate && daysUntil(inv.dueDate) < 0;
        return { id: `inv-${inv.id}`, title: `${inv.number}`, sub: job?.title, detail: `$${total.toLocaleString()} · ${isOverdue ? "Overdue" : inv.status}`, severity: isOverdue ? "high" : "medium" };
      }),
    },
    {
      id: "compliance", label: "Compliance Issues", color: "#0d9488", nav: "contractors",
      items: contractors.flatMap(c => {
        const issues = [];
        COMPLIANCE_DOC_TYPES.forEach(dt => {
          const doc = (c.documents || []).find(d => d.type === dt.id);
          const status = getComplianceStatus(doc);
          if (status === "expired" || status === "missing") {
            issues.push({ id: `comp-${c.id}-${dt.id}`, title: c.name, sub: dt.label, detail: status === "expired" ? "Expired" : "Missing", severity: status === "expired" ? "high" : "medium" });
          }
        });
        return issues;
      }),
    },
    {
      id: "draft-quotes", label: "Draft Quotes", color: "#ca8a04", nav: "quotes",
      items: quotes.filter(q => q.status === "draft").map(q => {
        const job = q.jobId ? jobs.find(j => j.id === q.jobId) : null;
        const total = (q.lineItems || []).reduce((s, li) => s + (li.qty || 0) * (li.rate || 0), 0);
        return { id: `qt-${q.id}`, title: `${q.number}`, sub: job?.title, detail: `$${total.toLocaleString()} · Ready to send`, severity: "low" };
      }),
    },
  ].filter(c => c.items.length > 0);

  const totalCount = categories.reduce((s, c) => s + c.items.length, 0);
  const highSeverityItems = categories.flatMap(c => c.items.filter(i => i.severity === "high"));

  const [callStatus, setCallStatus] = useState(null);
  const triggerOutboundCall = async (member, tasks) => {
    const voiceServerUrl = import.meta.env.VITE_VOICE_SERVER_URL;
    if (!voiceServerUrl) { setCallStatus("Configure VITE_VOICE_SERVER_URL"); setTimeout(() => setCallStatus(null), 3000); return; }
    setCallStatus(`Calling ${member.name}...`);
    try {
      const res = await fetch(`${voiceServerUrl}/outbound-call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: member.phone, teamMemberName: member.name, tasks }) });
      const data = await res.json();
      setCallStatus(data.ok ? `Call to ${member.name} initiated` : `Failed: ${data.error}`);
    } catch (err) { setCallStatus(`Failed: ${err.message}`); }
    setTimeout(() => setCallStatus(null), 5000);
  };

  // Load outbound team from localStorage
  const outboundTeam = (() => {
    try { const s = localStorage.getItem("fieldops_outbound_settings"); return s ? JSON.parse(s).team?.filter(m => m.callEnabled) || [] : []; } catch { return []; }
  })();

  return (
    <div>
      {/* Summary */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: totalCount > 0 ? accent : "#059669" }}>{totalCount}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>{totalCount === 1 ? "item needs attention" : "items need attention"}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          {categories.map(c => (
            <span key={c.id} style={{ fontSize: 11, fontWeight: 600, background: hexToRgba(c.color, 0.1), color: c.color, padding: "3px 10px", borderRadius: 12 }}>{c.items.length} {c.label}</span>
          ))}
          {outboundTeam.length > 0 && highSeverityItems.length > 0 && (
            <div style={{ position: "relative", display: "inline-block" }}>
              <select onChange={e => { const m = outboundTeam.find(t => t.id === Number(e.target.value)); if (m) triggerOutboundCall(m, highSeverityItems); e.target.value = ""; }} style={{ padding: "4px 10px", background: accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', sans-serif", appearance: "none", paddingRight: 24 }} defaultValue="">
                <option value="" disabled>Call Team...</option>
                {outboundTeam.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <svg style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="5 8 10 13 15 8"/></svg>
            </div>
          )}
        </div>
      </div>
      {callStatus && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1d4ed8" }}>{callStatus}</div>
      )}

      {totalCount === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#aaa", fontSize: 14 }}>All clear — nothing needs attention right now.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {categories.map(cat => (
            <div key={cat.id}>
              {/* Category header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 4, height: 18, borderRadius: 2, background: cat.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{cat.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: cat.color, borderRadius: 10, padding: "1px 8px", minWidth: 18, textAlign: "center" }}>{cat.items.length}</span>
              </div>
              {/* Items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cat.items.map(item => (
                  <div key={item.id} onClick={() => onNav(cat.nav)} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                    {/* Severity dot */}
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: item.severity === "high" ? "#dc2626" : item.severity === "medium" ? "#f59e0b" : "#94a3b8", flexShrink: 0 }} />
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                      {item.sub && <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{item.sub}</div>}
                    </div>
                    {/* Detail */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: item.severity === "high" ? "#dc2626" : "#888", flexShrink: 0, textAlign: "right" }}>{item.detail}</div>
                    {/* Arrow */}
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="7 4 13 10 7 16"/></svg>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Actions;
