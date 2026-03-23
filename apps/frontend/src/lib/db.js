import { supabase } from './supabase';

// ── Query helper ───────────────────────────────────────────────────────────

async function q(promise, fallback = []) {
  try {
    const result = await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 15000)),
    ]);
    const { data, error } = result;
    if (error) {
      console.warn('DB query error:', error.message);
      return fallback;
    }
    return data;
  } catch (err) {
    console.warn('DB query failed:', err.message);
    return fallback;
  }
}

// Strict query helper for mutations — throws on error so callers can handle failures
async function qStrict(promise) {
  const result = await Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 15000)),
  ]);
  const { data, error } = result;
  if (error) throw new Error(error.message);
  return data;
}

// ── Normalizers (DB → frontend shape) ─────────────────────────────────────

function normalizeSite(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address || '',
    suburb: row.suburb || '',
    state: row.state || '',
    postcode: row.postcode || '',
    contactName: row.contact_name || '',
    contactPhone: row.contact_phone || '',
  };
}

function normalizeCustomer(row, allSites) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || '',
    suburb: row.suburb || '',
    state: row.state || '',
    postcode: row.postcode || '',
    xeroContactId: row.xero_contact_id || null,
    sites: allSites.filter(s => s.customer_id === row.id).map(normalizeSite),
  };
}

function normalizeJob(row) {
  return {
    id: row.id,
    jobNumber: row.job_number,
    title: row.title,
    description: row.description || '',
    status: row.status,
    clientId: row.customer_id,
    siteId: row.site_id,
    assignedTo: row.assigned_staff_ids || [],
    startDate: row.scheduled_start ? row.scheduled_start.slice(0, 10) : '',
    dueDate: row.scheduled_end ? row.scheduled_end.slice(0, 10) : '',
    createdAt: row.created_at ? row.created_at.slice(0, 10) : '',
    priority: row.priority || 'medium',
    tags: row.tags || [],
    estimate: {
      labour: Number(row.estimate_labour || 0),
      materials: Number(row.estimate_materials || 0),
      subcontractors: Number(row.estimate_subcontractors || 0),
      other: Number(row.estimate_other || 0),
    },
    activityLog: [],
  };
}

function normalizeLineItem(row) {
  return {
    id: row.id,
    desc: row.description,
    qty: Number(row.quantity),
    unit: row.unit || 'ea',
    rate: Number(row.unit_price),
  };
}

function normalizeQuote(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    number: row.quote_number,
    status: row.status,
    tax: Number(row.tax_rate || 10),
    notes: row.notes || '',
    createdAt: row.created_at ? row.created_at.slice(0, 10) : '',
    lineItems: (row.line_items || []).map(normalizeLineItem),
    acceptToken: row.accept_token || null,
    acceptedAt: row.accepted_at || null,
    acceptedBy: row.accepted_by || null,
  };
}

function normalizeInvoice(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    number: row.invoice_number,
    status: row.status,
    tax: Number(row.tax_rate || 10),
    notes: row.notes || '',
    dueDate: row.due_date || '',
    createdAt: row.created_at ? row.created_at.slice(0, 10) : '',
    fromQuoteId: row.from_quote_id || null,
    lineItems: (row.line_items || []).map(normalizeLineItem),
    xeroInvoiceId: row.xero_invoice_id || null,
    xeroSyncStatus: row.xero_sync_status || null,
    xeroLastSyncedAt: row.xero_last_synced_at || null,
    xeroSkip: row.xero_skip || false,
  };
}

function normalizeTimeEntry(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    staffId: row.staff_id,
    worker: row.worker_name || '',   // resolved by caller after staff lookup
    date: row.entry_date,
    hours: Number(row.hours),
    description: row.notes || '',
    billable: true,
  };
}

function normalizeBill(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    supplier: row.supplier_name || '',
    invoiceNo: row.invoice_number || '',
    date: row.invoice_date || '',
    amount: Number(row.total || 0),
    hasGst: row.has_gst !== false,
    category: row.category || '',
    status: row.status,
    markup: Number(row.markup || 0),
    notes: row.notes || '',
    capturedAt: row.created_at ? row.created_at.slice(0, 10) : '',
    xeroBillId: row.xero_bill_id || null,
    xeroSyncStatus: row.xero_sync_status || null,
    xeroLastSyncedAt: row.xero_last_synced_at || null,
    xeroSkip: row.xero_skip || false,
  };
}

function normalizeSchedule(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    date: row.entry_date,
    notes: row.notes || '',
    assignedTo: row.assigned_staff_ids || [],
    title: row.title || '',
  };
}

function normalizeStaff(row) {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone || '',
    role: row.role,
    active: row.active,
  };
}

function normalizePhase(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    name: row.name,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    color: row.color || '#3b82f6',
    progress: Number(row.progress || 0),
    sortOrder: row.sort_order || 0,
  };
}

function normalizeTask(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    text: row.text,
    done: row.is_done || false,
    dueDate: row.due_date || '',
    assignedTo: row.assigned_to || '',
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at || '',
  };
}

function normalizeNote(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    text: row.text || '',
    category: row.category || 'general',
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    formType: row.form_type || null,
    formData: row.form_data || null,
    pdfNote: row.is_pdf || false,
    pdfUrl: row.pdf_url || null,
    pdfThumbnail: row.pdf_thumbnail_url || null,
    pdfFields: row.pdf_fields || null,
    pdfOriginalName: row.pdf_original_name || null,
    attachments: [],  // populated after fetch via attachments table
  };
}

