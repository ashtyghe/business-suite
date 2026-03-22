import { useState, useMemo } from "react";
import { useAppStore } from '../lib/store';
import { Icon } from '../components/Icon';

const FilesPage = () => {
  const { jobs, bills, contractors, quotes, invoices, workOrders, purchaseOrders } = useAppStore();
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

  const selectStyle = { padding: "7px 10px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: 13, background: "#fff", color: "#333", fontFamily: "'Open Sans', sans-serif", minWidth: 120 };

  return (
    <div style={{ padding: 0 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..." style={{ ...selectStyle, width: "100%", paddingLeft: 32 }} />
        </div>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={selectStyle}>
          <option value="all">All Sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
          <option value="all">All Types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ fontSize: 12, color: "#888" }}>{filtered.length} file{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e5e5" }}>
                <th onClick={() => toggleSort("name")} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>Name{sortIcon("name")}</th>
                <th onClick={() => toggleSort("type")} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>Type{sortIcon("type")}</th>
                <th onClick={() => toggleSort("source")} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>Source{sortIcon("source")}</th>
                <th onClick={() => toggleSort("date")} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>Date{sortIcon("date")}</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", whiteSpace: "nowrap" }}>Linked To</th>
                <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", whiteSpace: "nowrap" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#aaa" }}>No files found</td></tr>
              ) : filtered.map(f => (
                <tr key={f.id} style={{ borderBottom: "1px solid #f0f0f0" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <td style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name={f.icon} size={14} />
                    <span style={{ fontWeight: 500 }}>{f.name}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: "#666" }}>{f.type}</td>
                  <td style={{ padding: "10px 14px", color: "#666" }}>{f.source}</td>
                  <td style={{ padding: "10px 14px", color: "#666", whiteSpace: "nowrap" }}>{f.date || "—"}</td>
                  <td style={{ padding: "10px 14px", color: "#888", fontSize: 12 }}>{f.linkedTo || "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    {f.status ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: statusColor(f.status) + "18", color: statusColor(f.status), textTransform: "capitalize" }}>{f.status}</span> : "—"}
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

export default FilesPage;
