import { useState, memo } from "react";
import { useAppStore } from '../lib/store';
import {
  SECTION_COLORS, ORDER_TERMINAL, ViewField,
} from '../fixtures/seedData.jsx';
import { fmt } from '../utils/helpers';
import { Icon } from '../components/Icon';
import {
  OrderStatusBadge, SectionDrawer,
} from '../components/shared';
import { createSupplier, updateSupplier, deleteSupplier as dbDeleteSupplier } from '../lib/db';
import s from './Suppliers.module.css';

const Suppliers = () => {
  const { suppliers, setSuppliers, purchaseOrders, bills, sectionView: rawView, setSectionView: setView } = useAppStore();
  const view = rawView === "kanban" ? "list" : rawView;
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [mode, setMode] = useState("edit");
  const [form, setForm] = useState({ name: "", contact: "", email: "", phone: "", abn: "", notes: "" });
  const [search, setSearch] = useState("");

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    return !search || s.name.toLowerCase().includes(q) || (s.contact || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q) || (s.phone || "").toLowerCase().includes(q) || (s.abn || "").toLowerCase().includes(q) || (s.notes || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q);
  });

  const openNew = () => { setEditItem(null); setMode("edit"); setForm({ name: "", contact: "", email: "", phone: "", abn: "", notes: "" }); setShowModal(true); };
  const openEdit = (s) => { setEditItem(s); setMode("view"); setForm(s); setShowModal(true); };
  const save = async () => {
    try {
      if (editItem) {
        await updateSupplier(editItem.id, form);
        setSuppliers(ss => ss.map(s => s.id === editItem.id ? { ...s, ...form } : s));
      } else {
        const saved = await createSupplier(form);
        setSuppliers(ss => [...ss, saved]);
      }
      setShowModal(false);
    } catch (err) {
      console.error('Failed to save supplier:', err);
      alert('Failed to save supplier: ' + err.message);
    }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this supplier?")) return;
    try {
      await dbDeleteSupplier(id);
      setSuppliers(ss => ss.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to delete supplier:', err);
      alert('Failed to delete supplier: ' + err.message);
    }
  };
  const accent = SECTION_COLORS.suppliers.accent;

  const getPOCount = (s) => purchaseOrders.filter(po => po.supplierName === s.name || po.supplierId === s.id).length;
  const getActivePOs = (s) => purchaseOrders.filter(po => (po.supplierName === s.name || po.supplierId === s.id) && !ORDER_TERMINAL.includes(po.status));
  const getBillCount = (s) => bills.filter(b => b.supplier === s.name).length;

  return (
    <div>
      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers..." />
        </div>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
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
                {filtered.map(s2 => (
                  <tr key={s2.id} className={s.rowClickable} onClick={() => openEdit(s2)}>
                    <td className={s.nameCell}>{s2.name}</td>
                    <td>{s2.contact || "—"}</td>
                    <td className={s.mutedText}>{s2.email || "—"}</td>
                    <td className={s.abnCell}>{s2.abn || "—"}</td>
                    <td className={s.mutedText}>{s2.phone || "—"}</td>
                    <td><span className={getActivePOs(s2).length > 0 ? s.countActive : s.countInactive} style={getActivePOs(s2).length > 0 ? { color: accent } : undefined}>{getPOCount(s2)}</span></td>
                    <td><span className={getBillCount(s2) > 0 ? s.countActive : s.countInactive} style={getBillCount(s2) > 0 ? { color: "#dc2626" } : undefined}>{getBillCount(s2)}</span></td>
                    <td onClick={e => e.stopPropagation()}><button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(s2.id)}><Icon name="trash" size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && (
        <div className={s.gridLayout}>
          {filtered.length === 0 && <div className={`empty-state ${s.gridSpan}`}><div className="empty-state-icon">📦</div><div className="empty-state-text">No suppliers found</div></div>}
          {filtered.map(s2 => (
            <div key={s2.id} className={`card ${s.gridCard}`} onClick={() => openEdit(s2)}>
              <div className={s.gridCardName}>{s2.name}</div>
              {s2.contact && <div className={s.gridCardContact}>{s2.contact}</div>}
              {s2.email && <div className={s.gridCardSecondary}>{s2.email}</div>}
              {s2.phone && <div className={s.gridCardSecondary}>{s2.phone}</div>}
              {s2.abn && <div className={s.gridCardAbn}>ABN {s2.abn}</div>}
              <div className={s.gridCardFooter}>
                <div className={s.chipGroup}>
                  <span className={`chip ${s.chipSmall}`}>{getPOCount(s2)} PO{getPOCount(s2) !== 1 ? "s" : ""}</span>
                  <span className={`chip ${s.chipSmall}`}>{getBillCount(s2)} bill{getBillCount(s2) !== 1 ? "s" : ""}</span>
                </div>
                <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={e => { e.stopPropagation(); del(s2.id); }}><Icon name="trash" size={12} /></button>
              </div>
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
              <div className={s.drawerFooter}>
                {mode === "edit" && <button className="btn btn-primary" style={{ background: accent }} onClick={save}><Icon name="check" size={14} />{isNew ? "Create" : "Save"}</button>}
              </div>
            }
          >
            <div className={s.drawerBody}>
              {mode === "view" ? (
                <>
                  <ViewField label="Name" value={form.name} />
                  <ViewField label="Contact" value={form.contact} />
                  <ViewField label="Email" value={form.email} />
                  <ViewField label="Phone" value={form.phone} />
                  <ViewField label="ABN" value={form.abn} />
                  <ViewField label="Notes" value={form.notes} />
                  {linkedPOs.length > 0 && (
                    <div className={s.linkedSection}>
                      <div className={s.linkedSectionLabel}>Purchase Orders</div>
                      {linkedPOs.map(po => (
                        <div key={po.id} className={s.linkedItem}>
                          <span className={s.linkedItemRef}>{po.ref}</span>
                          <OrderStatusBadge status={po.status} />
                          {po.poLimit && <span className={s.linkedItemAmount}>${parseFloat(po.poLimit).toLocaleString()}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {linkedBills.length > 0 && (
                    <div className={s.linkedSection}>
                      <div className={s.linkedSectionLabel}>Bills</div>
                      {linkedBills.map(b => (
                        <div key={b.id} className={s.linkedItem}>
                          <span className={s.linkedItemRef}>{b.supplier}</span>
                          {b.invoiceNo && <span className={s.linkedItemInvoice}>{b.invoiceNo}</span>}
                          <span className={s.linkedItemTotal}>{fmt(b.amount)}</span>
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
