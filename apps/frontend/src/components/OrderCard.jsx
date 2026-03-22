import { OrderIcon, OrderStatusBadge, DueDateChip, OrderProgressBar } from "./shared";
import { orderFmtDate } from "../utils/helpers";
import { ORDER_TERMINAL } from "../fixtures/seedData.jsx";

const OrderCard = ({ type, order, onOpen, onDelete, jobs }) => {
  const isWO = type === "wo";
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const partyName = isWO ? order.contractorName : order.supplierName;
  const isTerminal = ORDER_TERMINAL.includes(order.status);
  const attachCount = (order.attachments || []).length;
  const hasPoLimit = order.poLimit && parseFloat(order.poLimit) > 0;
  return (
    <div className="order-card" onClick={() => onOpen(order)}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: isWO ? "#dbeafe" : "#d1fae5", color: isWO ? "#2563eb" : "#059669" }}>
            <OrderIcon name={isWO ? "briefcase" : "shopping"} size={15} />
          </div>
          <div><div style={{ fontWeight: 600, fontSize: 13 }}>{order.ref}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{orderFmtDate(order.issueDate)}</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <OrderStatusBadge status={order.status} />
          {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(order.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }} title="Delete"><OrderIcon name="trash" size={13} /></button>}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {partyName || <span style={{ fontStyle: "italic", color: "#94a3b8" }}>{"No " + (isWO ? "contractor" : "supplier")}</span>}
      </div>
      {jd && <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><OrderIcon name="link" size={10} /> {jd.ref + " · " + jd.name}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        {hasPoLimit && <span style={{ fontSize: 11, fontWeight: 600, color: "#b45309", background: "#fffbeb", padding: "2px 8px", borderRadius: 12, border: "1px solid #fcd34d" }}>${parseFloat(order.poLimit).toLocaleString("en-AU")} limit</span>}
        {attachCount > 0 && <span style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12, display: "flex", alignItems: "center", gap: 4 }}><OrderIcon name="paperclip" size={10} /> {attachCount}</span>}
      </div>
      <OrderProgressBar status={order.status} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
        <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
        <span style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 4 }}><OrderIcon name="eye" size={11} /> Open</span>
      </div>
    </div>
  );
};

export { OrderCard };
