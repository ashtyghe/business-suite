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
  // schedule_entries table may not exist — check first
  const exists = await tableExists('schedule_entries');
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

  let query = supabase.from('schedule_entries')
    .select('*')
    .gte('date', start_date)
    .lte('date', end_date)
    .order('date', { ascending: true });
  if (assignee) {
    query = query.ilike('assignee', `%${assignee}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to get schedule: ${error.message}`);
  return { entries: data || [], count: (data || []).length };
}

async function checkContractorCompliance({ contractor_name }) {
  const exists = await tableExists('contractors');
  if (!exists) {
    return { contractors: [], count: 0, note: 'Contractors table not found in database. Contractors are currently stored in the frontend app only.' };
  }

  let query = supabase.from('contractors').select('*');
  if (contractor_name) {
    query = query.ilike('name', `%${contractor_name}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to check compliance: ${error.message}`);

  const today = new Date().toISOString().split('T')[0];
  const results = (data || []).map((contractor) => {
    const documents = contractor.documents || [];
    const expiredDocs = documents.filter((doc) => doc.expiry && doc.expiry < today);
    const expiringDocs = documents.filter((doc) => {
      if (!doc.expiry) return false;
      const daysUntil = Math.ceil(
        (new Date(doc.expiry) - new Date()) / (1000 * 60 * 60 * 24)
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
      expired_details: expiredDocs.map((d) => d.name || d.type),
      expiring_details: expiringDocs.map((d) => ({
        name: d.name || d.type,
        expiry: d.expiry,
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
  const exists = await tableExists('work_orders');
  if (!exists) {
    return { work_orders: [], count: 0, note: 'Work orders table not found in database. Work orders are currently stored in the frontend app only.' };
  }

  let query = supabase
    .from('work_orders')
    .select('*')
    .order('due_date', { ascending: true });
  if (status) query = query.eq('status', status);
  if (assignee) query = query.ilike('assignee', `%${assignee}%`);
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
  const exists = await tableExists('schedule_entries');
  if (!exists) {
    return { success: false, error: 'Schedule entries table not found. Schedule is currently managed in the frontend app.' };
  }

  const { data, error } = await supabase
    .from('schedule_entries')
    .insert({ job_id: job_id || null, date, title, time: time || null, assignee: assignee || null })
    .select()
    .single();
  if (error) throw new Error(`Failed to add schedule entry: ${error.message}`);
  return { success: true, entry: data };
}

async function addJobNote({ job_id, note }) {
  // Try by job_number first
  let query = supabase.from('jobs').select('id, description');
  if (job_id && job_id.startsWith('J-')) {
    query = query.eq('job_number', job_id);
  } else {
    query = query.eq('id', job_id);
  }
  const { data: job, error: fetchError } = await query.single();
  if (fetchError) throw new Error(`Failed to fetch job: ${fetchError.message}`);

  const timestamp = new Date().toISOString();
  const noteText = `\n\n[${timestamp} - via voice] ${note}`;
  const updatedDesc = (job.description || '') + noteText;

  const { error: updateError } = await supabase
    .from('jobs')
    .update({ description: updatedDesc })
    .eq('id', job.id);
  if (updateError) throw new Error(`Failed to add note: ${updateError.message}`);
  return { success: true, job_id: job.id, note, timestamp };
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
  const exists = await tableExists('work_orders');
  if (!exists) {
    return { success: false, error: 'Work orders table not found in database.' };
  }

  const { data, error } = await supabase
    .from('work_orders')
    .update({ status })
    .eq('id', work_order_id)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update work order: ${error.message}`);
  return { success: true, work_order: data };
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
