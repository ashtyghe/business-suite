import { supabase } from './supabase';

// ── Query helper ───────────────────────────────────────────────────────────

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ── Normalizers (DB → frontend shape) ─────────────────────────────────────

function normalizeSite(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address || '',
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
    billable: row.billable !== false,
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
    role: row.role,
    active: row.active,
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
  };
}

function denormalizeLineItems(lineItems, parentKey, parentId) {
  return (lineItems || []).map(li => ({
    description: li.desc,
    quantity: li.qty,
    unit_price: li.rate,
    unit: li.unit || 'ea',
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
    title: data.title || null,
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
  ] = await Promise.all([
    q(supabase.schema('jobs').from('customers').select('*').order('name')),
    q(supabase.schema('jobs').from('sites').select('*').order('name')),
    q(supabase.schema('jobs').from('jobs').select('*').order('created_at', { ascending: false })),
    q(supabase.schema('jobs').from('quotes').select('*').order('created_at', { ascending: false })),
    q(supabase.schema('jobs').from('line_items').select('*').not('quote_id', 'is', null)),
    q(supabase.schema('jobs').from('invoices').select('*').order('created_at', { ascending: false })),
    q(supabase.schema('jobs').from('line_items').select('*').not('invoice_id', 'is', null)),
    q(supabase.schema('timesheets').from('entries').select('*').order('entry_date', { ascending: false })),
    q(supabase.schema('bills').from('captures').select('*').order('created_at', { ascending: false })),
    q(supabase.schema('scheduling').from('entries').select('*').order('entry_date')),
    q(supabase.schema('shared').from('staff').select('*').order('full_name')),
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

  return {
    clients: customers.map(c => normalizeCustomer(c, sites)),
    staff: normalizedStaff,
    jobs: jobs.map(normalizeJob),
    quotes: quotesWithItems.map(normalizeQuote),
    invoices: invoicesWithItems.map(normalizeInvoice),
    timeEntries: normalizedTime,
    bills: bills.map(normalizeBill),
    schedule: schedule.map(normalizeSchedule),
  };
}

// ── Customers ──────────────────────────────────────────────────────────────

export async function createCustomer(data) {
  const row = await q(
    supabase.schema('jobs').from('customers')
      .insert({ name: data.name, email: data.email || null, phone: data.phone || null, address: data.address || null })
      .select().single()
  );
  return normalizeCustomer(row, []);
}

export async function updateCustomer(id, data) {
  const row = await q(
    supabase.schema('jobs').from('customers')
      .update({ name: data.name, email: data.email || null, phone: data.phone || null, address: data.address || null })
      .eq('id', id).select().single()
  );
  return row;
}

export async function deleteCustomer(id) {
  return q(supabase.schema('jobs').from('customers').delete().eq('id', id));
}

// ── Sites ──────────────────────────────────────────────────────────────────

export async function createSite(clientId, data) {
  const row = await q(
    supabase.schema('jobs').from('sites')
      .insert({ customer_id: clientId, name: data.name, address: data.address || null, contact_name: data.contactName || null, contact_phone: data.contactPhone || null })
      .select().single()
  );
  return normalizeSite(row);
}

export async function updateSite(id, data) {
  const row = await q(
    supabase.schema('jobs').from('sites')
      .update({ name: data.name, address: data.address || null, contact_name: data.contactName || null, contact_phone: data.contactPhone || null })
      .eq('id', id).select().single()
  );
  return normalizeSite(row);
}

export async function deleteSite(id) {
  return q(supabase.schema('jobs').from('sites').delete().eq('id', id));
}

// ── Jobs ───────────────────────────────────────────────────────────────────

let _jobCounter = null;
async function nextJobNumber() {
  const rows = await q(supabase.schema('jobs').from('jobs').select('job_number').order('created_at', { ascending: false }).limit(1));
  if (!rows.length) return 'J-0001';
  const last = parseInt(rows[0].job_number?.replace(/\D/g, '') || '0', 10);
  return 'J-' + String(last + 1).padStart(4, '0');
}

export async function createJob(data) {
  const jobNumber = data.jobNumber || await nextJobNumber();
  const row = await q(
    supabase.schema('jobs').from('jobs')
      .insert({ ...denormalizeJob(data), job_number: jobNumber })
      .select().single()
  );
  return normalizeJob(row);
}

export async function updateJob(id, data) {
  const row = await q(
    supabase.schema('jobs').from('jobs')
      .update({ ...denormalizeJob(data), updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
  );
  return normalizeJob(row);
}

export async function deleteJob(id) {
  return q(supabase.schema('jobs').from('jobs').delete().eq('id', id));
}

// ── Quotes ─────────────────────────────────────────────────────────────────

async function nextQuoteNumber() {
  const rows = await q(supabase.schema('jobs').from('quotes').select('quote_number').order('created_at', { ascending: false }).limit(1));
  if (!rows.length) return 'Q-0001';
  const last = parseInt(rows[0].quote_number?.replace(/\D/g, '') || '0', 10);
  return 'Q-' + String(last + 1).padStart(4, '0');
}

export async function createQuote(data) {
  const quoteNumber = data.number || await nextQuoteNumber();
  const dbData = { ...denormalizeQuote(data), quote_number: quoteNumber };
  const quote = await q(supabase.schema('jobs').from('quotes').insert(dbData).select().single());
  if (data.lineItems?.length) {
    await q(supabase.schema('jobs').from('line_items').insert(denormalizeLineItems(data.lineItems, 'quote_id', quote.id)));
  }
  const items = await q(supabase.schema('jobs').from('line_items').select('*').eq('quote_id', quote.id));
  return normalizeQuote({ ...quote, line_items: items });
}

export async function updateQuote(id, data) {
  const quote = await q(supabase.schema('jobs').from('quotes').update(denormalizeQuote(data)).eq('id', id).select().single());
  await q(supabase.schema('jobs').from('line_items').delete().eq('quote_id', id));
  if (data.lineItems?.length) {
    await q(supabase.schema('jobs').from('line_items').insert(denormalizeLineItems(data.lineItems, 'quote_id', id)));
  }
  const items = await q(supabase.schema('jobs').from('line_items').select('*').eq('quote_id', id));
  return normalizeQuote({ ...quote, line_items: items });
}

export async function deleteQuote(id) {
  return q(supabase.schema('jobs').from('quotes').delete().eq('id', id));
}

// ── Invoices ───────────────────────────────────────────────────────────────

async function nextInvoiceNumber() {
  const rows = await q(supabase.schema('jobs').from('invoices').select('invoice_number').order('created_at', { ascending: false }).limit(1));
  if (!rows.length) return 'INV-0001';
  const last = parseInt(rows[0].invoice_number?.replace(/\D/g, '') || '0', 10);
  return 'INV-' + String(last + 1).padStart(4, '0');
}

export async function createInvoice(data) {
  const invNumber = data.number || await nextInvoiceNumber();
  const dbData = { ...denormalizeInvoice(data), invoice_number: invNumber };
  const invoice = await q(supabase.schema('jobs').from('invoices').insert(dbData).select().single());
  if (data.lineItems?.length) {
    await q(supabase.schema('jobs').from('line_items').insert(denormalizeLineItems(data.lineItems, 'invoice_id', invoice.id)));
  }
  const items = await q(supabase.schema('jobs').from('line_items').select('*').eq('invoice_id', invoice.id));
  return normalizeInvoice({ ...invoice, line_items: items });
}

export async function updateInvoice(id, data) {
  const invoice = await q(supabase.schema('jobs').from('invoices').update(denormalizeInvoice(data)).eq('id', id).select().single());
  await q(supabase.schema('jobs').from('line_items').delete().eq('invoice_id', id));
  if (data.lineItems?.length) {
    await q(supabase.schema('jobs').from('line_items').insert(denormalizeLineItems(data.lineItems, 'invoice_id', id)));
  }
  const items = await q(supabase.schema('jobs').from('line_items').select('*').eq('invoice_id', id));
  return normalizeInvoice({ ...invoice, line_items: items });
}

export async function deleteInvoice(id) {
  return q(supabase.schema('jobs').from('invoices').delete().eq('id', id));
}

// ── Time entries ───────────────────────────────────────────────────────────

export async function createTimeEntry(data, staffId) {
  const row = await q(
    supabase.schema('timesheets').from('entries')
      .insert({ job_id: data.jobId || null, staff_id: staffId || null, entry_date: data.date, hours: data.hours, notes: data.description || null, billable: data.billable !== false })
      .select().single()
  );
  return { ...normalizeTimeEntry(row), worker: data.worker || '' };
}

export async function updateTimeEntry(id, data, staffId) {
  const row = await q(
    supabase.schema('timesheets').from('entries')
      .update({ job_id: data.jobId || null, staff_id: staffId || null, entry_date: data.date, hours: data.hours, notes: data.description || null, billable: data.billable !== false })
      .eq('id', id).select().single()
  );
  return { ...normalizeTimeEntry(row), worker: data.worker || '' };
}

export async function deleteTimeEntry(id) {
  return q(supabase.schema('timesheets').from('entries').delete().eq('id', id));
}

// ── Bills ──────────────────────────────────────────────────────────────────

export async function createBill(data) {
  const row = await q(supabase.schema('bills').from('captures').insert(denormalizeBill(data)).select().single());
  return normalizeBill(row);
}

export async function updateBill(id, data) {
  const row = await q(supabase.schema('bills').from('captures').update(denormalizeBill(data)).eq('id', id).select().single());
  return normalizeBill(row);
}

export async function deleteBill(id) {
  return q(supabase.schema('bills').from('captures').delete().eq('id', id));
}

// ── Schedule ───────────────────────────────────────────────────────────────

export async function createScheduleEntry(data) {
  const row = await q(supabase.schema('scheduling').from('entries').insert(denormalizeSchedule(data)).select().single());
  return normalizeSchedule(row);
}

export async function updateScheduleEntry(id, data) {
  const row = await q(supabase.schema('scheduling').from('entries').update(denormalizeSchedule(data)).eq('id', id).select().single());
  return normalizeSchedule(row);
}

export async function deleteScheduleEntry(id) {
  return q(supabase.schema('scheduling').from('entries').delete().eq('id', id));
}
