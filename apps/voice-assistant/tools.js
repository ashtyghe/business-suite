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
          enum: ['Draft', 'Approved', 'Sent', 'Viewed', 'Accepted', 'Completed', 'Billed', 'Cancelled'],
          description: 'Filter by work order status.',
        },
        assignee: {
          type: 'string',
          description: 'Filter by contractor name.',
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

  {
    type: 'function',
    name: 'list_customers',
    description:
      'List all customers/clients. Use when someone asks about clients, customers, or who they work for.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of customers to return. Default 50.',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'list_contractors',
    description:
      'List all contractors/subcontractors. Use when someone asks about their subbies or contractors.',
    parameters: {
      type: 'object',
      properties: {
        trade: {
          type: 'string',
          description: 'Filter by trade type, e.g. electrical, plumbing.',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'list_suppliers',
    description:
      'List all suppliers. Use when someone asks about suppliers or material providers.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of suppliers to return. Default 50.',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'get_purchase_orders',
    description: 'Get purchase orders, optionally filtered by status or supplier.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['Draft', 'Approved', 'Sent', 'Viewed', 'Accepted', 'Completed', 'Billed', 'Cancelled'],
          description: 'Filter by PO status.',
        },
        supplier: {
          type: 'string',
          description: 'Filter by supplier name.',
        },
        job_id: {
          type: 'string',
          description: 'Filter by job ID or job number.',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'get_invoices',
    description: 'Get invoices, optionally filtered by status or job.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'paid', 'overdue'],
          description: 'Filter by invoice status.',
        },
        job_id: {
          type: 'string',
          description: 'Filter by job ID or job number.',
        },
      },
      required: [],
    },
  },

  // ─── WRITE OPERATIONS ──────────────────────────────────────────────

  {
    type: 'function',
    name: 'create_job',
    description:
      'Create a new job. Use when someone wants to add a new job, project, or piece of work.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title or name of the job.',
        },
        description: {
          type: 'string',
          description: 'Description of the work to be done.',
        },
        customer_name: {
          type: 'string',
          description: 'Name of the customer/client this job is for.',
        },
        site_address: {
          type: 'string',
          description: 'Site address where the work will be done.',
        },
        status: {
          type: 'string',
          enum: ['draft', 'scheduled', 'quoted', 'in_progress', 'completed'],
          description: 'Initial status. Default is "draft".',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Priority level. Default is "medium".',
        },
        scheduled_start: {
          type: 'string',
          description: 'Scheduled start date in YYYY-MM-DD format.',
        },
        scheduled_end: {
          type: 'string',
          description: 'Scheduled end date in YYYY-MM-DD format.',
        },
      },
      required: ['title'],
    },
  },

  {
    type: 'function',
    name: 'update_job',
    description:
      'Update an existing job. Use when someone wants to change job details like title, description, address, priority, or dates.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID or job number (e.g. J-0001) to update.',
        },
        title: { type: 'string', description: 'New title.' },
        description: { type: 'string', description: 'New description.' },
        site_address: { type: 'string', description: 'New site address.' },
        status: {
          type: 'string',
          enum: ['draft', 'scheduled', 'quoted', 'in_progress', 'completed', 'cancelled'],
          description: 'New status.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'New priority.',
        },
        scheduled_start: { type: 'string', description: 'New start date YYYY-MM-DD.' },
        scheduled_end: { type: 'string', description: 'New end date YYYY-MM-DD.' },
      },
      required: ['job_id'],
    },
  },

  {
    type: 'function',
    name: 'create_customer',
    description:
      'Create a new customer/client. Use when someone mentions a new client or customer to add to the system.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer/company name.' },
        contact_name: { type: 'string', description: 'Primary contact person name.' },
        email: { type: 'string', description: 'Email address.' },
        phone: { type: 'string', description: 'Phone number.' },
        address: { type: 'string', description: 'Business or billing address.' },
      },
      required: ['name'],
    },
  },

  {
    type: 'function',
    name: 'update_customer',
    description: 'Update an existing customer/client details.',
    parameters: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'The customer ID to update.' },
        customer_name: { type: 'string', description: 'Search by name if ID not known.' },
        name: { type: 'string', description: 'New name.' },
        contact_name: { type: 'string', description: 'New contact person.' },
        email: { type: 'string', description: 'New email.' },
        phone: { type: 'string', description: 'New phone.' },
        address: { type: 'string', description: 'New address.' },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'create_contractor',
    description:
      'Add a new contractor/subcontractor to the system. Use when someone mentions a new subbie or contractor.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contractor or company name.' },
        contact: { type: 'string', description: 'Contact person name.' },
        email: { type: 'string', description: 'Email address.' },
        phone: { type: 'string', description: 'Phone number.' },
        trade: { type: 'string', description: 'Trade type, e.g. electrical, plumbing, carpentry.' },
        abn: { type: 'string', description: 'Australian Business Number.' },
      },
      required: ['name'],
    },
  },

  {
    type: 'function',
    name: 'update_contractor',
    description: 'Update an existing contractor/subcontractor.',
    parameters: {
      type: 'object',
      properties: {
        contractor_id: { type: 'string', description: 'The contractor ID to update.' },
        contractor_name: { type: 'string', description: 'Search by name if ID not known.' },
        name: { type: 'string', description: 'New name.' },
        contact: { type: 'string', description: 'New contact person.' },
        email: { type: 'string', description: 'New email.' },
        phone: { type: 'string', description: 'New phone.' },
        trade: { type: 'string', description: 'New trade.' },
        abn: { type: 'string', description: 'New ABN.' },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'create_supplier',
    description:
      'Add a new supplier to the system. Use when someone mentions a new supplier or material provider.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Supplier or company name.' },
        contact_name: { type: 'string', description: 'Contact person name.' },
        email: { type: 'string', description: 'Email address.' },
        phone: { type: 'string', description: 'Phone number.' },
        abn: { type: 'string', description: 'Australian Business Number.' },
      },
      required: ['name'],
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
    name: 'create_purchase_order',
    description:
      'Create a new purchase order. Use when someone wants to raise a PO for materials or supplies.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID or job number this PO relates to.',
        },
        supplier_name: {
          type: 'string',
          description: 'Name of the supplier.',
        },
        items: {
          type: 'string',
          description: 'Description of items to order. For multiple items, separate with semicolons.',
        },
        delivery_address: {
          type: 'string',
          description: 'Delivery address for the order.',
        },
        due_date: {
          type: 'string',
          description: 'Due/delivery date in YYYY-MM-DD format.',
        },
        po_limit: {
          type: 'number',
          description: 'Purchase order dollar limit.',
        },
      },
      required: ['items'],
    },
  },

  {
    type: 'function',
    name: 'create_invoice',
    description:
      'Create a new invoice for a job. Use when someone wants to invoice a client or raise an invoice.',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID or job number to invoice.',
        },
        invoice_number: {
          type: 'string',
          description: 'Invoice number. Auto-generated if not provided.',
        },
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'paid'],
          description: 'Invoice status. Default "draft".',
        },
        notes: {
          type: 'string',
          description: 'Notes or description for the invoice.',
        },
      },
      required: ['job_id'],
    },
  },

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
          description: 'The job ID or job number to add the note to.',
        },
        note: {
          type: 'string',
          description: 'The note text to add.',
        },
        category: {
          type: 'string',
          enum: ['general', 'site_update', 'issue', 'inspection', 'delivery', 'safety'],
          description: 'Note category. Default "general".',
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
          description: 'The job ID or job number to update.',
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
          enum: ['Draft', 'Approved', 'Sent', 'Viewed', 'Accepted', 'Completed', 'Billed', 'Cancelled'],
          description: 'The new status.',
        },
      },
      required: ['work_order_id', 'status'],
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

  // ─── REMINDERS ────────────────────────────────────────────────────

  {
    type: 'function',
    name: 'create_reminder',
    description:
      'Create a personal reminder with a due date. Use when someone says "remind me to..." or "set a reminder for...".',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The reminder text.',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format.',
        },
        type: {
          type: 'string',
          enum: ['text', 'checkbox'],
          description: 'Reminder type. Default "text".',
        },
        job_id: {
          type: 'string',
          description: 'Optional job ID or job number to link this reminder to.',
        },
      },
      required: ['text', 'due_date'],
    },
  },

  {
    type: 'function',
    name: 'list_reminders',
    description:
      'List reminders, optionally filtered by status. Use when someone asks about their reminders, what is due, or what is overdue.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'completed', 'dismissed'],
          description: 'Filter by status. Omit for all.',
        },
        overdue_only: {
          type: 'boolean',
          description: 'If true, only return overdue reminders (pending with past due date).',
        },
      },
      required: [],
    },
  },

  {
    type: 'function',
    name: 'update_reminder',
    description:
      'Update or complete a reminder. Use when someone wants to mark a reminder as done, change the text, or reschedule.',
    parameters: {
      type: 'object',
      properties: {
        reminder_id: {
          type: 'string',
          description: 'The reminder ID to update.',
        },
        text: {
          type: 'string',
          description: 'New reminder text.',
        },
        due_date: {
          type: 'string',
          description: 'New due date in YYYY-MM-DD format.',
        },
        status: {
          type: 'string',
          enum: ['pending', 'completed', 'dismissed'],
          description: 'New status. Use "completed" to mark as done.',
        },
      },
      required: ['reminder_id'],
    },
  },
];

module.exports = { tools };
