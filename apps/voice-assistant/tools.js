/**
 * OpenAI Realtime API function tool definitions for FieldOps Voice Assistant.
 * These define the tools the AI can call to interact with Supabase data.
 */

const tools = [
  // ─── READ OPERATIONS ───────────────────────────────────────────────

  {
    type: 'function',
    name: 'list_jobs',
    description:
      'List jobs, optionally filtered by status. Returns job id, title, status, client, estimate, and address.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'scheduled', 'quoted', 'in_progress', 'completed', 'cancelled'],
          description: 'Filter jobs by status. Omit to return all jobs.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of jobs to return. Default 20.',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'get_job',
    description:
      'Get full details of a specific job by its ID or job number (e.g. J-0001).',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID (UUID) or job number (e.g. J-0001) to look up.',
        },
      },
      required: ['job_id'],
    },
  },

  {
    type: 'function',
    name: 'get_schedule',
    description:
      'Get schedule entries for a date range. Use this when someone asks what is on the schedule today, this week, next week, or for a specific date.',
    parameters: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format.',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format.',
        },
        assignee: {
          type: 'string',
          description: 'Filter by assignee name. Omit for all assignees.',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },

  {
    type: 'function',
    name: 'check_contractor_compliance',
    description:
      'Check the compliance status of contractors. Returns contractor details and document expiry information.',
    parameters: {
      type: 'object',
      properties: {
        contractor_name: {
          type: 'string',
          description:
            'Name of a specific contractor to check. Omit to check all contractors.',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'get_pending_bills',
    description:
      'Get pending/unpaid bills. Can filter by supplier or category.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['inbox', 'linked', 'approved', 'paid'],
          description: 'Filter by bill status. Default is "linked".',
        },
        supplier: {
          type: 'string',
          description: 'Filter by supplier name.',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'get_work_orders',
    description: 'Get work orders, optionally filtered by status or assignee.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in-progress', 'completed', 'cancelled'],
          description: 'Filter by work order status.',
        },
        assignee: {
          type: 'string',
          description: 'Filter by assigned person.',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'get_quotes',
    description:
      'Get quotes, optionally for a specific job. Returns quote amounts and statuses.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'Filter quotes by job ID.',
        },
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'accepted', 'declined'],
          description: 'Filter by quote status.',
        },
      },
      required: [],
    },
  },

  // ─── WRITE OPERATIONS ──────────────────────────────────────────────

  {
    type: 'function',
    name: 'add_schedule_entry',
    description:
      'Add a new entry to the schedule. Use this when someone wants to schedule work, a meeting, or any event.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID this schedule entry relates to, if any.',
        },
        date: {
          type: 'string',
          description: 'Date for the entry in YYYY-MM-DD format.',
        },
        title: {
          type: 'string',
          description: 'Title or description of the schedule entry.',
        },
        time: {
          type: 'string',
          description: 'Time for the entry, e.g. "9:00 AM" or "14:00".',
        },
        assignee: {
          type: 'string',
          description: 'Person assigned to this entry.',
        },
      },
      required: ['date', 'title'],
    },
  },

  {
    type: 'function',
    name: 'add_job_note',
    description:
      'Add a note to an existing job. Use this when someone wants to record information against a job.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID to add the note to.',
        },
        note: {
          type: 'string',
          description: 'The note text to add.',
        },
      },
      required: ['job_id', 'note'],
    },
  },

  {
    type: 'function',
    name: 'update_job_status',
    description: 'Update the status of a job.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID to update.',
        },
        status: {
          type: 'string',
          enum: ['draft', 'scheduled', 'quoted', 'in_progress', 'completed', 'cancelled'],
          description: 'The new status.',
        },
      },
      required: ['job_id', 'status'],
    },
  },

  {
    type: 'function',
    name: 'update_work_order_status',
    description: 'Update the status of a work order.',
    parameters: {
      type: 'object',
      properties: {
        work_order_id: {
          type: 'string',
          description: 'The work order ID to update.',
        },
        status: {
          type: 'string',
          enum: ['open', 'in-progress', 'completed', 'cancelled'],
          description: 'The new status.',
        },
      },
      required: ['work_order_id', 'status'],
    },
  },

  {
    type: 'function',
    name: 'create_work_order',
    description:
      'Create a new work order. Use when someone wants to raise a work order for a contractor or trade.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID or job number (e.g. J-0001) this work order relates to.',
        },
        contractor_name: {
          type: 'string',
          description: 'Name of the contractor.',
        },
        trade: {
          type: 'string',
          description: 'Trade type, e.g. electrical, plumbing, carpentry.',
        },
        scope_of_work: {
          type: 'string',
          description: 'Description of the work to be done.',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format.',
        },
        po_limit: {
          type: 'number',
          description: 'Purchase order limit in dollars.',
        },
      },
      required: ['scope_of_work'],
    },
  },

  {
    type: 'function',
    name: 'log_time_entry',
    description:
      'Log a time entry for a job. Use when someone reports hours worked.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID this time entry is for.',
        },
        worker: {
          type: 'string',
          description: 'Name of the worker.',
        },
        hours: {
          type: 'number',
          description: 'Number of hours worked.',
        },
        date: {
          type: 'string',
          description: 'Date of the work in YYYY-MM-DD format.',
        },
        description: {
          type: 'string',
          description: 'Description of work performed.',
        },
      },
      required: ['job_id', 'worker', 'hours', 'date'],
    },
  },
];

module.exports = { tools };
