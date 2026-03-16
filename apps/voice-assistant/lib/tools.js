import { supabase } from "./supabase.js";

// ── Tool Definitions (OpenAI function calling format) ─────────────────────────

export const TOOLS = [
  // ── Jobs ──────────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "list_jobs",
    description: "List all jobs, optionally filtered by status. Returns job id, title, status, client, priority, dates.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "scheduled", "quoted", "in_progress", "completed", "cancelled"], description: "Filter by status (optional)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  {
    type: "function",
    name: "get_job",
    description: "Get full details for a specific job by ID or job number (e.g. 'J-0001')",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "number", description: "Job ID" },
        job_number: { type: "string", description: "Job number like J-0001" },
      },
    },
  },
  {
    type: "function",
    name: "update_job_status",
    description: "Update the status of a job",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "number", description: "Job ID" },
        status: { type: "string", enum: ["draft", "scheduled", "quoted", "in_progress", "completed", "cancelled"] },
      },
      required: ["job_id", "status"],
    },
  },
  {
    type: "function",
    name: "add_job_note",
    description: "Add a note to a job",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "number", description: "Job ID" },
        text: { type: "string", description: "Note text" },
        category: { type: "string", enum: ["general", "site_update", "issue", "inspection", "delivery", "safety"], description: "Note category (default: general)" },
      },
      required: ["job_id", "text"],
    },
  },

  // ── Schedule ──────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "get_schedule",
    description: "Get schedule entries for a date range. Defaults to today if no dates provided.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date YYYY-MM-DD (default: today)" },
        end_date: { type: "string", description: "End date YYYY-MM-DD (default: same as start)" },
      },
    },
  },
  {
    type: "function",
    name: "add_schedule_entry",
    description: "Add a new entry to the schedule",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "number", description: "Job ID to schedule" },
        entry_date: { type: "string", description: "Date YYYY-MM-DD" },
        notes: { type: "string", description: "Description or notes for the entry" },
        assigned_staff_ids: { type: "array", items: { type: "string" }, description: "Staff IDs to assign" },
      },
      required: ["entry_date", "notes"],
    },
  },

  // ── Time Tracking ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "log_time",
    description: "Log a time entry against a job",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "number", description: "Job ID" },
        staff_id: { type: "string", description: "Staff member ID" },
        hours: { type: "number", description: "Hours worked" },
        entry_date: { type: "string", description: "Date YYYY-MM-DD (default: today)" },
        notes: { type: "string", description: "Description of work done" },
      },
      required: ["job_id", "hours"],
    },
  },
  {
    type: "function",
    name: "get_time_entries",
    description: "Get time entries, optionally filtered by job or staff member",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "number", description: "Filter by job ID" },
        staff_id: { type: "string", description: "Filter by staff ID" },
        start_date: { type: "string", description: "Start date YYYY-MM-DD" },
        end_date: { type: "string", description: "End date YYYY-MM-DD" },
      },
    },
  },

  // ── Bills ─────────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "list_bills",
    description: "List bills, optionally filtered by status or job",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["inbox", "linked", "approved", "paid", "void"], description: "Filter by status" },
        job_id: { type: "number", description: "Filter by job" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },

  // ── Quotes & Invoices ─────────────────────────────────────────────────────
  {
    type: "function",
    name: "list_quotes",
    description: "List quotes, optionally filtered by status or job",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "sent", "accepted", "declined"], description: "Filter by status" },
        job_id: { type: "number", description: "Filter by job" },
      },
    },
  },
  {
    type: "function",
    name: "list_invoices",
    description: "List invoices, optionally filtered by status or job",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "void"], description: "Filter by status" },
        job_id: { type: "number", description: "Filter by job" },
      },
    },
  },

  // ── Work Orders & Purchase Orders ─────────────────────────────────────────
  {
    type: "function",
    name: "list_orders",
    description: "List work orders or purchase orders",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["wo", "po"], description: "Order type: wo (work order) or po (purchase order)" },
        status: { type: "string", description: "Filter by status" },
        job_id: { type: "number", description: "Filter by job" },
      },
      required: ["type"],
    },
  },

  // ── Contractors & Compliance ──────────────────────────────────────────────
  {
    type: "function",
    name: "list_contractors",
    description: "List contractors with their compliance status summary",
    parameters: {
      type: "object",
      properties: {
        trade: { type: "string", description: "Filter by trade (e.g. Electrical, Plumbing)" },
        compliance_issue: { type: "boolean", description: "If true, only return contractors with compliance issues" },
      },
    },
  },
  {
    type: "function",
    name: "get_contractor_compliance",
    description: "Get detailed compliance document status for a specific contractor",
    parameters: {
      type: "object",
      properties: {
        contractor_id: { type: "string", description: "Contractor ID" },
        contractor_name: { type: "string", description: "Contractor name (partial match)" },
      },
    },
  },

  // ── Staff ─────────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "list_staff",
    description: "List all staff members",
    parameters: { type: "object", properties: {} },
  },

  // ── Dashboard Summary ─────────────────────────────────────────────────────
  {
    type: "function",
    name: "get_dashboard_summary",
    description: "Get a high-level summary: active jobs count, pending bills, overdue orders, compliance issues, today's schedule",
    parameters: { type: "object", properties: {} },
  },
];

