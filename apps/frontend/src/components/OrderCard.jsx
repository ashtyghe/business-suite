import { OrderIcon, OrderStatusBadge, DueDateChip, OrderProgressBar } from "./shared";
import { orderFmtDate } from "../utils/helpers";
import { ORDER_TERMINAL } from "../fixtures/seedData.jsx";
import s from './OrderCard.module.css';

const OrderCard = ({ type, order, onOpen, onDelete, jobs }) => {
  const isWO = type === "wo";
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const partyName = isWO ? order.contractorName : order.supplierName;
  const isTerminal = ORDER_TERMINAL.includes(order.status);
  const attachCount = (order.attachments || []).length;
  const hasPoLimit = order.poLimit && parseFloat(order.poLimit) > 0;
  return (
    <div className="order-card" onClick={() => onOpen(order)}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={isWO ? s.iconBoxWo : s.iconBoxPo}>
            <OrderIcon name={isWO ? "briefcase" : "shopping"} size={15} />
          </div>
          <div><div className={s.ref}>{order.ref}</div><div className={s.issueDate}>{orderFmtDate(order.issueDate)}</div></div>
        </div>
        <div className={s.headerRight}>
          <OrderStatusBadge status={order.status} />
          {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(order.id); }} className={s.deleteBtn} title="Delete"><OrderIcon name="trash" size={13} /></button>}
        </div>
      </div>
      <div className={s.partyName}>
        {partyName || <span className={s.partyPlaceholder}>{"No " + (isWO ? "contractor" : "supplier")}</span>}
      </div>
      {jd && <div className={s.linkedJob}><OrderIcon name="link" size={10} /> {jd.ref + " · " + jd.name}</div>}
      <div className={s.tagsRow}>
        {hasPoLimit && <span className={s.poLimitBadge}>${parseFloat(order.poLimit).toLocaleString("en-AU")} limit</span>}
        {attachCount > 0 && <span className={s.attachBadge}><OrderIcon name="paperclip" size={10} /> {attachCount}</span>}
      </div>
      <OrderProgressBar status={order.status} />
      <div className={s.footer}>
        <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
        <span className={s.openHint}><OrderIcon name="eye" size={11} /> Open</span>
      </div>
    </div>
  );
};

export { OrderCard };