function normalizeAttachment(row) {
  return {
    id: row.id,
    parentType: row.parent_type,
    parentId: row.parent_id,
    name: row.name || '',
    size: row.size || 0,
    type: row.mime_type || '',
    url: row.url,
    dataUrl: row.url,  // alias for frontend compatibility
  };
}

function normalizeWorkOrder(row) {
  return {
    id: row.id,
    ref: row.ref,
    jobId: row.job_id,
    contractorId: row.contractor_id,
    contractorName: row.contractor_name || '',
    contractorContact: row.contractor_contact || '',
    contractorEmail: row.contractor_email || '',
    contractorPhone: row.contractor_phone || '',
    trade: row.trade || '',
    status: row.status,
    issueDate: row.issue_date || '',
    dueDate: row.due_date || '',
    poLimit: row.po_limit ? String(row.po_limit) : '',
    scopeOfWork: row.scope_of_work || '',
    notes: row.notes || '',
    internalNotes: row.internal_notes || '',
    attachments: [],  // populated after fetch
    auditLog: [],     // populated from audit_log table
    acceptToken: row.accept_token || null,
    acceptedAt: row.accepted_at || null,
    acceptedBy: row.accepted_by || null,
  };
}

function normalizePurchaseOrder(row) {
  return {
    id: row.id,
    ref: row.ref,
    jobId: row.job_id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || '',
    supplierContact: row.supplier_contact || '',
    supplierEmail: row.supplier_email || '',
    supplierAbn: row.supplier_abn || '',
    status: row.status,
    issueDate: row.issue_date || '',
    dueDate: row.due_date || '',
    poLimit: row.po_limit ? String(row.po_limit) : '',
    deliveryAddress: row.delivery_address || '',
    notes: row.notes || '',
    internalNotes: row.internal_notes || '',
    lines: [],        // populated after fetch
    attachments: [],  // populated after fetch
    auditLog: [],     // populated from audit_log table
    acceptToken: row.accept_token || null,
    acceptedAt: row.accepted_at || null,
    acceptedBy: row.accepted_by || null,
  };
}

function normalizePOLine(row) {
  return {
    id: row.id,
    desc: row.description,
    qty: Number(row.quantity || 1),
    unit: row.unit || 'ea',
    rate: Number(row.unit_price || 0),
  };
}

function normalizeContractor(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || '',
    suburb: row.suburb || '',
    state: row.state || '',
    postcode: row.postcode || '',
    trade: row.trade || '',
    abn: row.abn || '',
    notes: row.notes || '',
    isActive: row.is_active !== false,
    documents: [],  // populated after fetch
  };
}

function normalizeContractorDoc(row) {
  return {
    id: row.id,
    contractorId: row.contractor_id,
    docType: row.doc_type,
    policyNumber: row.policy_number || '',
    insurer: row.insurer || '',
    coverAmount: row.cover_amount || '',
    licenseNumber: row.license_number || '',
    licenseClass: row.license_class || '',
    issuingBody: row.issuing_body || '',
    cardNumber: row.card_number || '',
    holderName: row.holder_name || '',
    title: row.title || '',
    revision: row.revision || '',
    approvedBy: row.approved_by || '',
    approvalDate: row.approval_date || '',
    issueDate: row.issue_date || '',
    expiryDate: row.expiry_date || '',
    expiry: row.expiry_date || '',  // alias used by compliance checks
    periodFrom: row.period_from || '',
    periodTo: row.period_to || '',
    abn: row.abn || '',
    fileUrl: row.file_url || '',
  };
}

function normalizeAuditEntry(row) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    ts: row.created_at,
    action: row.action,
    detail: row.detail || '',
    auto: row.is_auto || false,
    user: row.user_name || '',
  };
}

// ── Denormalizers (frontend shape → DB) ───────────────────────────────────

function denormalizeJob(data) {
  return {
    title: data.title,
    description: data.description || null,
    status: data.status,
    customer_id: data.clientId || null,
    site_id: data.siteId || null,
    assigned_staff_ids: data.assignedTo || [],
    scheduled_start: data.startDate ? data.startDate + 'T00:00:00+00:00' : null,
    scheduled_end: data.dueDate ? data.dueDate + 'T00:00:00+00:00' : null,
    job_number: data.jobNumber,
    priority: data.priority || 'medium',
    tags: data.tags || [],
    estimate_labour: data.estimate?.labour || 0,
    estimate_materials: data.estimate?.materials || 0,
    estimate_subcontractors: data.estimate?.subcontractors || 0,
    estimate_other: data.estimate?.other || 0,
  };
}

function denormalizeWorkOrder(data) {
  return {
    ref: data.ref,
    job_id: data.jobId || null,
    contractor_id: data.contractorId || null,
    contractor_name: data.contractorName || null,
    contractor_contact: data.contractorContact || null,
    contractor_email: data.contractorEmail || null,
    contractor_phone: data.contractorPhone || null,
    trade: data.trade || null,
    status: data.status || 'Draft',
    issue_date: data.issueDate || null,
    due_date: data.dueDate || null,
    po_limit: data.poLimit ? Number(data.poLimit) : 0,
    scope_of_work: data.scopeOfWork || null,
    notes: data.notes || null,
    internal_notes: data.internalNotes || null,
  };
}

