-- ============================================================================
-- Xero Integration: tables for OAuth tokens, sync tracking, account mappings
-- ============================================================================

-- ── Phase A: New tables ──────────────────────────────────────────────────────

-- OAuth token storage (one active connection per org)
CREATE TABLE shared.xero_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE,
  tenant_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  connected_by UUID REFERENCES shared.staff(id),
  connected_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Sync audit log
CREATE TABLE shared.xero_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,           -- 'invoice', 'bill', 'contact'
  entity_id UUID NOT NULL,
  direction TEXT NOT NULL,             -- 'push', 'pull'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending','success','error','retrying'
  xero_id TEXT,
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_xero_sync_log_entity ON shared.xero_sync_log(entity_type, entity_id);

-- Configurable Xero account code mappings
CREATE TABLE shared.xero_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,           -- 'invoice', 'bill'
  category TEXT NOT NULL DEFAULT '',   -- '' for invoices, bill category for bills
  xero_account_code TEXT NOT NULL,
  xero_account_name TEXT,
  UNIQUE(entity_type, category)
);

-- Seed defaults: Sales for invoices, General Expenses for bills
INSERT INTO shared.xero_account_mappings (entity_type, category, xero_account_code, xero_account_name)
VALUES
  ('invoice', '',               '200', 'Sales'),
  ('bill',    'Materials',      '400', 'General Expenses'),
  ('bill',    'Subcontractor',  '400', 'General Expenses'),
  ('bill',    'Plant & Equipment', '400', 'General Expenses'),
  ('bill',    'Labour',         '400', 'General Expenses'),
  ('bill',    'Other',          '400', 'General Expenses');


-- ── Phase B: ALTER existing tables ───────────────────────────────────────────

-- Customers & suppliers: Xero contact link
ALTER TABLE jobs.customers ADD COLUMN IF NOT EXISTS xero_contact_id TEXT;
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS xero_contact_id TEXT;

-- Invoices: sync tracking + skip flag
ALTER TABLE jobs.invoices ADD COLUMN IF NOT EXISTS xero_sync_status TEXT;
ALTER TABLE jobs.invoices ADD COLUMN IF NOT EXISTS xero_last_synced_at TIMESTAMPTZ;
ALTER TABLE jobs.invoices ADD COLUMN IF NOT EXISTS xero_skip BOOLEAN DEFAULT false;

-- Bills: sync tracking + skip flag
ALTER TABLE bills.captures ADD COLUMN IF NOT EXISTS xero_sync_status TEXT;
ALTER TABLE bills.captures ADD COLUMN IF NOT EXISTS xero_last_synced_at TIMESTAMPTZ;
ALTER TABLE bills.captures ADD COLUMN IF NOT EXISTS xero_skip BOOLEAN DEFAULT false;


-- ── Phase C: Public views (recreate to pick up new columns) ─────────────────

CREATE OR REPLACE VIEW public.customers  AS SELECT * FROM jobs.customers;
CREATE OR REPLACE VIEW public.invoices   AS SELECT * FROM jobs.invoices;
CREATE OR REPLACE VIEW public.bills      AS SELECT * FROM bills.captures;
CREATE OR REPLACE VIEW public.suppliers  AS SELECT * FROM bills.suppliers;

-- New views
CREATE OR REPLACE VIEW public.xero_connections      AS SELECT id, tenant_id, tenant_name, connected_by, connected_at, is_active FROM shared.xero_connections;
CREATE OR REPLACE VIEW public.xero_sync_log         AS SELECT * FROM shared.xero_sync_log;
CREATE OR REPLACE VIEW public.xero_account_mappings AS SELECT * FROM shared.xero_account_mappings;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_sync_log         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_account_mappings TO anon, authenticated;
GRANT SELECT                         ON public.xero_connections      TO authenticated;


-- ── Phase D: RLS ─────────────────────────────────────────────────────────────

ALTER TABLE shared.xero_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.xero_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.xero_account_mappings ENABLE ROW LEVEL SECURITY;

-- xero_connections: only service_role (edge functions) can read/write tokens.
-- The public.xero_connections view exposes only safe columns.
CREATE POLICY "service_role_only" ON shared.xero_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- sync_log & account_mappings: authenticated users can read/write
CREATE POLICY "full_access" ON shared.xero_sync_log
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON shared.xero_account_mappings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
