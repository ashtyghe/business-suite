import { useState, useMemo, memo } from "react";
import { useAppStore } from '../lib/store';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import { Icon } from '../components/Icon';
import s from './Files.module.css';

const FilesPage = () => {
  const { jobs, bills, contractors, quotes, invoices, workOrders, purchaseOrders, sectionView, setSectionView } = useAppStore();
  const view = sectionView === "kanban" ? "list" : sectionView;
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [filterSource, setFilterSource] = useState("all");
  const [filterType, setFilterType] = useState("all");

  // Aggregate files from all sources
  const allFiles = useMemo(() => {
    const files = [];

    // Bills / receipts
    bills.forEach(b => {
      files.push({ id: `bill-${b.id}`, name: `${b.invoiceNo || "Bill"} — ${b.supplier}`, type: "Bill / Receipt", source: "Bills", date: b.capturedAt || b.date, size: null, status: b.status, linkedTo: b.jobId ? (jobs.find(j => j.id === b.jobId)?.title || `Job #${b.jobId}`) : null, icon: "bills" });
    });

    // Contractor documents
    contractors.forEach(c => {
      (c.documents || []).forEach(d => {
        const typeLabels = { workers_comp: "Workers Comp", public_liability: "Public Liability", white_card: "White Card", trade_license: "Trade License", subcontractor_statement: "Subcontractor Statement", swms: "SWMS" };
        files.push({ id: `cdoc-${d.id}`, name: `${typeLabels[d.type] || d.type} — ${c.name}`, type: "Compliance Doc", source: "Contractors", date: d.uploadedAt, size: null, status: d.expiryDate && new Date(d.expiryDate) < new Date() ? "expired" : "current", linkedTo: c.name, icon: "contractors" });
      });
    });

    // Work order attachments
    workOrders.forEach(wo => {
      (wo.attachments || []).forEach((att, i) => {
        files.push({ id: `wo-att-${wo.id}-${i}`, name: typeof att === "string" ? att : (att.name || `WO ${wo.ref} Attachment ${i + 1}`), type: "Work Order Attachment", source: "Orders", date: wo.issueDate, size: att.size || null, status: wo.status, linkedTo: `${wo.ref} — ${wo.contractorName}`, icon: "orders" });
      });
    });

    // Purchase order attachments
    purchaseOrders.forEach(po => {
      (po.attachments || []).forEach((att, i) => {
        files.push({ id: `po-att-${po.id}-${i}`, name: typeof att === "string" ? att : (att.name || `PO ${po.ref} Attachment ${i + 1}`), type: "Purchase Order Attachment", source: "Orders", date: po.issueDate, size: att.size || null, status: po.status, linkedTo: `${po.ref} — ${po.supplierName}`, icon: "orders" });
      });
    });

    // Quotes (as generated documents)
    quotes.forEach(q => {
      files.push({ id: `quote-${q.id}`, name: `Quote ${q.ref || q.id} — ${q.clientName || "Client"}`, type: "Quote", source: "Quotes", date: q.date || q.createdAt, size: null, status: q.status, linkedTo: q.jobTitle || (q.jobId ? `Job #${q.jobId}` : null), icon: "quotes" });
    });

    // Invoices (as generated documents)
    invoices.forEach(inv => {
      files.push({ id: `inv-${inv.id}`, name: `Invoice ${inv.ref || inv.id} — ${inv.clientName || "Client"}`, type: "Invoice", source: "Invoices", date: inv.date || inv.createdAt, size: null, status: inv.status, linkedTo: inv.jobTitle || (inv.jobId ? `Job #${inv.jobId}` : null), icon: "invoices" });
    });

    return files;
  }, [bills, contractors, workOrders, purchaseOrders, quotes, invoices, jobs]);

  // Get unique sources and types for filters
  const sources = useMemo(() => [...new Set(allFiles.map(f => f.source))].sort(), [allFiles]);
  const types = useMemo(() => [...new Set(allFiles.map(f => f.type))].sort(), [allFiles]);

  // Filter and search
  const filtered = useMemo(() => {
    let list = allFiles;
    if (filterSource !== "all") list = list.filter(f => f.source === filterSource);
    if (filterType !== "all") list = list.filter(f => f.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || (f.linkedTo || "").toLowerCase().includes(q) || f.type.toLowerCase().includes(q) || f.source.toLowerCase().includes(q));
    }
    // Sort
    list = [...list].sort((a, b) => {
      let va, vb;
      if (sortField === "date") { va = a.date || ""; vb = b.date || ""; }
      else if (sortField === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (sortField === "type") { va = a.type; vb = b.type; }
      else if (sortField === "source") { va = a.source; vb = b.source; }
      else { va = a.date || ""; vb = b.date || ""; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [allFiles, filterSource, filterType, search, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const sortIcon = (field) => sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const statusColor = (status) => {
    if (!status) return "#888";
    const s = status.toLowerCase();
    if (["expired", "overdue", "inbox"].includes(s)) return "#dc2626";
    if (["approved", "current", "paid", "accepted", "sent"].includes(s)) return "#059669";
    if (["draft", "pending"].includes(s)) return "#f59e0b";
    if (["posted", "linked"].includes(s)) return "#2563eb";
    return "#888";
  };

  const accent = SECTION_COLORS.files.accent;

  return (
    <div>
      {/* Toolbar */}
      <div className="section-toolbar">
        <div className={`search-bar ${s.searchBar}`}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..." />
        </div>
        <select className={`form-control ${s.filterSelect}`} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
          <option value="all">All Sources</option>
          {sources.map(src => <option key={src} value={src}>{src}</option>)}
        </select>
        <select className={`form-control ${s.filterSelect}`} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className={s.viewToggle}>
          <button className={`btn btn-xs ${view === "list" ? "" : "btn-ghost"}`} style={view === "list" ? { background: accent, color: '#fff' } : undefined} onClick={() => setSectionView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "grid" ? "" : "btn-ghost"}`} style={view === "grid" ? { background: accent, color: '#fff' } : undefined} onClick={() => setSectionView("grid")}><Icon name="grid_view" size={12} /></button>
          <button className={`btn btn-xs ${sectionView === "kanban" ? "" : "btn-ghost"}`} style={sectionView === "kanban" ? { background: accent, color: '#fff' } : undefined} onClick={() => setSectionView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        <div className={s.scrollWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.headerRow}>
                <th onClick={() => toggleSort("name")} className={s.th}>Name{sortIcon("name")}</th>
                <th onClick={() => toggleSort("type")} className={s.th}>Type{sortIcon("type")}</th>
                <th onClick={() => toggleSort("source")} className={s.th}>Source{sortIcon("source")}</th>
                <th onClick={() => toggleSort("date")} className={s.th}>Date{sortIcon("date")}</th>
                <th className={s.thStatic}>Linked To</th>
                <th className={s.thCenter}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className={s.emptyCell}>No files found</td></tr>
              ) : filtered.map(f => (
                <tr key={f.id} className={s.row}
                  onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <td className={s.nameCell}>
                    <Icon name={f.icon} size={14} />
                    <span className={s.nameText}>{f.name}</span>
                  </td>
                  <td className={s.cell}>{f.type}</td>
                  <td className={s.cell}>{f.source}</td>
                  <td className={s.dateCell}>{f.date || "—"}</td>
                  <td className={s.linkedCell}>{f.linkedTo || "—"}</td>
                  <td className={s.statusCell}>
                    {f.status ? <span className={s.statusBadge} style={{ background: statusColor(f.status) + "18", color: statusColor(f.status) }}>{f.status}</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default memo(FilesPage);