function denormalizePurchaseOrder(data) {
  return {
    ref: data.ref,
    job_id: data.jobId || null,
    supplier_id: data.supplierId || null,
    supplier_name: data.supplierName || null,
    supplier_contact: data.supplierContact || null,
    supplier_email: data.supplierEmail || null,
    supplier_abn: data.supplierAbn || null,
    status: data.status || 'Draft',
    issue_date: data.issueDate || null,
    due_date: data.dueDate || null,
    po_limit: data.poLimit ? Number(data.poLimit) : 0,
    delivery_address: data.deliveryAddress || null,
    notes: data.notes || null,
    internal_notes: data.internalNotes || null,
  };
}

function denormalizePOLines(lines, poId) {
  return (lines || []).map(li => ({
    purchase_order_id: poId,
    description: li.desc,
    quantity: li.qty || 1,
    unit: li.unit || 'ea',
    unit_price: li.rate || 0,
  }));
}

function denormalizeContractor(data) {
  return {
    name: data.name,
    contact: data.contact || null,
    email: data.email || null,
    phone: data.phone || null,
    address: data.address || null,
    suburb: data.suburb || null,
    state: data.state || null,
    postcode: data.postcode || null,
    trade: data.trade || null,
    abn: data.abn || null,
    notes: data.notes || null,
    is_active: data.isActive !== false,
  };
}

function denormalizeContractorDoc(data, contractorId) {
  return {
    contractor_id: contractorId,
    doc_type: data.docType,
    policy_number: data.policyNumber || null,
    insurer: data.insurer || null,
    cover_amount: data.coverAmount || null,
    license_number: data.licenseNumber || null,
    license_class: data.licenseClass || null,
    issuing_body: data.issuingBody || null,
    card_number: data.cardNumber || null,
    holder_name: data.holderName || null,
    title: data.title || null,
    revision: data.revision || null,
    approved_by: data.approvedBy || null,
    approval_date: data.approvalDate || null,
    issue_date: data.issueDate || null,
    expiry_date: data.expiryDate || data.expiry || null,
    period_from: data.periodFrom || null,
    period_to: data.periodTo || null,
    abn: data.abn || null,
    file_url: data.fileUrl || null,
  };
}

function denormalizeLineItems(lineItems, parentKey, parentId) {
  return (lineItems || []).map(li => ({
    description: li.desc,
    quantity: li.qty,
    unit_price: li.rate,
    [parentKey]: parentId,
  }));
}

function denormalizeQuote(data) {
  return {
    job_id: data.jobId || null,
    quote_number: data.number,
    status: data.status,
    tax_rate: data.tax || 10,
    notes: data.notes || null,
  };
}

function denormalizeInvoice(data) {
  return {
    job_id: data.jobId || null,
    invoice_number: data.number,
    status: data.status,
    tax_rate: data.tax || 10,
    notes: data.notes || null,
    due_date: data.dueDate || null,
    from_quote_id: data.fromQuoteId || null,
    subtotal: (data.lineItems || []).reduce((s, l) => s + l.qty * l.rate, 0),
    tax: (data.lineItems || []).reduce((s, l) => s + l.qty * l.rate, 0) * ((data.tax || 10) / 100),
    total: (data.lineItems || []).reduce((s, l) => s + l.qty * l.rate, 0) * (1 + (data.tax || 10) / 100),
  };
}

function denormalizeBill(data) {
  const total = Number(data.amount || 0);
  const subtotal = data.hasGst !== false ? total / 1.1 : total;
  const tax = data.hasGst !== false ? total - subtotal : 0;
  return {
    job_id: data.jobId || null,
    supplier_name: data.supplier || null,
    invoice_number: data.invoiceNo || null,
    invoice_date: data.date || null,
    total,
    subtotal,
    tax,
    has_gst: data.hasGst !== false,
    category: data.category || null,
    status: data.status,
    markup: data.markup || 0,
    notes: data.notes || null,
  };
}

function denormalizeSchedule(data) {
  return {
    job_id: data.jobId || null,
    entry_date: data.date,
    notes: data.notes || null,
    assigned_staff_ids: data.assignedTo || [],
  };
}

// ── Fetch all ──────────────────────────────────────────────────────────────

