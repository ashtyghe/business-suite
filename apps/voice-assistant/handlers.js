/**
 * Tool handler implementations for FieldOps Voice Assistant.
 * Each handler interacts with Supabase to read/write data.
 * Column names match the actual Supabase schema.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized');
} else {
  console.warn('Supabase credentials missing — tool calls will return mock data');
}

// ─── HELPER: check if table exists ──────────────────────────────────

async function tableExists(tableName) {
  const { error } = await supabase.from(tableName).select('id').limit(1);
  return !error || error.code !== 'PGRST205';
}

// ─── READ HANDLERS ─────────────────────────────────────────────────

async function listJobs({ status, limit = 20 }) {
  // Actual schema: id, job_number, title, description, status, customer_id, site_address, scheduled_start, scheduled_end
  let query = supabase.from('jobs').select('id, job_number, title, description, status, site_address, scheduled_start, scheduled_end').limit(limit);
  if (status) {
    query = query.eq('status', status);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list jobs: ${error.message}`);
  return { jobs: (data || []).map(j => ({ ...j, ref: j.job_number })), count: (data || []).length };
}

async function getJob({ job_id }) {
  // Try by ID first, then by job_number
  let query = supabase.from('jobs').select('*');
  if (job_id && job_id.startsWith('J-')) {
    query = query.eq('job_number', job_id);
  } else {
    query = query.eq('id', job_id);
  }
  const { data, error } = await query.single();
  if (error) throw new Error(`Failed to get job: ${error.message}`);
  return data;
}

async function getSchedule({ start_date, end_date, assignee }) {
  // Try the schedule view (scheduling.entries) first, fall back to jobs
  const exists = await tableExists('schedule');
  if (!exists) {
    // Fall back to jobs with scheduled dates
    let query = supabase.from('jobs')
      .select('id, job_number, title, status, site_address, scheduled_start, scheduled_end')
      .not('scheduled_start', 'is', null);
    if (start_date) query = query.gte('scheduled_start', start_date);
    if (end_date) query = query.lte('scheduled_start', end_date);
    query = query.order('scheduled_start', { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(`Failed to get schedule: ${error.message}`);
    return {
      entries: (data || []).map(j => ({
        id: j.id,
        title: j.title,
        ref: j.job_number,
        date: j.scheduled_start?.split('T')[0],
        status: j.status,
        location: j.site_address,
      })),
      count: (data || []).length,
      source: 'jobs',
    };
  }

  let query = supabase.from('schedule')
    .select('*')
    .gte('entry_date', start_date)
    .lte('entry_date', end_date)
    .order('entry_date', { ascending: true });
  const { data, error } = await query;
  if (error) throw new Error(`Failed to get schedule: ${error.message}`);
  return { entries: data || [], count: (data || []).length };
}

async function checkContractorCompliance({ contractor_name }) {
  let query = supabase.from('contractors').select('*');
  if (contractor_name) {
    query = query.ilike('name', `%${contractor_name}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to check compliance: ${error.message}`);

  // Fetch all contractor documents
  const contractorIds = (data || []).map(c => c.id);
  let docs = [];
  if (contractorIds.length) {
    const { data: docData, error: docErr } = await supabase
      .from('contractor_documents')
      .select('*')
      .in('contractor_id', contractorIds);
    if (!docErr) docs = docData || [];
  }

  const today = new Date().toISOString().split('T')[0];
  const results = (data || []).map((contractor) => {
    const documents = docs.filter(d => d.contractor_id === contractor.id);
    const expiredDocs = documents.filter((doc) => doc.expiry_date && doc.expiry_date < today);
    const expiringDocs = documents.filter((doc) => {
      if (!doc.expiry_date) return false;
      const daysUntil = Math.ceil(
        (new Date(doc.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
      );
      return daysUntil > 0 && daysUntil <= 30;
    });
    return {
      id: contractor.id,
      name: contractor.name,
      trade: contractor.trade,
      phone: contractor.phone,
      email: contractor.email,
      total_documents: documents.length,
      expired_documents: expiredDocs.length,
      expiring_soon: expiringDocs.length,
      is_compliant: expiredDocs.length === 0,
      expired_details: expiredDocs.map((d) => d.title || d.doc_type),
      expiring_details: expiringDocs.map((d) => ({
        name: d.title || d.doc_type,
        expiry: d.expiry_date,
      })),
    };
  });
  return { contractors: results, count: results.length };
}

async function getPendingBills({ status = 'linked', supplier }) {
  // Actual schema: id, job_id, supplier_name, invoice_number, invoice_date, subtotal, tax, total, status, category, notes
  let query = supabase
    .from('bills')
    .select('id, job_id, supplier_name, invoice_number, invoice_date, subtotal, tax, total, status, category, notes')
    .eq('status', status)
    .order('invoice_date', { ascending: false });
  if (supplier) {
    query = query.ilike('supplier_name', `%${supplier}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to get bills: ${error.message}`);
  const billTotal = (data || []).reduce((sum, b) => sum + (b.total || 0), 0);
  return {
    bills: (data || []).map(b => ({
      id: b.id,
      supplier: b.supplier_name,
      invoice_number: b.invoice_number,
      amount: b.total,
      subtotal: b.subtotal,
      tax: b.tax,
      status: b.status,
      date: b.invoice_date,
      category: b.category,
    })),
    count: (data || []).length,
    total: billTotal,
  };
}

async function getWorkOrders({ status, assignee }) {
  let query = supabase
    .from('work_orders')
    .select('*')
    .order('due_date', { ascending: true });
  if (status) query = query.eq('status', status);
  if (assignee) query = query.ilike('contractor_name', `%${assignee}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to get work orders: ${error.message}`);
  return { work_orders: data || [], count: (data || []).length };
}

async function getQuotes({ job_id, status }) {
  // Actual schema: id, job_id, quote_number, status, tax_rate, notes
  let query = supabase
    .from('quotes')
    .select('id, job_id, quote_number, status, tax_rate, notes')
    .order('created_at', { ascending: false });
  if (job_id) query = query.eq('job_id', job_id);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to get quotes: ${error.message}`);
  return {
    quotes: (data || []).map(q => ({ ...q, ref: q.quote_number })),
    count: (data || []).length,
  };
}

// ─── WRITE HANDLERS ────────────────────────────────────────────────

async function addScheduleEntry({ job_id, date, title, time, assignee }) {
  const { data, error } = await supabase
    .from('schedule')
    .insert({
      job_id: job_id || null,
      entry_date: date,
      title: title || null,
      start_time: time || null,
      notes: assignee ? `Assigned to ${assignee}` : null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to add schedule entry: ${error.message}`);
  return { success: true, entry: data };
}

async function addJobNote({ job_id, note }) {
  // Resolve job_number to UUID if needed
  let actualJobId = job_id;
  if (job_id && job_id.startsWith('J-')) {
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('job_number', job_id)
      .single();
    if (jobErr) throw new Error(`Failed to find job ${job_id}: ${jobErr.message}`);
    actualJobId = job.id;
  }

  const { data, error } = await supabase
    .from('job_notes')
    .insert({
      job_id: actualJobId,
      text: note,
      category: 'general',
      created_by: 'voice',
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to add note: ${error.message}`);
  return { success: true, job_id: actualJobId, note_id: data.id, note, timestamp: data.created_at };
}

async function updateJobStatus({ job_id, status }) {
  let query = supabase.from('jobs');
  if (job_id && job_id.startsWith('J-')) {
    const { data, error } = await query
      .update({ status })
      .eq('job_number', job_id)
      .select('id, job_number, title, status')
      .single();
    if (error) throw new Error(`Failed to update job status: ${error.message}`);
    return { success: true, job: data };
  }
  const { data, error } = await query
    .update({ status })
    .eq('id', job_id)
    .select('id, job_number, title, status')
    .single();
  if (error) throw new Error(`Failed to update job status: ${error.message}`);
  return { success: true, job: data };
}

async function updateWorkOrderStatus({ work_order_id, status }) {
  const { data, error } = await supabase
    .from('work_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', work_order_id)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update work order: ${error.message}`);
  return { success: true, work_order: data };
}

async function createWorkOrder({ job_id, contractor_name, trade, scope_of_work, due_date, po_limit }) {
  // Generate next WO ref
  const { data: latest } = await supabase
    .from('work_orders')
    .select('ref')
    .order('created_at', { ascending: false })
    .limit(1);
  const lastNum = latest?.length ? parseInt(latest[0].ref.replace('WO-', ''), 10) : 100;
  const ref = `WO-${lastNum + 1}`;

  // Resolve job_number to UUID if needed
  let actualJobId = job_id || null;
  if (job_id && job_id.startsWith('J-')) {
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('job_number', job_id)
      .single();
    if (jobErr) throw new Error(`Failed to find job ${job_id}: ${jobErr.message}`);
    actualJobId = job.id;
  }

  // Look up contractor if name provided
  let contractorId = null;
  if (contractor_name) {
    const { data: contractors } = await supabase
      .from('contractors')
      .select('id, name')
      .ilike('name', `%${contractor_name}%`)
      .limit(1);
    if (contractors?.length) contractorId = contractors[0].id;
  }

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      ref,
      job_id: actualJobId,
      contractor_id: contractorId,
      contractor_name: contractor_name || null,
      trade: trade || null,
      scope_of_work,
      due_date: due_date || null,
      po_limit: po_limit || 0,
      status: 'Draft',
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create work order: ${error.message}`);
  return { success: true, work_order: data, ref };
}

async function logTimeEntry({ job_id, worker, hours, date, description }) {
  // Actual schema: id, staff_id, job_id, entry_date, hours, notes
  // Look up job by number if needed
  let actualJobId = job_id;
  if (job_id && job_id.startsWith('J-')) {
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('job_number', job_id)
      .single();
    if (jobErr) throw new Error(`Failed to find job ${job_id}: ${jobErr.message}`);
    actualJobId = job.id;
  }

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      job_id: actualJobId,
      staff_id: null, // TODO: look up staff by name if worker provided
      entry_date: date,
      hours,
      notes: description || (worker ? `Logged by ${worker}` : null),
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to log time entry: ${error.message}`);
  return { success: true, entry: { ...data, worker: worker || 'Unknown' } };
}

// ─── DISPATCH ──────────────────────────────────────────────────────

const handlerMap = {
  list_jobs: listJobs,
  get_job: getJob,
  get_schedule: getSchedule,
  check_contractor_compliance: checkContractorCompliance,
  get_pending_bills: getPendingBills,
  get_work_orders: getWorkOrders,
  get_quotes: getQuotes,
  add_schedule_entry: addScheduleEntry,
  add_job_note: addJobNote,
  update_job_status: updateJobStatus,
  update_work_order_status: updateWorkOrderStatus,
  create_work_order: createWorkOrder,
  log_time_entry: logTimeEntry,
};

/**
 * Execute a tool by name with the given arguments.
 * Returns a JSON string of the result.
 */
async function handleToolCall(toolName, args) {
  if (!supabase) {
    return JSON.stringify({ error: 'Database not connected. Supabase credentials are missing.' });
  }
  const handler = handlerMap[toolName];
  if (!handler) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
  try {
    const result = await handler(args);
    return JSON.stringify(result);
  } catch (err) {
    console.error(`Tool ${toolName} error:`, err.message);
    return JSON.stringify({ error: err.message });
  }
}

module.exports = { handleToolCall };
