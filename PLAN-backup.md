# Data Backup & Integrity — Standalone Tool

## Goal
A standalone Node.js CLI tool (`apps/backup-tool/`) that connects directly to Supabase/PostgreSQL and can **export**, **verify**, and **restore** all business data — independent of the React app.

## Why standalone?
- Works even if the app is broken or unavailable
- Can be run from any machine with the service role key
- Portable: backup files are plain JSON, easy to import into another service
- Can be scheduled via cron or run manually

---

## Architecture

```
apps/backup-tool/
├── package.json          # minimal deps: @supabase/supabase-js, commander, chalk
├── .env.example          # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
├── backup.js             # CLI entry point
└── lib/
    ├── export.js          # Export all tables to JSON
    ├── verify.js          # Integrity checks (orphans, FK consistency, checksums)
    ├── restore.js         # Restore from backup file
    └── tables.js          # Table registry (names, schemas, relationships)
```

---

## Implementation Steps

### Step 1: Table Registry (`lib/tables.js`)
Define all tables with their schema, foreign key relationships, and export order:

```js
const TABLES = [
  { name: 'staff', schema: 'shared', fks: [] },
  { name: 'contractors', schema: 'shared', fks: [] },
  { name: 'contractor_documents', schema: 'shared', fks: [{ col: 'contractor_id', ref: 'shared.contractors' }] },
  { name: 'sites', schema: 'jobs', fks: [] },
  { name: 'customers', schema: 'jobs', fks: [] },
  { name: 'jobs', schema: 'jobs', fks: [{ col: 'customer_id', ref: 'jobs.customers' }, { col: 'site_id', ref: 'jobs.sites' }] },
  { name: 'quotes', schema: 'jobs', fks: [{ col: 'job_id', ref: 'jobs.jobs' }] },
  { name: 'invoices', schema: 'jobs', fks: [{ col: 'job_id', ref: 'jobs.jobs' }] },
  { name: 'line_items', schema: 'jobs', fks: [{ col: 'quote_id', ref: 'jobs.quotes' }, { col: 'invoice_id', ref: 'jobs.invoices' }] },
  { name: 'job_phases', schema: 'jobs', fks: [{ col: 'job_id', ref: 'jobs.jobs' }] },
  { name: 'job_tasks', schema: 'jobs', fks: [{ col: 'job_id', ref: 'jobs.jobs' }] },
  { name: 'job_notes', schema: 'jobs', fks: [{ col: 'job_id', ref: 'jobs.jobs' }] },
  { name: 'attachments', schema: 'jobs', fks: [] },
  { name: 'work_orders', schema: 'jobs', fks: [{ col: 'job_id', ref: 'jobs.jobs' }] },
  { name: 'purchase_orders', schema: 'jobs', fks: [{ col: 'job_id', ref: 'jobs.jobs' }] },
  { name: 'purchase_order_lines', schema: 'jobs', fks: [{ col: 'purchase_order_id', ref: 'jobs.purchase_orders' }] },
  { name: 'time_entries', schema: 'timesheets', fks: [{ col: 'staff_id', ref: 'shared.staff' }] },
  { name: 'bills', schema: 'bills', fks: [] },
  { name: 'suppliers', schema: 'bills', fks: [] },
  { name: 'schedule', schema: 'scheduling', fks: [] },
  { name: 'audit_log', schema: 'shared', fks: [] },
  { name: 'xero_sync_log', schema: 'shared', fks: [] },
];
```

### Step 2: Export (`lib/export.js`)
- Connect using service role key (bypasses RLS)
- Fetch all rows from each table in the registry
- Build a backup manifest:
  ```json
  {
    "version": 1,
    "created_at": "2026-03-23T...",
    "supabase_url": "https://xxx.supabase.co",
    "tables": {
      "shared.staff": { "count": 5, "checksum": "sha256:abc...", "data": [...] },
      ...
    },
    "total_records": 1234,
    "checksum": "sha256:xyz..."  // hash of all table checksums
  }
  ```
- Write to `backup-YYYY-MM-DD-HHmmss.json`

### Step 3: Integrity Verification (`lib/verify.js`)
Two modes:
1. **Verify backup file** — validate checksums, record counts, FK references within the JSON
2. **Verify live database** — connect to Supabase and check for:
   - Orphaned records (FK references to non-existent parents)
   - Duplicate unique values (job_number, invoice_number)
   - Missing required fields
   - Data consistency (e.g. invoice totals match line items)

### Step 4: Restore (`lib/restore.js`)
- Read backup JSON file
- Validate checksums before restoring
- Insert data in FK-safe order (parents before children)
- Use upsert to handle existing records
- Support `--dry-run` flag to preview without writing
- Support `--table` flag to restore specific tables only

### Step 5: CLI (`backup.js`)
```
Usage:
  npx backup export                    # Export all data to JSON file
  npx backup export --output ./my.json # Export to specific file
  npx backup verify backup.json        # Verify a backup file's integrity
  npx backup verify --live             # Check live database integrity
  npx backup restore backup.json       # Restore from backup
  npx backup restore backup.json --dry-run  # Preview restore
  npx backup restore backup.json --table staff  # Restore one table
```

---

## Key Decisions
- **Service role key** — required to bypass RLS and access all data
- **JSON format** — human-readable, easy to parse, portable to any system
- **SHA-256 checksums** — per-table and overall to detect corruption/tampering
- **No app dependency** — standalone Node.js, separate package.json
- **Upsert on restore** — safe for partial restores, won't duplicate data

## Not in scope (can add later)
- Supabase Storage file backups (PDFs, images) — could add as a follow-up
- Automated scheduled backups (cron) — just document how to set up
- Incremental backups — full export is simple and sufficient for this scale
- Encryption — the backup file should be stored securely by the admin
