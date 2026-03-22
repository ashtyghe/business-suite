import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { Icon } from "../../components/Icon";
import { SectionLabel } from "../../components/shared";
import { fmt, calcQuoteTotal, addLog } from "../../utils/helpers";

const defaultEstimate = { labour: 0, materials: 0, subcontractors: 0, other: 0 };

const JobPnL = ({ job, client }) => {
  const { quotes, invoices, timeEntries, bills, staff, jobs, setJobs } = useAppStore();
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [estimateForm, setEstimateForm] = useState({ ...defaultEstimate, ...(job.estimate || {}) });

  const jobQuotes = quotes.filter(q => q.jobId === job.id);
  const jobInvoices = invoices.filter(i => i.jobId === job.id);
  const jobTime = timeEntries.filter(t => t.jobId === job.id);
  const jobBills = bills.filter(b => b.jobId === job.id);

  const totalQuoted = jobQuotes.filter(q => q.status === "accepted").reduce((s, q) => s + calcQuoteTotal(q), 0);
  const totalInvoiced = jobInvoices.reduce((s, i) => s + calcQuoteTotal(i), 0);
  const totalPaid = jobInvoices.filter(i => i.status === "paid").reduce((s, i) => s + calcQuoteTotal(i), 0);

  const est = job.estimate || defaultEstimate;
  const breakdownTotal = (est.labour || 0) + (est.materials || 0) + (est.subcontractors || 0) + (est.other || 0);
  const acceptedQuotesTotal = jobQuotes.filter(q => q.status === "accepted").reduce((s, q) => s + calcQuoteTotal(q), 0);
  const totalEstimate = acceptedQuotesTotal > 0 ? Math.max(breakdownTotal, acceptedQuotesTotal) : breakdownTotal;

  const clientRates = client?.rates || {};
  const clientLabourRate = clientRates.labourRate || 0;
  const clientMatMargin = clientRates.materialMargin || 0;
  const clientSubMargin = clientRates.subcontractorMargin || 0;

  const revenue = totalQuoted > 0 ? totalQuoted : totalInvoiced;
  const revenueLabel = totalQuoted > 0 ? "Quoted (Accepted)" : "Invoiced";

  const labourByWorker = {};
  jobTime.forEach(t => {
    const s = (staff || []).find(x => x.name === t.worker);
    const rate = s?.costRate || 55;
    if (!labourByWorker[t.worker]) labourByWorker[t.worker] = { hours: 0, cost: 0, rate };
    labourByWorker[t.worker].hours += t.hours;
    labourByWorker[t.worker].cost += t.hours * rate;
  });
  const actualLabour = Object.values(labourByWorker).reduce((s, w) => s + w.cost, 0);
  const matBills = jobBills.filter(b => b.category === "Materials");
  const actualMaterials = matBills.reduce((s, b) => s + b.amount, 0);
  const subBills = jobBills.filter(b => b.category === "Subcontractor");
  const actualSubs = subBills.reduce((s, b) => s + b.amount, 0);
  const otherBills = jobBills.filter(b => b.category !== "Materials" && b.category !== "Subcontractor");
  const actualOther = otherBills.reduce((s, b) => s + b.amount, 0);
  const totalActual = actualLabour + actualMaterials + actualSubs + actualOther;

  const totalLabourHours = Object.values(labourByWorker).reduce((s, w) => s + w.hours, 0);
  const clientLabourRevenue = totalLabourHours * clientLabourRate;
  const clientMaterialRevenue = clientMatMargin > 0 ? actualMaterials * (1 + clientMatMargin / 100) : actualMaterials;
  const clientSubRevenue = clientSubMargin > 0 ? actualSubs * (1 + clientSubMargin / 100) : actualSubs;
  const clientTotalRevenue = clientLabourRevenue + clientMaterialRevenue + clientSubRevenue + actualOther;
  const clientProfit = clientTotalRevenue - totalActual;
  const clientMarginPct = clientTotalRevenue > 0 ? Math.round((clientProfit / clientTotalRevenue) * 100) : 0;

  const profit = revenue - totalActual;
  const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
  const costPct = totalEstimate > 0 ? Math.min(100, Math.round((totalActual / totalEstimate) * 100)) : 0;

  const varRow = (label, estimated, actual) => {
    const variance = estimated - actual;
    const pct = estimated > 0 ? Math.round((actual / estimated) * 100) : (actual > 0 ? 999 : 0);
    const overBudget = actual > estimated && estimated > 0;
    return (
      <tr key={label}>
        <td style={{ fontWeight: 600, fontSize: 13 }}>{label}</td>
        <td style={{ textAlign: "right", fontSize: 13 }}>{fmt(estimated)}</td>
        <td style={{ textAlign: "right", fontSize: 13 }}>{fmt(actual)}</td>
        <td style={{ textAlign: "right", fontSize: 13, color: overBudget ? "#dc2626" : "#059669", fontWeight: 600 }}>{variance >= 0 ? "+" : ""}{fmt(variance)}</td>
        <td style={{ textAlign: "right", fontSize: 13, color: overBudget ? "#dc2626" : "#059669" }}>{pct}%</td>
      </tr>
    );
  };

  const saveEstimate = () => {
    setJobs(js => js.map(j => j.id === job.id ? { ...j, estimate: { ...estimateForm }, activityLog: addLog(j.activityLog, "Updated job estimate") } : j));
    setEditingEstimate(false);
  };

  return (
    <div>
      {/* Hero stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Total Estimate</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{totalEstimate > 0 ? fmt(totalEstimate) : "—"}</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{acceptedQuotesTotal > 0 ? `Incl. ${fmt(acceptedQuotesTotal)} quoted` : totalEstimate > 0 ? "Budget set" : "No estimate set"}</div>
        </div>
        <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Revenue</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{fmt(revenue)}</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{revenueLabel}{totalPaid > 0 ? ` · ${fmt(totalPaid)} paid` : ""}</div>
        </div>
        <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Total Costs</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: totalEstimate > 0 && totalActual > totalEstimate ? "#dc2626" : "#111" }}>{fmt(totalActual)}</div>
          {totalEstimate > 0 && <div style={{ marginTop: 6 }}>
            <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${costPct}%`, height: "100%", background: costPct > 90 ? "#dc2626" : costPct > 70 ? "#d97706" : "#059669", borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{costPct}% of estimate</div>
          </div>}
        </div>
        <div style={{ background: profit >= 0 ? "#ecfdf5" : "#fef2f2", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${profit >= 0 ? "#059669" : "#dc2626"}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: profit >= 0 ? "#059669" : "#dc2626", marginBottom: 6 }}>Profit / Margin</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: profit >= 0 ? "#059669" : "#dc2626" }}>{fmt(profit)}</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{marginPct}% margin</div>
        </div>
      </div>

      {/* Estimate Breakdown */}
      <SectionLabel>Estimate Breakdown</SectionLabel>
      {!editingEstimate ? (
        <div style={{ marginBottom: 20 }}>
          <table className="data-table" style={{ marginBottom: 8 }}>
            <tbody>
              {[["Labour", est.labour], ["Materials", est.materials], ["Subcontractors", est.subcontractors], ["Other", est.other]].map(([label, val]) => (
                <tr key={label}><td style={{ fontWeight: 600, fontSize: 13 }}>{label}</td><td style={{ textAlign: "right", fontSize: 13 }}>{fmt(val || 0)}</td></tr>
              ))}
              <tr style={{ borderTop: "2px solid #e2e8f0" }}><td style={{ fontWeight: 700, fontSize: 13 }}>Total</td><td style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmt(breakdownTotal)}</td></tr>
            </tbody>
          </table>
          <button onClick={() => setEditingEstimate(true)} className="btn btn-secondary btn-sm"><Icon name="edit" size={12} /> Edit Estimate</button>
        </div>
      ) : (
        <div style={{ marginBottom: 20, padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          {["labour", "materials", "subcontractors", "other"].map(key => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <label style={{ width: 120, fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{key}</label>
              <input type="number" className="form-control" style={{ width: 140 }} value={estimateForm[key] || ""} onChange={e => setEstimateForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={saveEstimate} className="btn btn-primary btn-sm">Save Estimate</button>
            <button onClick={() => { setEditingEstimate(false); setEstimateForm({ ...defaultEstimate, ...(job.estimate || {}) }); }} className="btn btn-secondary btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Estimate vs Actual */}
      <SectionLabel>Estimate vs Actual</SectionLabel>
      <table className="data-table" style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={{ fontWeight: 700, fontSize: 12 }}>Category</th>
            <th style={{ textAlign: "right", fontWeight: 700, fontSize: 12 }}>Estimated</th>
            <th style={{ textAlign: "right", fontWeight: 700, fontSize: 12 }}>Actual</th>
            <th style={{ textAlign: "right", fontWeight: 700, fontSize: 12 }}>Variance</th>
            <th style={{ textAlign: "right", fontWeight: 700, fontSize: 12 }}>%</th>
          </tr>
        </thead>
        <tbody>
          {varRow("Labour", est.labour || 0, actualLabour)}
          {varRow("Materials", est.materials || 0, actualMaterials)}
          {varRow("Subcontractors", est.subcontractors || 0, actualSubs)}
          {varRow("Other", est.other || 0, actualOther)}
          <tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
            <td style={{ fontWeight: 700, fontSize: 13 }}>Total</td>
            <td style={{ textAlign: "right", fontSize: 13, fontWeight: 700 }}>{fmt(breakdownTotal)}</td>
            <td style={{ textAlign: "right", fontSize: 13, fontWeight: 700 }}>{fmt(totalActual)}</td>
            <td style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: breakdownTotal - totalActual >= 0 ? "#059669" : "#dc2626" }}>{breakdownTotal - totalActual >= 0 ? "+" : ""}{fmt(breakdownTotal - totalActual)}</td>
            <td style={{ textAlign: "right", fontSize: 13, color: breakdownTotal > 0 && totalActual > breakdownTotal ? "#dc2626" : "#059669" }}>{breakdownTotal > 0 ? Math.round((totalActual / breakdownTotal) * 100) : 0}%</td>
          </tr>
        </tbody>
      </table>

      {/* Cost Breakdown */}
      <SectionLabel>Cost Breakdown</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#555" }}>Labour (from time entries)</div>
          {Object.entries(labourByWorker).map(([name, w]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span>{name} ({w.hours}h × {fmt(w.rate)}/h)</span>
              <span style={{ fontWeight: 600 }}>{fmt(w.cost)}</span>
            </div>
          ))}
          {Object.keys(labourByWorker).length === 0 && <div style={{ color: "#bbb", fontSize: 12 }}>No time logged</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#555" }}>Bills by Category</div>
          {[["Materials", actualMaterials], ["Subcontractor", actualSubs], ["Other", actualOther]].map(([cat, total]) => (
            <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span>{cat}</span>
              <span style={{ fontWeight: 600 }}>{fmt(total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue at Client Rates */}
      {clientLabourRate > 0 && (
        <>
          <SectionLabel>Revenue at Client Rates</SectionLabel>
          <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
              Rates: {fmt(clientLabourRate)}/hr labour · {clientMatMargin}% material margin · {clientSubMargin}% subcontractor margin
            </div>
            <table className="data-table">
              <tbody>
                <tr><td style={{ fontSize: 13 }}>Labour ({totalLabourHours}h × {fmt(clientLabourRate)})</td><td style={{ textAlign: "right", fontSize: 13 }}>{fmt(clientLabourRevenue)}</td></tr>
                <tr><td style={{ fontSize: 13 }}>Materials {clientMatMargin > 0 ? `(+${clientMatMargin}%)` : ""}</td><td style={{ textAlign: "right", fontSize: 13 }}>{fmt(clientMaterialRevenue)}</td></tr>
                <tr><td style={{ fontSize: 13 }}>Subcontractors {clientSubMargin > 0 ? `(+${clientSubMargin}%)` : ""}</td><td style={{ textAlign: "right", fontSize: 13 }}>{fmt(clientSubRevenue)}</td></tr>
                <tr><td style={{ fontSize: 13 }}>Other</td><td style={{ textAlign: "right", fontSize: 13 }}>{fmt(actualOther)}</td></tr>
                <tr style={{ borderTop: "2px solid #e2e8f0" }}>
                  <td style={{ fontWeight: 700, fontSize: 13 }}>Total Revenue</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmt(clientTotalRevenue)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, fontSize: 13, color: clientProfit >= 0 ? "#059669" : "#dc2626" }}>Profit</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: clientProfit >= 0 ? "#059669" : "#dc2626" }}>{fmt(clientProfit)} ({clientMarginPct}%)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default JobPnL;