export async function fetchAll() {
  const [
    customers,
    sites,
    jobs,
    quotes,
    quoteLineItems,
    invoices,
    invoiceLineItems,
    timeEntries,
    bills,
    schedule,
    staff,
    workOrders,
    purchaseOrders,
    poLines,
    contractors,
    contractorDocs,
    suppliers,
    phases,
    tasks,
    notes,
    attachments,
    auditEntries,
  ] = await Promise.all([
    q(supabase.from('customers').select('*').order('name')),
    q(supabase.from('sites').select('*').order('name')),
    q(supabase.from('jobs').select('*').order('created_at', { ascending: false })),
    q(supabase.from('quotes').select('*').order('created_at', { ascending: false })),
    q(supabase.from('line_items').select('*').not('quote_id', 'is', null)),
    q(supabase.from('invoices').select('*').order('created_at', { ascending: false })),
    q(supabase.from('line_items').select('*').not('invoice_id', 'is', null)),
    q(supabase.from('time_entries').select('*').order('entry_date', { ascending: false })),
    q(supabase.from('bills').select('*').order('created_at', { ascending: false })),
    q(supabase.from('schedule').select('*').order('entry_date')),
    q(supabase.from('staff').select('*').order('full_name')),
    q(supabase.from('work_orders').select('*').order('created_at', { ascending: false })),
    q(supabase.from('purchase_orders').select('*').order('created_at', { ascending: false })),
    q(supabase.from('purchase_order_lines').select('*')),
    q(supabase.from('contractors').select('*').order('name')),
    q(supabase.from('contractor_documents').select('*')),
    q(supabase.from('suppliers').select('*').order('name')),
    q(supabase.from('job_phases').select('*').order('sort_order')),
    q(supabase.from('job_tasks').select('*').order('sort_order')),
    q(supabase.from('job_notes').select('*').order('created_at', { ascending: false })),
    q(supabase.from('attachments').select('*')),
    q(supabase.from('audit_log').select('*').order('created_at', { ascending: false })),
  ]);

  const normalizedStaff = staff.map(normalizeStaff);

  // Build staff lookup: UUID → name
  const staffById = Object.fromEntries(normalizedStaff.map(s => [s.id, s.name]));

  // Attach line items to quotes/invoices
  const quotesWithItems = quotes.map(qt => ({
    ...qt,
    line_items: quoteLineItems.filter(li => li.quote_id === qt.id),
  }));
  const invoicesWithItems = invoices.map(inv => ({
    ...inv,
    line_items: invoiceLineItems.filter(li => li.invoice_id === inv.id),
  }));

  // Resolve staff names on time entries
  const normalizedTime = timeEntries.map(e => ({
    ...normalizeTimeEntry(e),
    worker: staffById[e.staff_id] || e.staff_id || '',
  }));

  // Normalize attachments and group by parent
  const allAttachments = attachments.map(normalizeAttachment);
  const attachmentsByParent = (type, id) => allAttachments.filter(a => a.parentType === type && a.parentId === id);

  // Normalize audit log entries and group by entity
  const allAudit = auditEntries.map(normalizeAuditEntry);
  const auditByEntity = (type, id) => allAudit.filter(a => a.entityType === type && a.entityId === id);

  // Normalize notes with their attachments
  const normalizedNotes = notes.map(n => ({
    ...normalizeNote(n),
    attachments: attachmentsByParent('note', n.id),
  }));

  // Normalize work orders with attachments and audit log
  const normalizedWOs = workOrders.map(wo => ({
    ...normalizeWorkOrder(wo),
    attachments: attachmentsByParent('work_order', wo.id),
    auditLog: auditByEntity('work_order', wo.id),
  }));

  // Normalize purchase orders with lines, attachments, and audit log
  const normalizedPOs = purchaseOrders.map(po => ({
    ...normalizePurchaseOrder(po),
    lines: poLines.filter(l => l.purchase_order_id === po.id).map(normalizePOLine),
    attachments: attachmentsByParent('purchase_order', po.id),
    auditLog: auditByEntity('purchase_order', po.id),
  }));

  // Normalize contractors with their documents
  const normalizedContractors = contractors.map(c => ({
    ...normalizeContractor(c),
    documents: contractorDocs.filter(d => d.contractor_id === c.id).map(normalizeContractorDoc),
  }));

  return {
    clients: customers.map(c => normalizeCustomer(c, sites)),
    staff: normalizedStaff,
    jobs: jobs.map(normalizeJob),
    quotes: quotesWithItems.map(normalizeQuote),
    invoices: invoicesWithItems.map(normalizeInvoice),
    timeEntries: normalizedTime,
    bills: bills.map(normalizeBill),
    schedule: schedule.map(normalizeSchedule),
    workOrders: normalizedWOs,
    purchaseOrders: normalizedPOs,
    contractors: normalizedContractors,
    suppliers: suppliers.map(normalizeSupplier),
    phases: phases.map(normalizePhase),
    tasks: tasks.map(normalizeTask),
    notes: normalizedNotes,
  };
}

// ── Customers ──────────────────────────────────────────────────────────────

export async function createCustomer(data) {
  const row = await q(
    supabase.from('customers')
      .insert({ name: data.name, email: data.email || null, phone: data.phone || null, address: data.address || null, suburb: data.suburb || null, state: data.state || null, postcode: data.postcode || null })
      .select().single()
  );
  return normalizeCustomer(row, []);
}

export async function updateCustomer(id, data) {
  const row = await q(
    supabase.from('customers')
      .update({ name: data.name, email: data.email || null, phone: data.phone || null, address: data.address || null, suburb: data.suburb || null, state: data.state || null, postcode: data.postcode || null })
      .eq('id', id).select().single()
  );
  return row;
}

export async function deleteCustomer(id) {
  return q(supabase.from('customers').delete().eq('id', id));
}

// ── Sites ──────────────────────────────────────────────────────────────────

export async function createSite(clientId, data) {
  const row = await q(
    supabase.from('sites')
      .insert({ customer_id: clientId, name: data.name, address: data.address || null, suburb: data.suburb || null, state: data.state || null, postcode: data.postcode || null, contact_name: data.contactName || null, contact_phone: data.contactPhone || null })
      .select().single()
  );
  return normalizeSite(row);
}