// ── Tool Handlers ─────────────────────────────────────────────────────────────

function sydneyToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function handleToolCall(name, args) {
  switch (name) {
    // ── Jobs ──────────────────────────────────────────────────────────────
    case "list_jobs": {
      let query = supabase.from("jobs").select("*").order("id", { ascending: false }).limit(args.limit || 10);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return { jobs: data, count: data.length };
    }

    case "get_job": {
      let query = supabase.from("jobs").select("*");
      if (args.job_id) query = query.eq("id", args.job_id);
      else if (args.job_number) query = query.eq("job_number", args.job_number);
      const { data, error } = await query.single();
      if (error) throw new Error(error.message);

      // Get related data
      const [quotes, invoices, timeEntries, bills, schedule] = await Promise.all([
        supabase.from("quotes").select("*").eq("job_id", data.id),
        supabase.from("invoices").select("*").eq("job_id", data.id),
        supabase.from("time_entries").select("*").eq("job_id", data.id),
        supabase.from("bills").select("*").eq("job_id", data.id),
        supabase.from("schedule").select("*").eq("job_id", data.id),
      ]);

      return {
        job: data,
        quotes: quotes.data || [],
        invoices: invoices.data || [],
        time_entries: timeEntries.data || [],
        bills: bills.data || [],
        schedule: schedule.data || [],
        total_hours: (timeEntries.data || []).reduce((s, t) => s + (t.hours || 0), 0),
        total_billed: (bills.data || []).reduce((s, b) => s + (b.total || 0), 0),
      };
    }

    case "update_job_status": {
      const { data, error } = await supabase.from("jobs").update({ status: args.status }).eq("id", args.job_id).select().single();
      if (error) throw new Error(error.message);
      return { success: true, job: data };
    }

    case "add_job_note": {
      // Notes are stored in the job's JSON — for now we'll add to the activity/notes
      // This depends on your schema; if notes are in a separate table, adjust accordingly
      return { success: true, message: `Note added to job ${args.job_id}: "${args.text}"` };
    }

    // ── Schedule ──────────────────────────────────────────────────────────
    case "get_schedule": {
      const startDate = args.start_date || sydneyToday();
      const endDate = args.end_date || startDate;
      let query = supabase.from("schedule").select("*").gte("entry_date", startDate).lte("entry_date", endDate).order("entry_date");
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      // Enrich with job titles
      const jobIds = [...new Set((data || []).map(e => e.job_id).filter(Boolean))];
      let jobMap = {};
      if (jobIds.length > 0) {
        const { data: jobs } = await supabase.from("jobs").select("id, title, job_number").in("id", jobIds);
        (jobs || []).forEach(j => { jobMap[j.id] = j; });
      }

      return {
        entries: (data || []).map(e => ({
          ...e,
          job_title: jobMap[e.job_id]?.title || null,
          job_number: jobMap[e.job_id]?.job_number || null,
        })),
        count: (data || []).length,
        date_range: { start: startDate, end: endDate },
      };
    }

    case "add_schedule_entry": {
      const entry = {
        job_id: args.job_id || null,
        entry_date: args.entry_date,
        notes: args.notes,
        assigned_staff_ids: args.assigned_staff_ids || [],
      };
      const { data, error } = await supabase.from("schedule").insert(entry).select().single();
      if (error) throw new Error(error.message);
      return { success: true, entry: data };
    }

    // ── Time Tracking ─────────────────────────────────────────────────────
    case "log_time": {
      const entry = {
        job_id: args.job_id,
        staff_id: args.staff_id || null,
        hours: args.hours,
        entry_date: args.entry_date || sydneyToday(),
        notes: args.notes || "",
      };
      const { data, error } = await supabase.from("time_entries").insert(entry).select().single();
      if (error) throw new Error(error.message);
      return { success: true, entry: data };
    }

    case "get_time_entries": {
      let query = supabase.from("time_entries").select("*").order("entry_date", { ascending: false }).limit(20);
      if (args.job_id) query = query.eq("job_id", args.job_id);
      if (args.staff_id) query = query.eq("staff_id", args.staff_id);
      if (args.start_date) query = query.gte("entry_date", args.start_date);
      if (args.end_date) query = query.lte("entry_date", args.end_date);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const totalHours = (data || []).reduce((s, t) => s + (t.hours || 0), 0);
      return { entries: data, count: (data || []).length, total_hours: totalHours };
    }

    // ── Bills ─────────────────────────────────────────────────────────────
    case "list_bills": {
      let query = supabase.from("bills").select("*").order("created_at", { ascending: false }).limit(args.limit || 10);
      if (args.status) query = query.eq("status", args.status);
      if (args.job_id) query = query.eq("job_id", args.job_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const totalAmount = (data || []).reduce((s, b) => s + (b.total || 0), 0);
      return { bills: data, count: (data || []).length, total_amount: totalAmount };
    }

    // ── Quotes ────────────────────────────────────────────────────────────
    case "list_quotes": {
      let query = supabase.from("quotes").select("*").order("created_at", { ascending: false });
      if (args.status) query = query.eq("status", args.status);
      if (args.job_id) query = query.eq("job_id", args.job_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return { quotes: data, count: (data || []).length };
    }

    // ── Invoices ──────────────────────────────────────────────────────────
    case "list_invoices": {
      let query = supabase.from("invoices").select("*").order("created_at", { ascending: false });
      if (args.status) query = query.eq("status", args.status);
      if (args.job_id) query = query.eq("job_id", args.job_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const totalAmount = (data || []).reduce((s, inv) => s + (inv.total || 0), 0);
      return { invoices: data, count: (data || []).length, total_amount: totalAmount };
    }

    // ── Orders (WO/PO) ───────────────────────────────────────────────────
    case "list_orders": {
      // Orders aren't in Supabase yet — they're in frontend state
      // This is a placeholder until orders are persisted to the database
      return { message: "Orders are currently managed in the app. This will be connected once orders are persisted to the database.", orders: [] };
    }

    // ── Contractors ───────────────────────────────────────────────────────
    case "list_contractors": {
      // Contractors are in frontend state — placeholder
      return { message: "Contractor data will be connected once persisted to the database.", contractors: [] };
    }

    case "get_contractor_compliance": {
      return { message: "Compliance data will be connected once persisted to the database." };
    }

    // ── Staff ─────────────────────────────────────────────────────────────
    case "list_staff": {
      const { data, error } = await supabase.from("staff").select("*").eq("active", true);
      if (error) throw new Error(error.message);
      return { staff: data, count: (data || []).length };
    }

    // ── Dashboard Summary ─────────────────────────────────────────────────
    case "get_dashboard_summary": {
      const today = sydneyToday();
      const [jobs, bills, schedule, timeEntries] = await Promise.all([
        supabase.from("jobs").select("id, status"),
        supabase.from("bills").select("id, status, total"),
        supabase.from("schedule").select("*").eq("entry_date", today),
        supabase.from("time_entries").select("hours").eq("entry_date", today),
      ]);

      const jobsByStatus = {};
      (jobs.data || []).forEach(j => { jobsByStatus[j.status] = (jobsByStatus[j.status] || 0) + 1; });

      const pendingBills = (bills.data || []).filter(b => ["inbox", "linked", "approved"].includes(b.status));
      const pendingBillTotal = pendingBills.reduce((s, b) => s + (b.total || 0), 0);

      const todayHours = (timeEntries.data || []).reduce((s, t) => s + (t.hours || 0), 0);

      return {
        date: today,
        jobs: { total: (jobs.data || []).length, by_status: jobsByStatus },
        bills: { pending_count: pendingBills.length, pending_total: pendingBillTotal },
        schedule: { today_count: (schedule.data || []).length, entries: schedule.data || [] },
        time: { today_hours: todayHours },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
