/**
 * Tool handler implementations for FieldOps Voice Assistant.
 * Each handler interacts with Supabase to read/write data.
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

// ─── READ HANDLERS ─────────────────────────────────────────────────

async function listJobs({ status, limit = 20 }) {
  let query = supabase.from('jobs').select('id, title, status, client, estimate, address').limit(limit);
  if (status) {
    query = query.eq('status', status);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list jobs: ${error.message}`);
  return { jobs: data || [], count: (data || []).length };
}

async function getJob({ job_id }) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', job_id)
    .single();
  if (error) throw new Error(`Failed to get job: ${error.message}`);
  return data;
}

async function getSchedule({ start_date, end_date, assignee }) {
  let query = supabase
    .from('schedule_entries')
    .select('id, job_id, date, title, time, assignee')
    .gte('date', start_date)
    .lte('date', end_date)
    .order('date', { ascending: true })
    .order('time', { ascending: true });
  if (assignee) {
    query = query.ilike('assignee', `%${assignee}%`);
  }
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

async function getPendingBills({ status = 'pending', supplier }) {
  let query = supabase
    .from('bills')
    .select('id, supplier, amount, status, date, category')
    .eq('status', status)
    .order('date', { ascending: false });
  if (supplier) {
    query = query.ilike('supplier', `%${supplier}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to get bills: ${error.message}`);
  const total = (data || []).reduce((sum, b) => sum + (b.amount || 0), 0);
  return { bills: data || [], count: (data || []).length, total };
}

async function getWorkOrders({ status, assignee }) {
  let query = supabase
    .from('work_orders')
    .select('id, ref, status, assignee, due_date')
    .order('due_date', { ascending: true });
  if (status) {
    query = query.eq('status', status);
  }
  if (assignee) {
    query = query.ilike('assignee', `%${assignee}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to get work orders: ${error.message}`);
  return { work_orders: data || [], count: (data || []).length };
}

async function getQuotes({ job_id, status }) {
  let query = supabase
    .from('quotes')
    .select('id, job_id, client, amount, status')
    .order('amount', { ascending: false });
  if (job_id) {
    query = query.eq('job_id', job_id);
  }
  if (status) {
    query = query.eq('status', status);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to get quotes: ${error.message}`);
  const total = (data || []).reduce((sum, q) => sum + (q.amount || 0), 0);
  return { quotes: data || [], count: (data || []).length, total };
}

// ─── WRITE HANDLERS ────────────────────────────────────────────────

async function addScheduleEntry({ job_id, date, title, time, assignee }) {
  const { data, error } = await supabase
    .from('schedule_entries')
    .insert({
      job_id: job_id || null,
      date,
      title,
      time: time || null,
      assignee: assignee || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to add schedule entry: ${error.message}`);
  return { success: true, entry: data };
}

async function addJobNote({ job_id, note }) {
  // Fetch existing notes, append new one
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('notes')
    .eq('id', job_id)
    .single();
  if (fetchError) throw new Error(`Failed to fetch job: ${fetchError.message}`);

  const timestamp = new Date().toISOString();
  let updatedNotes;

  if (Array.isArray(job.notes)) {
    updatedNotes = [...job.notes, { text: note, timestamp, source: 'voice' }];
  } else if (typeof job.notes === 'string') {
    updatedNotes = `${job.notes}\n\n[${timestamp} - via voice] ${note}`;
  } else {
    updatedNotes = [{ text: note, timestamp, source: 'voice' }];
  }

  const { error: updateError } = await supabase
    .from('jobs')
    .update({ notes: updatedNotes })
    .eq('id', job_id);
  if (updateError) throw new Error(`Failed to add note: ${updateError.message}`);
  return { success: true, job_id, note, timestamp };
}

async function updateJobStatus({ job_id, status }) {
  const { data, error } = await supabase
    .from('jobs')
    .update({ status })
    .eq('id', job_id)
    .select('id, title, status')
    .single();
  if (error) throw new Error(`Failed to update job status: ${error.message}`);
  return { success: true, job: data };
}

async function updateWorkOrderStatus({ work_order_id, status }) {
  const { data, error } = await supabase
    .from('work_orders')
    .update({ status })
    .eq('id', work_order_id)
    .select('id, ref, status')
    .single();
  if (error) throw new Error(`Failed to update work order: ${error.message}`);
  return { success: true, work_order: data };
}

async function logTimeEntry({ job_id, worker, hours, date, description }) {
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      job_id,
      worker,
      hours,
      date,
      description: description || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to log time entry: ${error.message}`);
  return { success: true, entry: data };
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
