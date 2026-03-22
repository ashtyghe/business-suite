import { useState, useEffect } from "react";
import { useAppStore } from '../lib/store';
import {
  SEED_CLIENTS, SECTION_COLORS, ORDER_TERMINAL,
} from '../fixtures/seedData.jsx';
import {
  daysUntil, hexToRgba,
  COMPLIANCE_DOC_TYPES, getComplianceStatus,
} from '../utils/helpers';
import { fetchOutboundDefaults } from '../lib/db';
import s from './Actions.module.css';

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

  // Load outbound team from Supabase
  const [outboundTeam, setOutboundTeam] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const settings = await fetchOutboundDefaults();
        if (settings?.team) setOutboundTeam(settings.team.filter(m => m.callEnabled));
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <div>
      {/* Summary */}
      <div className={s.summaryBar}>
        <div className={s.summaryCount}>
          <span className={s.countNumber} style={{ color: totalCount > 0 ? accent : "#059669" }}>{totalCount}</span>
          <span className={s.countLabel}>{totalCount === 1 ? "item needs attention" : "items need attention"}</span>
        </div>
        <div className={s.badgeRow}>
          {categories.map(c => (
            <span key={c.id} className={s.categoryBadge} style={{ background: hexToRgba(c.color, 0.1), color: c.color }}>{c.items.length} {c.label}</span>
          ))}
          {outboundTeam.length > 0 && highSeverityItems.length > 0 && (
            <div className={s.callSelectWrapper}>
              <select onChange={e => { const m = outboundTeam.find(t => t.id === Number(e.target.value)); if (m) triggerOutboundCall(m, highSeverityItems); e.target.value = ""; }} className={s.callSelect} style={{ background: accent }} defaultValue="">
                <option value="" disabled>Call Team...</option>
                {outboundTeam.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <svg className={s.callSelectArrow} width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="5 8 10 13 15 8"/></svg>
            </div>
          )}
        </div>
      </div>
      {callStatus && (
        <div className={s.callStatus}>{callStatus}</div>
      )}

      {totalCount === 0 ? (
        <div className={s.emptyState}>All clear — nothing needs attention right now.</div>
      ) : (
        <div className={s.categoriesList}>
          {categories.map(cat => (
            <div key={cat.id}>
              {/* Category header */}
              <div className={s.categoryHeader}>
                <div className={s.categoryStripe} style={{ background: cat.color }} />
                <span className={s.categoryLabel}>{cat.label}</span>
                <span className={s.categoryCount} style={{ background: cat.color }}>{cat.items.length}</span>
              </div>
              {/* Items */}
              <div className={s.itemsList}>
                {cat.items.map(item => (
                  <div key={item.id} onClick={() => onNav(cat.nav)} className={s.itemCard}>
                    {/* Severity dot */}
                    <div className={`${s.severityDot} ${item.severity === "high" ? s.severityHigh : item.severity === "medium" ? s.severityMedium : s.severityLow}`} />
                    {/* Content */}
                    <div className={s.itemContent}>
                      <div className={s.itemTitle}>{item.title}</div>
                      {item.sub && <div className={s.itemSub}>{item.sub}</div>}
                    </div>
                    {/* Detail */}
                    <div className={`${s.itemDetail} ${item.severity === "high" ? s.itemDetailHigh : s.itemDetailDefault}`}>{item.detail}</div>
                    {/* Arrow */}
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={s.itemArrow}><polyline points="7 4 13 10 7 16"/></svg>
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
