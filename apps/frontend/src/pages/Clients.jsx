import { useState, memo } from "react";
import { useAppStore } from '../lib/store';
import { createCustomer, updateCustomer, deleteCustomer, createSite, updateSite, deleteSite } from '../lib/db';
import { SECTION_COLORS, ViewField } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import { StatusBadge, SectionDrawer } from '../components/shared';
import s from './Clients.module.css';

const Clients = () => {
  const { clients, setClients, jobs, templates, sectionView: rawView, setSectionView: setView } = useAppStore();
  const view = rawView === "kanban" ? "list" : rawView; // kanban not used here
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [clientMode, setClientMode] = useState("edit");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", sites: [], mainContact: { name: "", phone: "", email: "" }, accountsContact: { name: "", phone: "", email: "" }, rates: { labourRate: 0, materialMargin: 0, subcontractorMargin: 0 } });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
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

  const toggleSites = (id) => setExpandedSites(st => ({ ...st, [id]: !st[id] }));

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
          return { ...c, sites: (c.sites || []).map(st => st.id === editSite.id ? saved : st) };
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
      setClients(cs => cs.map(c => c.id === clientId ? { ...c, sites: (c.sites||[]).filter(st => st.id !== siteId) } : c));
    } catch (err) {
      console.error('Failed to delete site:', err);
    }
  };

  return (
    <div>
      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." />
        </div>
        <select className={`form-control ${s.filterSelect}`} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Clients</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className={s.viewToggle}>
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
                    <tr key={client.id} onClick={() => openEdit(client)} className={s.rowClickable}>
                      <td className={s.cellName}>{client.name}</td>
                      <td className={s.cellContact}>{client.mainContact?.name || "—"}</td>
                      <td className={s.cellSecondary}>{client.email || "—"}</td>
                      <td className={s.cellSecondary}>{client.phone || "—"}</td>
                      <td>{(client.sites || []).length}</td>
                      <td>{clientJobs.length}</td>
                      <td>{active > 0 ? <span className={`chip ${s.activeChip}`}>{active}</span> : "—"}</td>
                      <td onClick={e => e.stopPropagation()}><button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(client.id)}><Icon name="trash" size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "grid" && <div className={s.gridLayout}>
        {filtered.map(client => {
          const clientJobs = jobs.filter(j => j.clientId === client.id);
          const active = clientJobs.filter(j => j.status === "in_progress").length;
          const sites = client.sites || [];
          const sitesOpen = expandedSites[client.id];
          return (
            <div key={client.id} className="card">
              {/* Client header */}
              <div onClick={() => openEdit(client)} className={s.cardHeader}>
                <div className={s.cardHeaderLeft}>
                  <div className={s.avatar}>
                    {client.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className={s.cardContent}>
                    <div className={s.clientName}>{client.name}</div>
                    <div className={s.contactRow}>
                      {client.email  && <span className={s.contactDetail}>📧 {client.email}</span>}
                      {client.phone  && <span className={s.contactDetail}>📞 {client.phone}</span>}
                      {client.address && <span className={s.contactDetail}>📍 {client.address}</span>}
                    </div>
                    {client.mainContact?.name && <div className={s.mainContactLabel}>👤 {client.mainContact.name} — Main Contact</div>}
                    {client.rates?.labourRate > 0 && <div className={s.labourRate}>${client.rates.labourRate}/hr labour rate</div>}
                    <div className={s.chipRow}>
                      <span className="chip">{clientJobs.length} jobs</span>
                      {active > 0 && <span className={`chip ${s.activeChip}`}>{active} active</span>}
                      <span className="chip">🏢 {sites.length} site{sites.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div className={s.cardActions} onClick={e => e.stopPropagation()}>
                  <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => del(client.id)}><Icon name="trash" size={12} /></button>
                </div>
              </div>

              {/* Sites accordion toggle */}
              <div
                className={`${s.sitesToggle} ${sitesOpen ? s.sitesToggleOpen : ''}`}
                onClick={() => toggleSites(client.id)}
              >
                <span className={s.sectionLabel}>
                  Sites &amp; Contacts ({sites.length})
                </span>
                <div className={s.sitesToggleActions}>
                  <button className={`btn btn-ghost btn-xs ${s.addSiteBtn}`}
                    onClick={e => { e.stopPropagation(); openNewSite(client.id); }}>
                    <Icon name="plus" size={10} /> Add Site
                  </button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    className={`${s.chevron} ${sitesOpen ? s.chevronOpen : ''}`}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>

              {/* Sites list */}
              {sitesOpen && (
                <div className={s.sitesList}>
                  {sites.length === 0 ? (
                    <div className={s.sitesEmpty}>
                      No sites added yet. Click "+ Add Site" to add one.
                    </div>
                  ) : (
                    sites.map((site, si) => (
                      <div key={site.id} className={`${s.siteRow} ${si < sites.length - 1 ? s.siteRowBorder : ''}`}>
                        <div className={s.siteIcon}>🏢</div>
                        <div className={s.siteContent}>
                          <div className={s.siteName}>{site.name}</div>
                          {site.address && <div className={s.siteAddress}>📍 {site.address}</div>}
                          {(site.contactName || site.contactPhone || site.contactEmail) && (
                            <div className={s.siteContactRow}>
                              {site.contactName  && <span className={s.siteContactName}>👤 {site.contactName}</span>}
                              {site.contactPhone && <span className={s.siteContactDetail}>📞 {site.contactPhone}</span>}
                              {site.contactEmail && <span className={s.siteContactDetail}>✉ {site.contactEmail}</span>}
                            </div>
                          )}
                        </div>
                        <div className={s.siteActions}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEditSite(client.id, site)}><Icon name="edit" size={11} /></button>
                          <button className={`btn btn-ghost btn-xs ${s.deleteBtn}`} onClick={() => delSite(client.id, site.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Recent jobs */}
              {clientJobs.length > 0 && (
                <div className={s.recentJobs}>
                  <div className={s.sectionHeading}>Recent Jobs</div>
                  {clientJobs.slice(0, 2).map(j => (
                    <div key={j.id} className={s.jobRow}>
                      <span className={s.jobTitle}>{j.title}</span>
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
            <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: SECTION_COLORS.clients.accent }} onClick={() => setClientMode("edit")}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => editClient ? setClientMode("view") : setShowModal(false)}>{editClient ? "Cancel" : "Cancel"}</button>
            <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: SECTION_COLORS.clients.accent }} onClick={() => { save(); if (editClient) setClientMode("view"); }} disabled={!form.name}>
              <Icon name="check" size={13} /> {isNewClient ? "Add Client" : "Save Changes"}
            </button>
          </>}
          onClose={() => setShowModal(false)}
        >
          {clientMode === "view" ? (
            <div className={s.drawerPadding}>
              <ViewField label="Company / Client Name" value={form.name} />
              <div className="grid-2">
                <ViewField label="Email" value={form.email} />
                <ViewField label="Phone" value={form.phone} />
              </div>
              <ViewField label="Address" value={form.address} />
              {/* Contact cards */}
              <div className={s.contactCardsGrid}>
                {form.mainContact?.name && (
                  <div className={s.contactCard}>
                    <div className={s.contactCardLabel}>Main Contact</div>
                    <div className={s.contactCardName}>{form.mainContact.name}</div>
                    {form.mainContact.phone && <div className={s.contactCardDetail}>📞 {form.mainContact.phone}</div>}
                    {form.mainContact.email && <div className={s.contactCardDetail}>✉ {form.mainContact.email}</div>}
                  </div>
                )}
                {form.accountsContact?.name && (
                  <div className={s.contactCard}>
                    <div className={s.contactCardLabel}>Accounts Contact</div>
                    <div className={s.contactCardName}>{form.accountsContact.name}</div>
                    {form.accountsContact.phone && <div className={s.contactCardDetail}>📞 {form.accountsContact.phone}</div>}
                    {form.accountsContact.email && <div className={s.contactCardDetail}>✉ {form.accountsContact.email}</div>}
                  </div>
                )}
              </div>
              {/* Rates */}
              {(form.rates?.labourRate || form.rates?.materialMargin || form.rates?.subcontractorMargin) ? (
                <div className={s.ratesGrid}>
                  <div className={s.rateCard}>
                    <div className={s.rateCardLabel}>Labour Rate</div>
                    <div className={s.rateCardValue}>${form.rates.labourRate || 0}/hr</div>
                  </div>
                  <div className={s.rateCard}>
                    <div className={s.rateCardLabel}>Materials Margin</div>
                    <div className={s.rateCardValue}>{form.rates.materialMargin || 0}%</div>
                  </div>
                  <div className={s.rateCard}>
                    <div className={s.rateCardLabel}>Subcontractor Margin</div>
                    <div className={s.rateCardValue}>{form.rates.subcontractorMargin || 0}%</div>
                  </div>
                </div>
              ) : null}
              {/* Template Preferences */}
              <div className={s.sectionDivider}>
                <div className={s.sectionHeading}>Template Preferences</div>
                <div className={s.templateGrid}>
                  {[{ key: "quote", label: "Quotes" }, { key: "invoice", label: "Invoices" }, { key: "work_order", label: "Work Orders" }, { key: "purchase_order", label: "Purchase Orders" }].map(dt => {
                    const opts = templates.filter(t => t.type === dt.key);
                    const currentVal = form.templatePreferences?.[dt.key] || opts.find(t => t.isDefault)?.id || "";
                    return (
                      <div key={dt.key}>
                        <label className={s.templateLabel}>{dt.label}</label>
                        <select value={currentVal} onChange={e => setForm(f => ({ ...f, templatePreferences: { ...(f.templatePreferences || {}), [dt.key]: Number(e.target.value) } }))} className={s.templateSelect}>
                          {opts.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (Default)" : ""}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className={s.sectionDividerLg}>
                <div className={s.chipGroup}>
                  <span className="chip">{clientJobCount} jobs</span>
                  <span className="chip">🏢 {clientSites.length} site{clientSites.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {clientSites.length > 0 && (
                <div className={s.viewSitesSection}>
                  <div className={s.sectionHeading}>Sites</div>
                  {clientSites.map(st => (
                    <div key={st.id} className={s.viewSiteCard}>
                      <div className={s.viewSiteName}>{st.name}</div>
                      {st.address && <div className={s.viewSiteAddress}>{st.address}</div>}
                      {st.contactName && <div className={s.viewSiteContact}>👤 {st.contactName}{st.contactPhone ? ` · ${st.contactPhone}` : ""}{st.contactEmail ? ` · ${st.contactEmail}` : ""}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div className={s.drawerPadding}>
            <div className="form-group"><label className="form-label">Company / Client Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            {/* Main Contact */}
            <div className={s.formSection}>
              <div className={s.formSectionLabel}>Main Contact</div>
              <div className={s.threeColGrid}>
                <div className="form-group"><label className="form-label">Name</label><input className="form-control" value={form.mainContact?.name || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, name: e.target.value } }))} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.mainContact?.phone || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, phone: e.target.value } }))} placeholder="04xx xxx xxx" /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.mainContact?.email || ""} onChange={e => setForm(f => ({ ...f, mainContact: { ...f.mainContact, email: e.target.value } }))} placeholder="email@company.com" /></div>
              </div>
            </div>
            {/* Accounts Contact */}
            <div className={s.formSection}>
              <div className={s.formSectionLabel}>Accounts Contact</div>
              <div className={s.threeColGrid}>
                <div className="form-group"><label className="form-label">Name</label><input className="form-control" value={form.accountsContact?.name || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, name: e.target.value } }))} placeholder="Full name" /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.accountsContact?.phone || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, phone: e.target.value } }))} placeholder="04xx xxx xxx" /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.accountsContact?.email || ""} onChange={e => setForm(f => ({ ...f, accountsContact: { ...f.accountsContact, email: e.target.value } }))} placeholder="email@company.com" /></div>
              </div>
            </div>
            {/* Rates */}
            <div className={s.formSection}>
              <div className={s.formSectionLabel}>Rates &amp; Margins</div>
              <div className={s.threeColGrid}>
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
          icon={<span className={s.siteIconEmoji}>🏢</span>}
          typeLabel="Site"
          title={editSite ? editSite.name : "Add Site"}
          mode="edit" setMode={() => {}}
          showToggle={false}
          footer={<>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSiteModal(false)}>Cancel</button>
            <button className={`btn btn-sm ${s.accentBtn}`} style={{ background: SECTION_COLORS.clients.accent }} onClick={saveSite} disabled={!siteForm.name}>
              <Icon name="check" size={13} /> {editSite ? "Save Changes" : "Add Site"}
            </button>
          </>}
          onClose={() => setShowSiteModal(false)}
          zIndex={1060}
        >
          <div className={s.drawerPadding}>
            <div className="form-group"><label className="form-label">Site Name *</label><input className="form-control" value={siteForm.name} onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Head Office, Warehouse, Site A" /></div>
            <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={siteForm.address} onChange={e => setSiteForm(f => ({ ...f, address: e.target.value }))} placeholder="Physical address" /></div>
            <div className={s.siteSectionDivider}>
              <div className={s.formSectionLabel}>Site Contact</div>
              <div className={s.threeColGrid}>
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
