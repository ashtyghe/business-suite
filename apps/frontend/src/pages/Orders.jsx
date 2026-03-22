import { useState, useMemo } from "react";
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

const OrdersPage = () => {
  const { workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders, jobs, companyInfo } = useAppStore();
  const auth = useAuth();
  const canDeleteOrder = auth.isAdmin || auth.isLocalDev;
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("all");
  const [view, setView] = useState("grid");
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
  const accentColor = "#2563eb";
  const orderStatusColors = { Draft: "#888", Approved: "#7c3aed", Sent: "#2563eb", Viewed: "#0891b2", Accepted: "#16a34a", Completed: "#111", Billed: "#059669", Cancelled: "#dc2626" };
  const summaryStatuses = ORDER_STATUSES.filter(s => s !== "Cancelled");
  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 12, marginBottom: 24 }}>
        {summaryStatuses.map(status => {
          const count = allOrders.filter(o => o.status === status).length;
          const woCount = allOrders.filter(o => o.status === status && o._type === "wo").length;
          const poCount = allOrders.filter(o => o.status === status && o._type === "po").length;
          const color = orderStatusColors[status];
          return (
            <div key={status} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}`, cursor: "pointer" }}
              onClick={() => { setFilterStatus(status); setView("list"); }}>
              <div className="stat-label">{status}</div>
              <div className="stat-value" style={{ fontSize: 22, color }}>{count}</div>
              <div className="stat-sub">{woCount} WO · {poCount} PO</div>
            </div>
          );
        })}
      </div>

      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120, maxWidth: 320 }}>
          <Icon name="search" size={14} />
          <input placeholder="Search orders, jobs, contractors..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control" style={{ width: "auto", minWidth: 120 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="wo">Work Orders</option>
          <option value="po">Purchase Orders</option>
        </select>
        <select className="form-control" style={{ width: "auto", minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="All">All Statuses</option>
          {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accentColor, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accentColor, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: accentColor, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns">
          <button className="btn btn-primary" style={{ background: "#2563eb" }} onClick={() => openNew("wo")}><OrderIcon name="plus" size={14} /> New WO</button>
          <button className="btn btn-primary" style={{ background: "#059669" }} onClick={() => openNew("po")}><OrderIcon name="plus" size={14} /> New PO</button>
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
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colOrders.length}</span>
                </div>
                {colOrders.map(o => {
                  const jd = orderJobDisplay(jobs.find(j => j.id === o.jobId));
                  const partyName = o._type === "wo" ? o.contractorName : o.supplierName;
                  return (
                    <div key={o._type + o.id} className="kanban-card" onClick={() => openOrder(o._type, o, "view")}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: o._type === "wo" ? "#dbeafe" : "#d1fae5", color: o._type === "wo" ? "#2563eb" : "#059669" }}>{o._type === "wo" ? "WO" : "PO"}</span>
                        <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{o.ref}</span>
                      </div>
                      {partyName && <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{partyName}</div>}
                      {jd && <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{jd.ref} · {jd.name}</div>}
                      {o.dueDate && <div style={{ fontSize: 11, marginBottom: 4 }}><DueDateChip dateStr={o.dueDate} isTerminal={ORDER_TERMINAL.includes(o.status)} /></div>}
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
        <div style={{ overflowX: "auto" }}>
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
                <tr key={o._type + o.id} style={{ cursor: "pointer" }} onClick={() => openOrder(o._type, o, "view")}>
                  <td><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: o._type === "wo" ? "#dbeafe" : "#d1fae5", color: o._type === "wo" ? "#2563eb" : "#059669" }}>{o._type === "wo" ? "WO" : "PO"}</span></td>
                  <td style={{ fontWeight: 600 }}>{o.ref}</td>
                  <td>{partyName || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>}</td>
                  <td>{jd ? jd.ref + " · " + jd.name : "—"}</td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td>{orderFmtDate(o.issueDate)}</td>
                  <td><DueDateChip dateStr={o.dueDate} isTerminal={ORDER_TERMINAL.includes(o.status)} /></td>
                  {canDeleteOrder && <td><button onClick={e => { e.stopPropagation(); handleDelete(o._type, o.id); }} style={{ padding: 4, background: "none", border: "none", color: "#cbd5e1", cursor: "pointer" }} title="Delete"><Icon name="delete" size={14} /></button></td>}
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

export default OrdersPage;
