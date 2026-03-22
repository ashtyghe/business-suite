import { useState, memo } from "react";
import { useAppStore } from '../lib/store';
import { createCustomer, updateCustomer, deleteCustomer, createSite, updateSite, deleteSite } from '../lib/db';
import { SECTION_COLORS, ViewField } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import { StatusBadge, SectionDrawer } from '../components/shared';

const Clients = () => {
  const { clients, setClients, jobs, templates } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [clientMode, setClientMode] = useState("edit");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", sites: [], mainContact: { name: "", phone: "", email: "" }, accountsContact: { name: "", phone: "", email: "" }, rates: { labourRate: 0, materialMargin: 0, subcontractorMargin: 0 } });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [view, setView] = useState("grid");
  const [expandedSites, setExpandedSites] = useState({});
  // Site sub-modal
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [editSite, setEditSite] = useState(null);
  const [siteClientId, setSiteClientId] = useState(null);
  const [siteForm, setSiteForm] = useState({ name: "", address: "", contactName: "", contactPhone: "", contactEmail: "" });

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const sites = c.sites || [];
    const matchSearch = !search ||
      c.name.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q) ||
      (c.mainContact?.name || "").toLowerCase().includes(q) ||
      (c.mainContact?.phone || "").toLowerCase().includes(q) ||
      (c.mainContact?.email || "").toLowerCase().includes(q) ||
      (c.accountsContact?.name || "").toLowerCase().includes(q) ||
      (c.accountsContact?.email || "").toLowerCase().includes(q) ||
      sites.some(s => (s.name || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q) || (s.contactName || "").toLowerCase().includes(q) || (s.contactPhone || "").toLowerCase().includes(q));
    const clientJobs = jobs.filter(j => j.clientId === c.id);
    const isActive = clientJobs.some(j => ["in_progress", "scheduled", "quoted", "draft"].includes(j.status));
    const matchStatus = filterStatus === "all" || (filterStatus === "active" ? isActive : !isActive);
    return matchSearch && matchStatus;
  });

  const openNew = () => {
    setEditClient(null);
    setClientMode("edit");
    setForm({ name: "", email: "", phone: "", address: "", sites: [], mainContact: { name: "", phone: "", email: "" }, accountsContact: { name: "", phone: "", email: "" }, rates: { labourRate: 0, materialMargin: 0, subcontractorMargin: 0 } });
    setShowModal(true);
  };
  const openEdit = (c) => {
    setEditClient(c);
    setClientMode("view");
    setForm({ ...c, sites: c.sites || [], mainContact: c.mainContact || { name: "", phone: "", email: "" }, accountsContact: c.accountsContact || { name: "", phone: "", email: "" }, rates: c.rates || { labourRate: 0, materialMargin: 0, subcontractorMargin: 0 } });
    setShowModal(true);
  };
  const save = async () => {
    try {
      if (editClient) {
        await updateCustomer(editClient.id, form);
        setClients(cs => cs.map(c => c.id === editClient.id ? { ...c, ...form } : c));
      } else {
        const saved = await createCustomer(form);
        setClients(cs => [...cs, { ...saved, sites: [] }]);
      }
    } catch (err) {
      console.error('Failed to save client:', err);
    }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteCustomer(id);
      setClients(cs => cs.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to delete client:', err);
    }
  };

  const toggleSites = (id) => setExpandedSites(s => ({ ...s, [id]: !s[id] }));

  // Site modal helpers
  const openNewSite = (clientId) => {
    setSiteClientId(clientId);
    setEditSite(null);
    setSiteForm({ name: "", address: "", contactName: "", contactPhone: "", contactEmail: "" });
    setShowSiteModal(true);
  };
  const openEditSite = (clientId, site) => {
    setSiteClientId(clientId);
    setEditSite(site);
    setSiteForm({ ...site });
    setShowSiteModal(true);
  };
  const saveSite = async () => {
    try {
      if (editSite) {
        const saved = await updateSite(editSite.id, siteForm);
        setClients(cs => cs.map(c => {
          if (c.id !== siteClientId) return c;
          return { ...c, sites: (c.sites || []).map(s => s.id === editSite.id ? saved : s) };
        }));
      } else {
        const saved = await createSite(siteClientId, siteForm);
        setClients(cs => cs.map(c => {
          if (c.id !== siteClientId) return c;
          return { ...c, sites: [...(c.sites || []), saved] };
        }));
      }
    } catch (err) {
      console.error('Failed to save site:', err);
    }
    setShowSiteModal(false);
  };
  const delSite = async (clientId, siteId) => {
    try {
      await deleteSite(siteId);
      setClients(cs => cs.map(c => c.id === clientId ? { ...c, sites: (c.sites||[]).filter(s => s.id !== siteId) } : c));
    } catch (err) {
      console.error('Failed to delete site:', err);
    }
  };

  return (
    <div>
      <div className="section-toolbar">
        <div className="search-bar" style={{ flex: 1, minWidth: 120 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Clients</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: SECTION_COLORS.clients.accent, color: '#fff' } : undefined} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: SECTION_COLORS.clients.accent, color: '#fff' } : undefined} onClick={() => setView("grid")}><Icon name="grid_view" size={12} /></button>
        </div>
        <div className="section-action-btns"><button className="btn btn-primary" style={{ background: SECTION_COLORS.clients.accent }} onClick={openNew}><Icon name="plus" size={14} />New Client</button></div>
      </div>

      {view === "list" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Sites</th><th>Jobs</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-text">No clients found</div></div></td></tr>}
                {filtered.map(client => {
                  const clientJobs = jobs.filter(j => j.clientId === client.id);
                  const active = clientJobs.filter(j => j.status === "in_progress").length;
                  return (
                    <tr key={client.id} onClick={() => openEdit(client)} style={{ cursor: "pointer" }}>
                      <td style={{ fontWeight: 600 }}>{client.name}</td>
                      <td style={{ fontSize: 12, color: "#555" }}>{client.mainContact?.name || "—"}</td>
                      <td style={{ fontSize: 12, color: "#666" }}>{client.email || "—"}</td>
                      <td style={{ fontSize: 12, color: "#666" }}>{client.phone || "—"}</td>
                      <td>{(client.sites || []).length}</td>
                      <td>{clientJobs.length}</td>
                      <td>{active > 0 ? <span className="chip" style={{ background: "#111", color: "#fff" }}>{active}</span> : "—"}</td>
                      <td onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(client.id)}><Icon name="trash" size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filtered.map(client => {
          const clientJobs = jobs.filter(j => j.clientId === client.id);
          const active = clientJobs.filter(j => j.status === "in_progress").length;
          const sites = client.sites || [];
          const sitesOpen = expandedSites[client.id];
          return (
            <div key={client.id} className="card">
              {/* Client header */}
              <div onClick={() => openEdit(client)} style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", transition: "background 0.15s" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                    {client.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{client.name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                      {client.email  && <span style={{ fontSize: 12, color: "#666" }}>📧 {client.email}</span>}
                      {client.phone  && <span style={{ fontSize: 12, color: "#666" }}>📞 {client.phone}</span>}
                      {client.address && <span style={{ fontSize: 12, color: "#666" }}>📍 {client.address}</span>}
                    </div>
                    {client.mainContact?.name && <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>👤 {client.mainContact.name} — Main Contact</div>}
                    {client.rates?.labourRate > 0 && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>${client.rates.labourRate}/hr labour rate</div>}
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <span className="chip">{clientJobs.length} jobs</span>
                      {active > 0 && <span className="chip" style={{ background: "#111", color: "#fff" }}>{active} active</span>}
                      <span className="chip">🏢 {sites.length} site{sites.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 12 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(client.id)}><Icon name="trash" size={12} /></button>
                </div>
              </div>

              {/* Sites accordion toggle */}
              <div
                style={{ borderTop: "1px solid #f0f0f0", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: sitesOpen ? "#fafafa" : "transparent" }}
                onClick={() => toggleSites(client.id)}
              >
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>
                  Sites &amp; Contacts ({sites.length})
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-ghost btn-xs" style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={e => { e.stopPropagation(); openNewSite(client.id); }}>
                    <Icon name="plus" size={10} /> Add Site
                  </button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transform: sitesOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "#aaa" }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>

              {/* Sites list */}
              {sitesOpen && (
                <div style={{ borderTop: "1px solid #f5f5f5" }}>
                  {sites.length === 0 ? (
                    <div style={{ padding: "16px 20px", fontSize: 13, color: "#bbb", textAlign: "center" }}>
                      No sites added yet. Click "+ Add Site" to add one.
                    </div>
                  ) : (
                    sites.map((site, si) => (
                      <div key={site.id} style={{ padding: "14px 20px", borderBottom: si < sites.length - 1 ? "1px solid #f5f5f5" : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>🏢</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{site.name}</div>
                          {site.address && <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>📍 {site.address}</div>}
                          {(site.contactName || site.contactPhone || site.contactEmail) && (
                            <div style={{ display: "flex", gap: "4px 14px", flexWrap: "wrap", marginTop: 4 }}>
                              {site.contactName  && <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>👤 {site.contactName}</span>}
                              {site.contactPhone && <span style={{ fontSize: 12, color: "#555" }}>📞 {site.contactPhone}</span>}
                              {site.contactEmail && <span style={{ fontSize: 12, color: "#555" }}>✉ {site.contactEmail}</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEditSite(client.id, site)}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delSite(client.id, site.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Recent jobs */}
              {clientJobs.length > 0 && (
                <div style={{ borderTop: "1px solid #f0f0f0", padding: "12px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 8 }}>Recent Jobs</div>
                  {clientJobs.slice(0, 2).map(j => (
                    <div key={j.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{j.title}</span>
                      <StatusBadge status={j.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>}

      {/* Client edit/new drawer */}
      {showModal && (() => {
        const isNewClient = !editClient;
        const clientSites = editClient ? (clients.find(c => c.id === editClient.id)?.sites || []) : [];
        const clientJobCount = editClient ? jobs.filter(j => j.clientId === editClient.id).length : 0;
        return (
        <SectionDrawer
          accent={SECTION_COLORS.clients.accent}
          icon={<Icon name="clients" size={16} />}
          typeLabel="Client"
          title={editClient ? editClient.name : "New Client"}
          mode={clientMode} setMode={setClientMode}
          showToggle={!isNewClient}
          isNew={isNewClient}
          footer={clientMode === "view" ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Close</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.clients.accent, color: "#fff", border: "none" }} onClick={() => setClientMode("edit")}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editClient ? setClientMode("view") : setShowModal(false)}>{editClient ? "Cancel" : "Cancel"}</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.clients.accent, color: "#fff", border: "none" }} onClick={() => { save(); if (editClient) setClientMode("view"); }} disabled={!form.name}>
              <Icon name="check" size={13} /> {isNewClient ? "Add Client" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {clientMode === "view" ? (
            <div style={{ padding: "20px 24px" }}>
              <ViewField label="Company / Client Name" value={form.name} />
              <div className="grid-2">
                <ViewField label="Email" value={form.email} />
                <ViewField label="Phone" value={form.phone} />
              </div>
              <ViewField label="Address" value={form.address} />
              {/* Contact cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                {form.mainContact?.name && (
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Main Contact</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{form.mainContact.name}</div>
                    {form.mainContact.phone && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>📞 {form.mainContact.phone}</div>}
                    {form.mainContact.email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>✉ {form.mainContact.email}</div>}
                  </div>
                )}
                {form.accountsContact?.name && (
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Accounts Contact</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{form.accountsContact.name}</div>
                    {form.accountsContact.phone && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>📞 {form.accountsContact.phone}</div>}
                    {form.accountsContact.email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>✉ {form.accountsContact.email}</div>}
                  </div>
                )}
              </div>
              {/* Rates */}
              {(form.rates?.labourRate || form.rates?.materialMargin || form.rates?.subcontractorMargin) ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                  <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 3 }}>Labour Rate</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>${form.rates.labourRate || 0}/hr</div>
                  </div>
                  <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 3 }}>Materials Margin</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>{form.rates.materialMargin || 0}%</div>
                  </div>
                  <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 3 }}>Subcontractor Margin</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>{form.rates.subcontractorMargin || 0}%</div>
                  </div>
                </div>
              ) : null}
              {/* Template Preferences */}
              <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12, marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Template Preferences</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[{ key: "quote", label: "Quotes" }, { key: "invoice", label: "Invoices" }, { key: "work_order", label: "Work Orders" }, { key: "purchase_order", label: "Purchase Orders" }].map(dt => {
                    const opts = templates.filter(t => t.type === dt.key);
                    const currentVal = form.templatePreferences?.[dt.key] || opts.find(t => t.isDefault)?.id || "";
                    return (
                      <div key={dt.key}>
                        <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{dt.label}</label>
                        <select value={currentVal} onChange={e => setForm(f => ({ ...f, templatePreferences: { ...(f.templatePreferences || {}), [dt.key]: Number(e.target.value) } }))} style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, fontFamily: "'Open Sans', sans-serif", boxSizing: "border-box" }}>
                          {opts.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (Default)" : ""}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <span className="chip">{clientJobCount} jobs</span>
                  <span className="chip">🏢 {clientSites.length} site{clientSites.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {clientSites.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Sites</div>
                  {clientSites.map(s => (
                    <div key={s.id} style={{ padding: "10px 14px", background: "#f8f8f8", borderRadius: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                      {s.address && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{s.address}</div>}
                      {s.contactName && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>👤 {s.contactName}{s.contactPhone ? ` · ${s.contactPhone}` : ""}{s.contactEmail ? ` · ${s.contactEmail}` : ""}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div style={{ padding: "20px 24px" }}>
            <div className="form-group"><label className="form-label">Company / Client Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            {/* Main Contact */}
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Main Contact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Name</label><input className="form-control" value={form.mainContact?.name || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, name: e.target.value } }))} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.mainContact?.phone || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, phone: e.target.value } }))} placeholder="04xx xxx xxx" /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.mainContact?.email || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, email: e.target.value } }))} placeholder="email@company.com" /></div>
              </div>
            </div>
            {/* Accounts Contact */}
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Accounts Contact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Name</label><input className="form-control" value={form.accountsContact?.name || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, name: e.target.value } }))} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.accountsContact?.phone || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, phone: e.target.value } }))} placeholder="04xx xxx xxx" /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.accountsContact?.email || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, email: e.target.value } }))} placeholder="email@company.com" /></div>
              </div>
            </div>
            {/* Rates */}
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Rates &amp; Margins</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Labour Rate ($/hr)</label><input type="number" className="form-control" value={form.rates?.labourRate || ""} onChange={e => setForm(f => ({ ...f, rates: { ...f.rates, labourRate: parseFloat(e.target.value) || 0 } }))} placeholder="0" /></div>
                <div className="form-group"><label className="form-label">Materials Margin (%)</label><input type="number" className="form-control" value={form.rates?.materialMargin || ""} onChange={e => setForm(f => ({ ...f, rates: { ...f.rates, materialMargin: parseFloat(e.target.value) || 0 } }))} placeholder="0" /></div>
                <div className="form-group"><label className="form-label">Subcontractor Margin (%)</label><input type="number" className="form-control" value={form.rates?.subcontractorMargin || ""} onChange={e => setForm(f => ({ ...f, rates: { ...f.rates, subcontractorMargin: parseFloat(e.target.value) || 0 } }))} placeholder="0" /></div>
              </div>
            </div>
          </div>
          )}
        </SectionDrawer>
        );
      })()}

      {/* Site add/edit drawer */}
      {showSiteModal && (
        <SectionDrawer
          accent={SECTION_COLORS.clients.accent}
          icon={<span style={{ fontSize: 16 }}>🏢</span>}
          typeLabel="Site"
          title={editSite ? editSite.name : "Add Site"}
          mode="edit" setMode={() => {}}
          showToggle={false}
          footer={<>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSiteModal(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: SECTION_COLORS.clients.accent, color: "#fff", border: "none" }} onClick={saveSite} disabled={!siteForm.name}>
              <Icon name="check" size={13} /> {editSite ? "Save Changes" : "Add Site"}
            </button>
          </>}
          onClose={() => setShowSiteModal(false)}
          zIndex={1060}
        >
          <div style={{ padding: "20px 24px" }}>
            <div className="form-group"><label className="form-label">Site Name *</label><input className="form-control" value={siteForm.name} onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Head Office, Warehouse, Site A" /></div>
            <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={siteForm.address} onChange={e => setSiteForm(f => ({ ...f, address: e.target.value }))} placeholder="Physical address" /></div>
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Site Contact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Contact Name</label><input className="form-control" value={siteForm.contactName} onChange={e => setSiteForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Contact Phone</label><input className="form-control" value={siteForm.contactPhone} onChange={e => setSiteForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="04xx xxx xxx" /></div>
                <div className="form-group"><label className="form-label">Contact Email</label><input type="email" className="form-control" value={siteForm.contactEmail || ""} onChange={e => setSiteForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="email@company.com" /></div>
              </div>
            </div>
          </div>
        </SectionDrawer>
      )}
    </div>
  );
};

export default memo(Clients);
