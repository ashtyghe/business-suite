import { useState, useMemo, memo } from "react";
import { useAppStore } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import {
  ORDER_STATUSES, ORDER_TERMINAL,
} from '../fixtures/seedData.jsx';
import { orderJobDisplay, orderFmtDate } from '../utils/helpers';
import { Icon } from '../components/Icon';
import {
  OrderIcon, OrderStatusBadge, DueDateChip,
} from '../components/shared';
import { OrderCard } from '../components/OrderCard';
import { OrderDrawer } from '../components/OrderDrawer';
import s from './Orders.module.css';

const OrdersPage = () => {
  const { workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders, jobs, companyInfo, sectionView: view, setSectionView: setView } = useAppStore();
  const auth = useAuth();
  const canDeleteOrder = auth.isAdmin || auth.isLocalDev;
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("all");
  const allOrders = useMemo(() => [
    ...workOrders.map(o => ({ ...o, _type: "wo" })),
    ...purchaseOrders.map(o => ({ ...o, _type: "po" }))
  ], [workOrders, purchaseOrders]);
  const filtered = useMemo(() => {
    return allOrders.filter(o => {
      const partyName = o._type === "wo" ? o.contractorName : o.supplierName;
      const jd = orderJobDisplay(jobs.find(j => j.id === o.jobId));
      const q = search.toLowerCase();
      const matchSearch = !search || o.ref.toLowerCase().includes(q) || (partyName || "").toLowerCase().includes(q) || (jd?.name || "").toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q) || (o.notes || "").toLowerCase().includes(q) || (o.items || []).some(i => (i.description || "").toLowerCase().includes(q)) || (o.status || "").toLowerCase().includes(q);
      const matchStatus = filterStatus === "All" || o.status === filterStatus;
      const matchType = filterType === "all" || o._type === filterType;
      return matchSearch && matchStatus && matchType;
    });
  }, [allOrders, search, filterStatus, filterType, jobs]);
  const openNew = (t) => setModal({ type: t, order: null });
  const openOrder = (type, order, mode = "view") => setModal({ type, order, mode });
  const handleSave = (order) => {
    const target = modal.type === "wo" ? setWorkOrders : setPurchaseOrders;
    target(prev => { const exists = prev.find(o => o.id === order.id); return exists ? prev.map(o => o.id === order.id ? order : o) : [...prev, order]; });
    setModal(m => m ? { ...m, order } : null);
  };
  const handleDelete = (type, id) => { if (!window.confirm("Delete this order?")) return; (type === "wo" ? setWorkOrders : setPurchaseOrders)(prev => prev.filter(o => o.id !== id)); };
  const orderStatusColors = { Draft: "#888", Approved: "#7c3aed", Sent: "#2563eb", Viewed: "#0891b2", Accepted: "#16a34a", Completed: "#111", Billed: "#059669", Cancelled: "#dc2626" };
  const summaryStatuses = ["Draft", "Sent", "Accepted", "Completed"];
  return (
    <div>
      {/* ── Summary strip */}
      <div className={s.summaryGrid}>
        {summaryStatuses.map(status => {
          const count = allOrders.filter(o => o.status === status).length;
          const woCount = allOrders.filter(o => o.status === status && o._type === "wo").length;
          const poCount = allOrders.filter(o => o.status === status && o._type === "po").length;
          const color = orderStatusColors[status];
          return (
            <div key={status} className={`stat-card ${s.summaryCard}`} style={{ borderTop: `3px solid ${color}` }}
              onClick={() => { setFilterStatus(status); setView("list"); }}>
              <div className="stat-label">{status}</div>
              <div className={`stat-value ${s.summaryValue}`} style={{ color }}>{count}</div>
              <div className="stat-sub">{woCount} WO · {poCount} PO</div>
            </div>
          );
        })}
      </div>

      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} />
          <input placeholder="Search orders, jobs, contractors..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={`form-control ${s.filterSelect}`} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="wo">Work Orders</option>
          <option value="po">Purchase Orders</option>
        </select>
        <select className={`form-control ${s.filterSelectWide}`} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="All">All Statuses</option>
          {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: "#2563eb", color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: "#2563eb", color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: "#2563eb", color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns">
          <button className={`btn btn-primary ${s.newWoBtn}`} onClick={() => openNew("wo")}><OrderIcon name="plus" size={14} /> New WO</button>
          <button className={`btn btn-primary ${s.newPoBtn}`} onClick={() => openNew("po")}><OrderIcon name="plus" size={14} /> New PO</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-text">No orders found</div>
          <div className="empty-state-sub">Try adjusting your filters or create a new order</div>
        </div>
      ) : view === "kanban" ? (
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${ORDER_STATUSES.filter(s => s !== "Cancelled").length}, minmax(200px,1fr))` }}>
          {ORDER_STATUSES.filter(s => s !== "Cancelled").map(col => {
            const colOrders = filtered.filter(o => o.status === col);
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{col}</span>
                  <span className={s.kanbanBadge}>{colOrders.length}</span>
                </div>
                {colOrders.map(o => {
                  const jd = orderJobDisplay(jobs.find(j => j.id === o.jobId));
                  const partyName = o._type === "wo" ? o.contractorName : o.supplierName;
                  return (
                    <div key={o._type + o.id} className="kanban-card" onClick={() => openOrder(o._type, o, "view")}>
                      <div className={s.kanbanCardHeader}>
                        <span className={`${s.typeBadge} ${o._type === "wo" ? s.typeBadgeWo : s.typeBadgePo}`}>{o._type === "wo" ? "WO" : "PO"}</span>
                        <span className={s.kanbanRef}>{o.ref}</span>
                      </div>
                      {partyName && <div className={s.kanbanParty}>{partyName}</div>}
                      {jd && <div className={s.kanbanJob}>{jd.ref} · {jd.name}</div>}
                      {o.dueDate && <div className={s.kanbanDue}><DueDateChip dateStr={o.dueDate} isTerminal={ORDER_TERMINAL.includes(o.status)} /></div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : view === "grid" ? (
        <div className="order-cards-grid">{filtered.map(o => <OrderCard key={o._type + o.id} type={o._type} order={o} jobs={jobs} onOpen={o => openOrder(o._type || (workOrders.find(w => w.id === o.id) ? "wo" : "po"), o, "view")} onDelete={canDeleteOrder ? (id) => handleDelete(o._type, id) : null} />)}</div>
      ) : (
        <div className={s.tableWrap}>
          <table className="data-table">
            <thead><tr>
              <th>TYPE</th>
              <th>REF</th>
              <th>CONTRACTOR / SUPPLIER</th>
              <th>JOB</th>
              <th>STATUS</th>
              <th>ISSUE DATE</th>
              <th>DUE DATE</th>
              <th></th>
            </tr></thead>
            <tbody>{filtered.map(o => {
              const jd = orderJobDisplay(jobs.find(j => j.id === o.jobId));
              const partyName = o._type === "wo" ? o.contractorName : o.supplierName;
              return (
                <tr key={o._type + o.id} className={s.clickableRow} onClick={() => openOrder(o._type, o, "view")}>
                  <td><span className={`${s.typeBadge} ${o._type === "wo" ? s.typeBadgeWo : s.typeBadgePo}`}>{o._type === "wo" ? "WO" : "PO"}</span></td>
                  <td className={s.refCell}>{o.ref}</td>
                  <td>{partyName || <span className={s.emptyParty}>—</span>}</td>
                  <td>{jd ? jd.ref + " · " + jd.name : "—"}</td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td>{orderFmtDate(o.issueDate)}</td>
                  <td><DueDateChip dateStr={o.dueDate} isTerminal={ORDER_TERMINAL.includes(o.status)} /></td>
                  {canDeleteOrder && <td><button onClick={e => { e.stopPropagation(); handleDelete(o._type, o.id); }} className={s.deleteBtn} title="Delete"><Icon name="delete" size={14} /></button></td>}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {modal && <OrderDrawer type={modal.type} order={modal.order} initialMode={modal.order ? (modal.mode || "view") : "edit"} onSave={handleSave} onClose={() => setModal(null)} jobs={jobs} companyInfo={companyInfo} onTransition={(updated) => { (modal.type === "wo" ? setWorkOrders : setPurchaseOrders)(prev => prev.map(o => o.id === updated.id ? updated : o)); setModal(m => m ? { ...m, order: updated } : null); }} />}
    </div>
  );
};

export default memo(OrdersPage);
