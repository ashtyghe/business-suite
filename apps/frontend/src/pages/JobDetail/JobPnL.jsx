import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { Icon } from "../../components/Icon";
import { SectionLabel } from "../../components/shared";
import { fmt, calcQuoteTotal, addLog } from "../../utils/helpers";
import s from './JobPnL.module.css';

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
    const st = (staff || []).find(x => x.name === t.worker);
    const rate = st?.costRate || 55;
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
        <td className={s.cellBold}>{label}</td>
        <td className={s.cellRight}>{fmt(estimated)}</td>
        <td className={s.cellRight}>{fmt(actual)}</td>
        <td className={s.cellRightBold} style={{ color: overBudget ? "#dc2626" : "#059669" }}>{variance >= 0 ? "+" : ""}{fmt(variance)}</td>
        <td className={s.cellRight} style={{ color: overBudget ? "#dc2626" : "#059669" }}>{pct}%</td>
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
      <div className={s.heroGrid}>
        <div className={s.statCard}>
          <div className={s.statLabel}>Total Estimate</div>
          <div className={s.statValue}>{totalEstimate > 0 ? fmt(totalEstimate) : "—"}</div>
          <div className={s.statSub}>{acceptedQuotesTotal > 0 ? `Incl. ${fmt(acceptedQuotesTotal)} quoted` : totalEstimate > 0 ? "Budget set" : "No estimate set"}</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>Revenue</div>
          <div className={s.statValue}>{fmt(revenue)}</div>
          <div className={s.statSub}>{revenueLabel}{totalPaid > 0 ? ` · ${fmt(totalPaid)} paid` : ""}</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>Total Costs</div>
          <div className={s.statValue} style={{ color: totalEstimate > 0 && totalActual > totalEstimate ? "#dc2626" : "#111" }}>{fmt(totalActual)}</div>
          {totalEstimate > 0 && <div className={s.costBarTrack}>
            <div className={s.costBarBg}>
              <div className={s.costBarFill} style={{ width: `${costPct}%`, background: costPct > 90 ? "#dc2626" : costPct > 70 ? "#d97706" : "#059669" }} />
            </div>
            <div className={s.costBarLabel}>{costPct}% of estimate</div>
          </div>}
        </div>
        <div className={s.profitCard} style={{ background: profit >= 0 ? "#ecfdf5" : "#fef2f2", borderLeft: `3px solid ${profit >= 0 ? "#059669" : "#dc2626"}` }}>
          <div className={s.statLabel} style={{ color: profit >= 0 ? "#059669" : "#dc2626" }}>Profit / Margin</div>
          <div className={s.statValue} style={{ color: profit >= 0 ? "#059669" : "#dc2626" }}>{fmt(profit)}</div>
          <div className={s.statSub}>{marginPct}% margin</div>
        </div>
      </div>

      {/* Estimate Breakdown */}
      <SectionLabel>Estimate Breakdown</SectionLabel>
      {!editingEstimate ? (
        <div className={s.sectionBlock}>
          <table className="data-table" style={{ marginBottom: 8 }}>
            <tbody>
              {[["Labour", est.labour], ["Materials", est.materials], ["Subcontractors", est.subcontractors], ["Other", est.other]].map(([label, val]) => (
                <tr key={label}><td className={s.cellBold}>{label}</td><td className={s.cellRight}>{fmt(val || 0)}</td></tr>
              ))}
              <tr className={s.totalRow}><td className={s.totalCell}>Total</td><td className={s.totalCellRight}>{fmt(breakdownTotal)}</td></tr>
            </tbody>
          </table>
          <button onClick={() => setEditingEstimate(true)} className="btn btn-secondary btn-sm"><Icon name="edit" size={12} /> Edit Estimate</button>
        </div>
      ) : (
        <div className={s.estimateForm}>
          {["labour", "materials", "subcontractors", "other"].map(key => (
            <div key={key} className={s.estimateRow}>
              <label className={s.estimateLabel}>{key}</label>
              <input type="number" className="form-control" style={{ width: 140 }} value={estimateForm[key] || ""} onChange={e => setEstimateForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))} />
            </div>
          ))}
          <div className={s.estimateActions}>
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
            <th className={s.thCell}>Category</th>
            <th className={s.thCellRight}>Estimated</th>
            <th className={s.thCellRight}>Actual</th>
            <th className={s.thCellRight}>Variance</th>
            <th className={s.thCellRight}>%</th>
          </tr>
        </thead>
        <tbody>
          {varRow("Labour", est.labour || 0, actualLabour)}
          {varRow("Materials", est.materials || 0, actualMaterials)}
          {varRow("Subcontractors", est.subcontractors || 0, actualSubs)}
          {varRow("Other", est.other || 0, actualOther)}
          <tr className={s.totalRow} style={{ fontWeight: 700 }}>
            <td className={s.totalCell}>Total</td>
            <td className={s.totalCellRight}>{fmt(breakdownTotal)}</td>
            <td className={s.totalCellRight}>{fmt(totalActual)}</td>
            <td className={s.totalCellRight} style={{ color: breakdownTotal - totalActual >= 0 ? "#059669" : "#dc2626" }}>{breakdownTotal - totalActual >= 0 ? "+" : ""}{fmt(breakdownTotal - totalActual)}</td>
            <td className={s.cellRight} style={{ color: breakdownTotal > 0 && totalActual > breakdownTotal ? "#dc2626" : "#059669" }}>{breakdownTotal > 0 ? Math.round((totalActual / breakdownTotal) * 100) : 0}%</td>
          </tr>
        </tbody>
      </table>

      {/* Cost Breakdown */}
      <SectionLabel>Cost Breakdown</SectionLabel>
      <div className={s.costGrid}>
        <div>
          <div className={s.costHeading}>Labour (from time entries)</div>
          {Object.entries(labourByWorker).map(([name, w]) => (
            <div key={name} className={s.costRow}>
              <span>{name} ({w.hours}h × {fmt(w.rate)}/h)</span>
              <span className={s.costRowValue}>{fmt(w.cost)}</span>
            </div>
          ))}
          {Object.keys(labourByWorker).length === 0 && <div className={s.emptyText}>No time logged</div>}
        </div>
        <div>
          <div className={s.costHeading}>Bills by Category</div>
          {[["Materials", actualMaterials], ["Subcontractor", actualSubs], ["Other", actualOther]].map(([cat, total]) => (
            <div key={cat} className={s.costRow}>
              <span>{cat}</span>
              <span className={s.costRowValue}>{fmt(total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue at Client Rates */}
      {clientLabourRate > 0 && (
        <>
          <SectionLabel>Revenue at Client Rates</SectionLabel>
          <div className={s.clientRatesBox}>
            <div className={s.clientRatesInfo}>
              Rates: {fmt(clientLabourRate)}/hr labour · {clientMatMargin}% material margin · {clientSubMargin}% subcontractor margin
            </div>
            <table className="data-table">
              <tbody>
                <tr><td className={s.cellMd}>Labour ({totalLabourHours}h × {fmt(clientLabourRate)})</td><td className={s.cellMdRight}>{fmt(clientLabourRevenue)}</td></tr>
                <tr><td className={s.cellMd}>Materials {clientMatMargin > 0 ? `(+${clientMatMargin}%)` : ""}</td><td className={s.cellMdRight}>{fmt(clientMaterialRevenue)}</td></tr>
                <tr><td className={s.cellMd}>Subcontractors {clientSubMargin > 0 ? `(+${clientSubMargin}%)` : ""}</td><td className={s.cellMdRight}>{fmt(clientSubRevenue)}</td></tr>
                <tr><td className={s.cellMd}>Other</td><td className={s.cellMdRight}>{fmt(actualOther)}</td></tr>
                <tr className={s.totalRow}>
                  <td className={s.totalCell}>Total Revenue</td>
                  <td className={s.totalCellRight}>{fmt(clientTotalRevenue)}</td>
                </tr>
                <tr>
                  <td className={s.totalCell} style={{ color: clientProfit >= 0 ? "#059669" : "#dc2626" }}>Profit</td>
                  <td className={s.totalCellRight} style={{ color: clientProfit >= 0 ? "#059669" : "#dc2626" }}>{fmt(clientProfit)} ({clientMarginPct}%)</td>
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
