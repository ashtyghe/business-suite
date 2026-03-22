import { useState, useMemo, memo } from "react";
import { useAppStore } from '../lib/store';
import {
  SECTION_COLORS, ORDER_TERMINAL, ViewField,
} from '../fixtures/seedData.jsx';
import { fmt } from '../utils/helpers';
import { Icon } from '../components/Icon';
import {
  OrderStatusBadge, SectionDrawer,
} from '../components/shared';

const Suppliers = () => {
  const { suppliers, setSuppliers, purchaseOrders, bills } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [mode, setMode] = useState("edit");
  const [form, setForm] = useState({ name: "", contact: "", email: "", phone: "", abn: "", notes: "" });
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    return !search || s.name.toLowerCase().includes(q) || (s.contact || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q) || (s.phone || "").toLowerCase().includes(q) || (s.abn || "").toLowerCase().includes(q) || (s.notes || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q);
  });

  const openNew = () => { setEditItem(null); setMode("edit"); setForm({ name: "", contact: "", email: "", phone: "", abn: "", notes: "" }); setShowModal(true); };
  const openEdit = (s) => { setEditItem(s); setMode("view"); setForm(s); setShowModal(true); };
  const save = () => {
    if (editItem) {
      setSuppliers(ss => ss.map(s => s.id === editItem.id ? { ...s, ...form } : s));
    } else {
      setSuppliers(ss => [...ss, { ...form, id: "s" + Date.now() }]);
    }
    setShowModal(false);
  };
  const del = (id) => { if (window.confirm("Delete this supplier?")) setSuppliers(ss => ss.filter(s => s.id !== id)); };
  const accent = SECTION_COLORS.suppliers.accent;

  const getPOCount = (s) => purchaseOrders.filter(po => po.supplierName === s.name || po.supplierId === s.id).length;
  const getActivePOs = (s) => purchaseOrders.filter(po => (po.supplierName === s.name || po.supplierId === s.id) && !ORDER_TERMINAL.includes(po.status));
  const getBillCount = (s) => bills.filter(b => b.supplier === s.name).length;

  const kanbanGroups = useMemo(() => {
    const groups = { "Active POs": [], "Bills Only": [], "Inactive": [] };
    filtered.forEach(s => {
      if (getActivePOs(s).length > 0) groups["Active POs"].push(s);
      else if (getBillCount(s) > 0) groups["Bills Only"].push(s);
      else groups["Inactive"].push(s);
    });
    return groups;
  }, [filtered, purchaseOrders, bills]);

  return (
    <div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers..." />
        </div>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "" : "btn-ghost"}`} style={view === "kanban" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: accent }} onClick={openNew}><Icon name="plus" size={14} />New Supplier</button></div>
      </div>

      {view === "list" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>ABN</th><th>Phone</th><th>POs</th><th>Bills</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">📦</div><div className="empty-state-text">No suppliers found</div></div></td></tr>}
                {filtered.map(s => (
                  <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => openEdit(s)}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td>{s.contact || "—"}</td>
                    <td style={{ color: "#666" }}>{s.email || "—"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "#888" }}>{s.abn || "—"}</td>
                    <td style={{ color: "#666" }}>{s.phone || "—"}</td>
                    <td><span style={{ fontWeight: 600, color: getActivePOs(s).length > 0 ? accent : "#ccc" }}>{getPOCount(s)}</span></td>
                    <td><span style={{ fontWeight: 600, color: getBillCount(s) > 0 ? "#dc2626" : "#ccc" }}>{getBillCount(s)}</span></td>
                    <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(s.id)}><Icon name="trash" size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}><div className="empty-state-icon">📦</div><div className="empty-state-text">No suppliers found</div></div>}
          {filtered.map(s => (
            <div key={s.id} className="card" onClick={() => openEdit(s)} style={{ cursor: "pointer", padding: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{s.name}</div>
              {s.contact && <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{s.contact}</div>}
              {s.email && <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{s.email}</div>}
              {s.phone && <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{s.phone}</div>}
              {s.abn && <div style={{ fontSize: 11, color: "#bbb", fontFamily: "monospace", marginBottom: 8 }}>ABN {s.abn}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className="chip" style={{ fontSize: 10 }}>{getPOCount(s)} PO{getPOCount(s) !== 1 ? "s" : ""}</span>
                  <span className="chip" style={{ fontSize: 10 }}>{getBillCount(s)} bill{getBillCount(s) !== 1 ? "s" : ""}</span>
                </div>
                <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={e => { e.stopPropagation(); del(s.id); }}><Icon name="trash" size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "kanban" && (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(3, minmax(200px,1fr))" }}>
          {Object.entries(kanbanGroups).map(([group, items]) => (
            <div key={group} className="kanban-col">
              <div className="kanban-col-header">
                <span>{group}</span>
                <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{items.length}</span>
              </div>
              {items.map(s => (
                <div key={s.id} className="kanban-card" onClick={() => openEdit(s)}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{s.name}</div>
                  {s.contact && <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{s.contact}</div>}
                  <div style={{ display: "flex", gap: 4 }}>
                    {getPOCount(s) > 0 && <span className="chip" style={{ fontSize: 10 }}>{getPOCount(s)} PO{getPOCount(s) > 1 ? "s" : ""}</span>}
                    {getBillCount(s) > 0 && <span className="chip" style={{ fontSize: 10 }}>{getBillCount(s)} bill{getBillCount(s) > 1 ? "s" : ""}</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {showModal && (() => {
        const isNew = !editItem;
        const linkedPOs = editItem ? purchaseOrders.filter(po => po.supplierName === editItem.name || po.supplierId === editItem.id) : [];
        const linkedBills = editItem ? bills.filter(b => b.supplier === editItem.name) : [];
        return (
          <SectionDrawer
            accent={accent}
            icon={<Icon name="suppliers" size={16} />}
            typeLabel="Supplier"
            title={editItem ? editItem.name : "New Supplier"}
            mode={mode} setMode={setMode}
            showToggle={!isNew} isNew={isNew}
            onClose={() => setShowModal(false)}
            footer={
              <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {mode === "edit" && <button className="btn btn-primary" style={{ background: accent }} onClick={save}><Icon name="check" size={14} />{isNew ? "Create" : "Save"}</button>}
              </div>
            }
          >
            <div style={{ padding: 20 }}>
              {mode === "view" ? (
                <>
                  <ViewField label="Name" value={form.name} />
                  <ViewField label="Contact" value={form.contact} />
                  <ViewField label="Email" value={form.email} />
                  <ViewField label="Phone" value={form.phone} />
                  <ViewField label="ABN" value={form.abn} />
                  <ViewField label="Notes" value={form.notes} />
                  {linkedPOs.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Purchase Orders</div>
                      {linkedPOs.map(po => (
                        <div key={po.id} style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <span style={{ fontWeight: 700 }}>{po.ref}</span>
                          <OrderStatusBadge status={po.status} />
                          {po.poLimit && <span style={{ float: "right", color: "#888" }}>${parseFloat(po.poLimit).toLocaleString()}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {linkedBills.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Bills</div>
                      {linkedBills.map(b => (
                        <div key={b.id} style={{ padding: "8px 12px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <span style={{ fontWeight: 700 }}>{b.supplier}</span>
                          {b.invoiceNo && <span style={{ color: "#999", marginLeft: 8 }}>{b.invoiceNo}</span>}
                          <span style={{ float: "right", fontWeight: 600 }}>{fmt(b.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="form-group"><label>Contact</label><input className="form-control" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
                  <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div className="form-group"><label>ABN</label><input className="form-control" value={form.abn} onChange={e => setForm(f => ({ ...f, abn: e.target.value }))} /></div>
                  <div className="form-group"><label>Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                </>
              )}
            </div>
          </SectionDrawer>
        );
      })()}
    </div>
  );
};

export default memo(Suppliers);