export async function updateSite(id, data) {
  const row = await q(
    supabase.from('sites')
      .update({ name: data.name, address: data.address || null, suburb: data.suburb || null, state: data.state || null, postcode: data.postcode || null, contact_name: data.contactName || null, contact_phone: data.contactPhone || null })
      .eq('id', id).select().single()
  );
  return normalizeSite(row);
}

export async function deleteSite(id) {
  return q(supabase.from('sites').delete().eq('id', id));
}

// ── Jobs ───────────────────────────────────────────────────────────────────

async function nextJobNumber() {
  const rows = await q(supabase.from('jobs').select('job_number').order('created_at', { ascending: false }).limit(1));
  if (!rows.length) return 'J-0001';
  const last = parseInt(rows[0].job_number?.replace(/\D/g, '') || '0', 10);
  return 'J-' + String(last + 1).padStart(4, '0');
}

export async function createJob(data) {
  const jobNumber = data.jobNumber || await nextJobNumber();
  const row = await q(
    supabase.from('jobs')
      .insert({ ...denormalizeJob(data), job_number: jobNumber })
      .select().single()
  );
  return normalizeJob(row);
}

export async function updateJob(id, data) {
  const row = await q(
    supabase.from('jobs')
      .update({ ...denormalizeJob(data), updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
  );
  return normalizeJob(row);
}

export async function deleteJob(id) {
  return q(supabase.from('jobs').delete().eq('id', id));
}

// ── Quotes ─────────────────────────────────────────────────────────────────

async function nextQuoteNumber() {
  const rows = await q(supabase.from('quotes').select('quote_number').order('created_at', { ascending: false }).limit(1));
  if (!rows.length) return 'Q-0001';
  const last = parseInt(rows[0].quote_number?.replace(/\D/g, '') || '0', 10);
  return 'Q-' + String(last + 1).padStart(4, '0');
}

export async function createQuote(data) {
  const quoteNumber = data.number || await nextQuoteNumber();
  const dbData = { ...denormalizeQuote(data), quote_number: quoteNumber };
  const quote = await q(supabase.from('quotes').insert(dbData).select().single());
  if (data.lineItems?.length) {
    await q(supabase.from('line_items').insert(denormalizeLineItems(data.lineItems, 'quote_id', quote.id)));
  }
  const items = await q(supabase.from('line_items').select('*').eq('quote_id', quote.id));
  return normalizeQuote({ ...quote, line_items: items });
}

export async function updateQuote(id, data) {
  const quote = await q(supabase.from('quotes').update(denormalizeQuote(data)).eq('id', id).select().single());
  await q(supabase.from('line_items').delete().eq('quote_id', id));
  if (data.lineItems?.length) {
    await q(supabase.from('line_items').insert(denormalizeLineItems(data.lineItems, 'quote_id', id)));
  }
  const items = await q(supabase.from('line_items').select('*').eq('quote_id', id));
  return normalizeQuote({ ...quote, line_items: items });
}

export async function deleteQuote(id) {
  return q(supabase.from('quotes').delete().eq('id', id));
}

// ── Invoices ───────────────────────────────────────────────────────────────

async function nextInvoiceNumber() {
  const rows = await q(supabase.from('invoices').select('invoice_number'));
  if (!rows.length) return 'INV-0001';
  const maxNum = rows.reduce((max, r) => {
    const n = parseInt((r.invoice_number || '').replace(/\D/g, '') || '0', 10);
    return n > max ? n : max;
  }, 0);
  return 'INV-' + String(maxNum + 1).padStart(4, '0');
}

export async function createInvoice(data) {
  const invNumber = data.number || await nextInvoiceNumber();
  const dbData = { ...denormalizeInvoice(data), invoice_number: invNumber };
  const invoice = await q(supabase.from('invoices').insert(dbData).select().single());
  if (data.lineItems?.length) {
    await q(supabase.from('line_items').insert(denormalizeLineItems(data.lineItems, 'invoice_id', invoice.id)));
  }
  const items = await q(supabase.from('line_items').select('*').eq('invoice_id', invoice.id));
  return normalizeInvoice({ ...invoice, line_items: items });
}

export async function updateInvoice(id, data) {
  const invoice = await q(supabase.from('invoices').update(denormalizeInvoice(data)).eq('id', id).select().single());
  await q(supabase.from('line_items').delete().eq('invoice_id', id));
  if (data.lineItems?.length) {
    await q(supabase.from('line_items').insert(denormalizeLineItems(data.lineItems, 'invoice_id', id)));
  }
  const items = await q(supabase.from('line_items').select('*').eq('invoice_id', id));
  return normalizeInvoice({ ...invoice, line_items: items });
}

export async function deleteInvoice(id) {
  return q(supabase.from('invoices').delete().eq('id', id));
}

// ── Time entries ───────────────────────────────────────────────────────────

export async function createTimeEntry(data, staffId) {
  const row = await q(
    supabase.from('time_entries')
      .insert({ job_id: data.jobId || null, staff_id: staffId || null, entry_date: data.date, hours: data.hours, notes: data.description || null })
      .select().single()
  );
  return { ...normalizeTimeEntry(row), worker: data.worker || '' };
}

export async function updateTimeEntry(id, data, staffId) {
  const row = await q(
    supabase.from('time_entries')
      .update({ job_id: data.jobId || null, staff_id: staffId || null, entry_date: data.date, hours: data.hours, notes: data.description || null })
      .eq('id', id).select().single()
  );
  return { ...normalizeTimeEntry(row), worker: data.worker || '' };
}

export async function deleteTimeEntry(id) {
  return q(supabase.from('time_entries').delete().eq('id', id));
}

// ── Bills ──────────────────────────────────────────────────────────────────

export async function createBill(data) {
  const row = await q(supabase.from('bills').insert(denormalizeBill(data)).select().single());
  return normalizeBill(row);
}

export async function updateBill(id, data) {
  const row = await q(supabase.from('bills').update(denormalizeBill(data)).eq('id', id).select().single());
  return normalizeBill(row);
}

export async function deleteBill(id) {
  return q(supabase.from('bills').delete().eq('id', id));
}

// ── Schedule ───────────────────────────────────────────────────────────────

export async function createScheduleEntry(data) {
  const row = await q(supabase.from('schedule').insert(denormalizeSchedule(data)).select().single());
  return normalizeSchedule(row);
}

export async function updateScheduleEntry(id, data) {
  const row = await q(supabase.from('schedule').update(denormalizeSchedule(data)).eq('id', id).select().single());
  return normalizeSchedule(row);
}

export async function deleteScheduleEntry(id) {
  return q(supabase.from('schedule').delete().eq('id', id));
}

// ── File upload helper ────────────────────────────────────────────────────

export async function uploadFile(bucket, path, dataUrl) {
  const blob = await fetch(dataUrl).then(r => r.blob());
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteFile(bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

// ── Attachments ───────────────────────────────────────────────────────────

export async function createAttachment(parentType, parentId, file) {
  // file: { name, size, type, dataUrl }
  const path = `${parentType}s/${parentId}/${file.name}`;
  const url = await uploadFile('attachments', path, file.dataUrl);
  const row = await q(
    supabase.from('attachments')
      .insert({ parent_type: parentType, parent_id: parentId, name: file.name, size: file.size, mime_type: file.type, url })
      .select().single()
  );
  return normalizeAttachment(row);
}

export async function deleteAttachment(id) {
  const rows = await q(supabase.from('attachments').select('*').eq('id', id));
  if (rows.length) {
    const att = rows[0];
    // Extract storage path from URL
    const urlObj = new URL(att.url);
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/attachments\/(.+)/);
    if (pathMatch) {
      try { await deleteFile('attachments', pathMatch[1]); } catch { /* ignore */ }
    }
  }
  return q(supabase.from('attachments').delete().eq('id', id));
}

// ── Work Orders ───────────────────────────────────────────────────────────

async function nextWORef() {
  const rows = await q(supabase.from('work_orders').select('ref').order('created_at', { ascending: false }).limit(1));
  if (!rows.length) return 'WO-101';
  const last = parseInt(rows[0].ref?.replace(/\D/g, '') || '100', 10);
  return 'WO-' + String(last + 1);
}

export async function createWorkOrder(data) {
  const ref = data.ref || await nextWORef();
  const row = await q(
    supabase.from('work_orders')
      .insert({ ...denormalizeWorkOrder(data), ref })
      .select().single()
  );
  return { ...normalizeWorkOrder(row), attachments: [], auditLog: [] };
}

export async function updateWorkOrder(id, data) {
  const row = await q(
    supabase.from('work_orders')
      .update({ ...denormalizeWorkOrder(data), updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
  );
  return normalizeWorkOrder(row);
}

export async function deleteWorkOrder(id) {
  // Delete attachments from storage first
  const atts = await q(supabase.from('attachments').select('*').eq('parent_type', 'work_order').eq('parent_id', id));
  for (const att of atts) {
    const urlObj = new URL(att.url);
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/attachments\/(.+)/);
    if (pathMatch) {
      try { await deleteFile('attachments', pathMatch[1]); } catch { /* ignore */ }
    }
  }
  return q(supabase.from('work_orders').delete().eq('id', id));
}

// ── Purchase Orders ───────────────────────────────────────────────────────

async function nextPORef() {
  const rows = await q(supabase.from('purchase_orders').select('ref').order('created_at', { ascending: false }).limit(1));
  if (!rows.length) return 'PO-201';
  const last = parseInt(rows[0].ref?.replace(/\D/g, '') || '200', 10);
  return 'PO-' + String(last + 1);
}

export async function createPurchaseOrder(data) {
  const ref = data.ref || await nextPORef();
  const po = await q(
    supabase.from('purchase_orders')
      .insert({ ...denormalizePurchaseOrder(data), ref })
      .select().single()
  );
  if (data.lines?.length) {
    await q(supabase.from('purchase_order_lines').insert(denormalizePOLines(data.lines, po.id)));
  }
  const lines = await q(supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', po.id));
  return { ...normalizePurchaseOrder(po), lines: lines.map(normalizePOLine), attachments: [], auditLog: [] };
}

export async function updatePurchaseOrder(id, data) {
  const po = await q(
    supabase.from('purchase_orders')
      .update({ ...denormalizePurchaseOrder(data), updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
  );
  // Replace lines
  await q(supabase.from('purchase_order_lines').delete().eq('purchase_order_id', id));
  if (data.lines?.length) {
    await q(supabase.from('purchase_order_lines').insert(denormalizePOLines(data.lines, id)));
  }
  const lines = await q(supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', id));
  return { ...normalizePurchaseOrder(po), lines: lines.map(normalizePOLine) };
}

export async function deletePurchaseOrder(id) {
  const atts = await q(supabase.from('attachments').select('*').eq('parent_type', 'purchase_order').eq('parent_id', id));
  for (const att of atts) {
    const urlObj = new URL(att.url);
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/attachments\/(.+)/);
    if (pathMatch) {
      try { await deleteFile('attachments', pathMatch[1]); } catch { /* ignore */ }
    }
  }
  return q(supabase.from('purchase_orders').delete().eq('id', id));
}

// ── Contractors ───────────────────────────────────────────────────────────

export async function createContractor(data) {
  const row = await qStrict(
    supabase.from('contractors').insert(denormalizeContractor(data)).select().single()
  );
  return { ...normalizeContractor(row), documents: [] };
}

export async function updateContractor(id, data) {
  const row = await qStrict(
    supabase.from('contractors')
      .update({ ...denormalizeContractor(data), updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
  );
  return normalizeContractor(row);
}

export async function deleteContractor(id) {
  // Delete document files from storage
  const docs = await q(supabase.from('contractor_documents').select('file_url').eq('contractor_id', id));
  for (const doc of docs) {
    if (doc.file_url) {
      try {
        const urlObj = new URL(doc.file_url);
        const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/documents\/(.+)/);
        if (pathMatch) await deleteFile('documents', pathMatch[1]);
      } catch { /* ignore */ }
    }
  }
  return qStrict(supabase.from('contractors').delete().eq('id', id));
}

// ── Contractor Documents ──────────────────────────────────────────────────

export async function createContractorDoc(contractorId, data) {
  const row = await qStrict(
    supabase.from('contractor_documents')
      .insert(denormalizeContractorDoc(data, contractorId))
      .select().single()
  );
  return normalizeContractorDoc(row);
}

export async function updateContractorDoc(id, data, contractorId) {
  const row = await qStrict(
    supabase.from('contractor_documents')
      .update(denormalizeContractorDoc(data, contractorId))
      .eq('id', id).select().single()
  );
  return normalizeContractorDoc(row);
}

export async function deleteContractorDoc(id) {
  const rows = await q(supabase.from('contractor_documents').select('file_url').eq('id', id));
  if (rows.length && rows[0].file_url) {
    try {
      const urlObj = new URL(rows[0].file_url);
      const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/documents\/(.+)/);
      if (pathMatch) await deleteFile('documents', pathMatch[1]);
    } catch { /* ignore */ }
  }
  return qStrict(supabase.from('contractor_documents').delete().eq('id', id));
}

// ── Suppliers ─────────────────────────────────────────────────────────────

function normalizeSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    email: row.email || '',
    phone: row.phone || '',
    abn: row.abn || '',
    notes: row.notes || '',
    address: row.address || '',
  };
}

function denormalizeSupplier(data) {
  return {
    name: data.name,
    contact: data.contact || null,
    email: data.email || null,
    phone: data.phone || null,
    abn: data.abn || null,
    notes: data.notes || null,
    address: data.address || null,
  };
}

export async function createSupplier(data) {
  const row = await qStrict(
    supabase.from('suppliers').insert(denormalizeSupplier(data)).select().single()
  );
  return normalizeSupplier(row);
}

export async function updateSupplier(id, data) {
  const row = await qStrict(
    supabase.from('suppliers')
      .update({ ...denormalizeSupplier(data), updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
  );
  return normalizeSupplier(row);
}

export async function deleteSupplier(id) {
  return qStrict(supabase.from('suppliers').delete().eq('id', id));
}

// ── Suppliers ──────────────────────────────────────────────────────────────

function normalizeSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || '',
    suburb: row.suburb || '',
    state: row.state || '',
    postcode: row.postcode || '',
    abn: row.abn || '',
    notes: row.notes || '',
  };
}

function denormalizeSupplier(data) {
  return {
    name: data.name,
    contact: data.contact || null,
    email: data.email || null,
    phone: data.phone || null,
    address: data.address || null,
    suburb: data.suburb || null,
    state: data.state || null,
    postcode: data.postcode || null,
    abn: data.abn || null,
    notes: data.notes || null,
  };
}

export async function fetchSuppliers() {
  const rows = await q(supabase.from('suppliers').select('*').order('name'));
  return rows.map(normalizeSupplier);
}

export async function createSupplier(data) {
  const row = await q(
    supabase.from('suppliers').insert(denormalizeSupplier(data)).select().single()
  );
  return normalizeSupplier(row);
}

export async function updateSupplier(id, data) {
  const row = await q(
    supabase.from('suppliers').update(denormalizeSupplier(data)).eq('id', id).select().single()
  );
  return normalizeSupplier(row);
}

export async function deleteSupplier(id) {
  return q(supabase.from('suppliers').delete().eq('id', id));
}

// ── Phases (Gantt) ────────────────────────────────────────────────────────

export async function createPhase(data) {
  const row = await q(
    supabase.from('job_phases')
      .insert({ job_id: data.jobId, name: data.name, start_date: data.startDate || null, end_date: data.endDate || null, color: data.color || '#3b82f6', progress: data.progress || 0, sort_order: data.sortOrder || 0 })
      .select().single()
  );
  return normalizePhase(row);
}

export async function updatePhase(id, data) {
  const row = await q(
    supabase.from('job_phases')
      .update({ name: data.name, start_date: data.startDate || null, end_date: data.endDate || null, color: data.color || '#3b82f6', progress: data.progress || 0, sort_order: data.sortOrder || 0 })
      .eq('id', id).select().single()
  );
  return normalizePhase(row);
}

export async function deletePhase(id) {
  return q(supabase.from('job_phases').delete().eq('id', id));
}

// ── Tasks (to-do) ─────────────────────────────────────────────────────────

export async function createTask(data) {
  const row = await q(
    supabase.from('job_tasks')
      .insert({ job_id: data.jobId, text: data.text, is_done: data.done || false, due_date: data.dueDate || null, assigned_to: data.assignedTo || null, sort_order: data.sortOrder || 0 })
      .select().single()
  );
  return normalizeTask(row);
}

export async function updateTask(id, data) {
  const row = await q(
    supabase.from('job_tasks')
      .update({ text: data.text, is_done: data.done || false, due_date: data.dueDate || null, assigned_to: data.assignedTo || null, sort_order: data.sortOrder || 0 })
      .eq('id', id).select().single()
  );
  return normalizeTask(row);
}

export async function deleteTask(id) {
  return q(supabase.from('job_tasks').delete().eq('id', id));
}

// ── Notes ─────────────────────────────────────────────────────────────────

export async function createNote(data) {
  const dbData = {
    job_id: data.jobId,
    text: data.text || null,
    category: data.category || 'general',
    created_by: data.createdBy || null,
    form_type: data.formType || null,
    form_data: data.formData || null,
    is_pdf: data.pdfNote || false,
    pdf_url: data.pdfUrl || null,
    pdf_thumbnail_url: data.pdfThumbnail || null,
    pdf_fields: data.pdfFields || null,
    pdf_original_name: data.pdfOriginalName || null,
  };
  const row = await q(supabase.from('job_notes').insert(dbData).select().single());
  return { ...normalizeNote(row), attachments: [] };
}

export async function updateNote(id, data) {
  const dbData = {
    text: data.text || null,
    category: data.category || 'general',
    form_type: data.formType || null,
    form_data: data.formData || null,
    is_pdf: data.pdfNote || false,
    pdf_url: data.pdfUrl || null,
    pdf_thumbnail_url: data.pdfThumbnail || null,
    pdf_fields: data.pdfFields || null,
    pdf_original_name: data.pdfOriginalName || null,
  };
  const row = await q(supabase.from('job_notes').update(dbData).eq('id', id).select().single());
  return normalizeNote(row);
}

export async function deleteNote(id) {
  // Delete attachments from storage
  const atts = await q(supabase.from('attachments').select('*').eq('parent_type', 'note').eq('parent_id', id));
  for (const att of atts) {
    const urlObj = new URL(att.url);
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/attachments\/(.+)/);
    if (pathMatch) {
      try { await deleteFile('attachments', pathMatch[1]); } catch { /* ignore */ }
    }
  }
  return q(supabase.from('job_notes').delete().eq('id', id));
}

// ── Audit Log ─────────────────────────────────────────────────────────────

export async function createAuditEntry(entityType, entityId, action, detail, userName, isAuto = false) {
  const row = await q(
    supabase.from('audit_log')
      .insert({ entity_type: entityType, entity_id: entityId, action, detail: detail || null, user_name: userName || null, is_auto: isAuto })
      .select().single()
  );
  return normalizeAuditEntry(row);
}

// ── Company Info ──────────────────────────────────────────────────────────

export async function fetchCompanyInfo() {
  const rows = await q(supabase.from('company_info').select('settings').limit(1));
  return rows.length ? rows[0].settings : null;
}

export async function saveCompanyInfo(settings) {
  const existing = await q(supabase.from('company_info').select('id').limit(1));
  if (existing.length) {
    return qStrict(supabase.from('company_info').update({ settings, updated_at: new Date().toISOString() }).eq('id', existing[0].id).select());
  }
  return qStrict(supabase.from('company_info').insert({ settings }).select());
}

// ── Email Templates ───────────────────────────────────────────────────────

export async function fetchTemplates() {
  const rows = await q(supabase.from('email_templates').select('templates').limit(1));
  return rows.length ? rows[0].templates : null;
}

export async function saveTemplates(templates) {
  const existing = await q(supabase.from('email_templates').select('id').limit(1));
  if (existing.length) {
    return q(supabase.from('email_templates').update({ templates, updated_at: new Date().toISOString() }).eq('id', existing[0].id).select());
  }
  return q(supabase.from('email_templates').insert({ templates }).select());
}

// ── User Permissions ──────────────────────────────────────────────────────

export async function fetchAllUserPermissions() {
  const rows = await q(supabase.from('user_permissions').select('user_id, permissions'));
  return Object.fromEntries(rows.map(r => [r.user_id, r.permissions]));
}

export async function saveUserPermissions(userId, permissions) {
  return q(supabase.from('user_permissions').upsert({
    user_id: userId,
    permissions,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select());
}

// ── Outbound Defaults (for Actions page) ──────────────────────────────────

export async function fetchOutboundDefaults() {
  const rows = await q(supabase.from('voice_settings_defaults').select('settings').eq('type', 'outbound').limit(1));
  return rows.length ? rows[0].settings : null;
}
