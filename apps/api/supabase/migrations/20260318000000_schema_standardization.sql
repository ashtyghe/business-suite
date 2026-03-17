-- ============================================================================
-- Schema Standardization: add missing tables, columns, storage, views, RLS
-- ============================================================================

-- ── Phase A: ALTER existing tables ──────────────────────────────────────────

-- jobs.jobs: add estimate columns, priority, tags
ALTER TABLE jobs.jobs ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE jobs.jobs ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE jobs.jobs ADD COLUMN IF NOT EXISTS estimate_labour DECIMAL(10,2) DEFAULT 0;
ALTER TABLE jobs.jobs ADD COLUMN IF NOT EXISTS estimate_materials DECIMAL(10,2) DEFAULT 0;
ALTER TABLE jobs.jobs ADD COLUMN IF NOT EXISTS estimate_subcontractors DECIMAL(10,2) DEFAULT 0;
ALTER TABLE jobs.jobs ADD COLUMN IF NOT EXISTS estimate_other DECIMAL(10,2) DEFAULT 0;

-- scheduling.entries: add title and time fields for richer schedule cards
ALTER TABLE scheduling.entries ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE scheduling.entries ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE scheduling.entries ADD COLUMN IF NOT EXISTS end_time TEXT;

-- bills.suppliers: add ABN
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS abn TEXT;

-- bills.captures: add supplier FK
ALTER TABLE bills.captures ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES bills.suppliers(id);


-- ── Phase B: Create new tables ─────────────────────────────────────────────

-- Contractors
CREATE TABLE shared.contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  phone TEXT,
  trade TEXT,
  abn TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contractor compliance documents
CREATE TABLE shared.contractor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES shared.contractors(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,  -- workers_comp, public_liability, white_card, trade_license, subcontractor_statement, swms
  policy_number TEXT,
  insurer TEXT,
  cover_amount TEXT,
  license_number TEXT,
  license_class TEXT,
  issuing_body TEXT,
  card_number TEXT,
  holder_name TEXT,
  title TEXT,
  revision TEXT,
  approved_by TEXT,
  approval_date DATE,
  issue_date DATE,
  expiry_date DATE,
  period_from DATE,
  period_to DATE,
  abn TEXT,
  file_url TEXT,  -- Supabase Storage URL
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Job phases (Gantt chart)
CREATE TABLE jobs.phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs.jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  color TEXT DEFAULT '#3b82f6',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Job tasks (to-do list)
CREATE TABLE jobs.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs.jobs(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_done BOOLEAN DEFAULT false,
  due_date DATE,
  assigned_to TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Job notes (replaces appending to jobs.description)
CREATE TABLE jobs.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs.jobs(id) ON DELETE CASCADE,
  text TEXT,
  category TEXT DEFAULT 'general',  -- general, site_update, issue, inspection, delivery, safety, form
  created_by TEXT,
  -- Form fields (when category = 'form')
  form_type TEXT,       -- swms, service_report, take5
  form_data JSONB,      -- key-value pairs of filled form fields
  -- PDF fields (when note has a filled PDF)
  is_pdf BOOLEAN DEFAULT false,
  pdf_url TEXT,           -- Storage URL to filled PDF
  pdf_thumbnail_url TEXT, -- Storage URL to preview image
  pdf_fields JSONB,       -- array of {id, type, page, x, y, width, height, value, label}
  pdf_original_name TEXT, -- original filename
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Attachments (shared for notes, work orders, purchase orders)
CREATE TABLE jobs.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type TEXT NOT NULL,  -- note, work_order, purchase_order
  parent_id UUID NOT NULL,
  name TEXT,
  size INTEGER,
  mime_type TEXT,
  url TEXT NOT NULL,  -- Supabase Storage URL
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_attachments_parent ON jobs.attachments(parent_type, parent_id);

-- Work orders
CREATE TABLE jobs.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL UNIQUE,  -- WO-101
  job_id UUID REFERENCES jobs.jobs(id) ON DELETE SET NULL,
  contractor_id UUID REFERENCES shared.contractors(id),
  contractor_name TEXT,
  contractor_contact TEXT,
  contractor_email TEXT,
  contractor_phone TEXT,
  trade TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  issue_date DATE,
  due_date DATE,
  po_limit DECIMAL(10,2) DEFAULT 0,
  scope_of_work TEXT,
  notes TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Purchase orders
CREATE TABLE jobs.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL UNIQUE,  -- PO-201
  job_id UUID REFERENCES jobs.jobs(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES bills.suppliers(id),
  supplier_name TEXT,
  supplier_contact TEXT,
  supplier_email TEXT,
  supplier_abn TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  issue_date DATE,
  due_date DATE,
  po_limit DECIMAL(10,2) DEFAULT 0,
  delivery_address TEXT,
  notes TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Purchase order line items
CREATE TABLE jobs.purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES jobs.purchase_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit TEXT DEFAULT 'ea',
  unit_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log (centralized activity log)
CREATE TABLE shared.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- job, work_order, purchase_order, etc.
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  user_name TEXT,
  is_auto BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_log_entity ON shared.audit_log(entity_type, entity_id);


-- ── Phase C: Public views + grants ─────────────────────────────────────────

-- Re-create existing views (idempotent)
CREATE OR REPLACE VIEW public.customers    AS SELECT * FROM jobs.customers;
CREATE OR REPLACE VIEW public.sites        AS SELECT * FROM jobs.sites;
CREATE OR REPLACE VIEW public.jobs         AS SELECT * FROM jobs.jobs;
CREATE OR REPLACE VIEW public.quotes       AS SELECT * FROM jobs.quotes;
CREATE OR REPLACE VIEW public.line_items   AS SELECT * FROM jobs.line_items;
CREATE OR REPLACE VIEW public.invoices     AS SELECT * FROM jobs.invoices;
CREATE OR REPLACE VIEW public.time_entries AS SELECT * FROM timesheets.entries;
CREATE OR REPLACE VIEW public.bills        AS SELECT * FROM bills.captures;
CREATE OR REPLACE VIEW public.schedule     AS SELECT * FROM scheduling.entries;
CREATE OR REPLACE VIEW public.staff        AS SELECT * FROM shared.staff;
CREATE OR REPLACE VIEW public.suppliers    AS SELECT * FROM bills.suppliers;

-- New views
CREATE OR REPLACE VIEW public.contractors          AS SELECT * FROM shared.contractors;
CREATE OR REPLACE VIEW public.contractor_documents AS SELECT * FROM shared.contractor_documents;
CREATE OR REPLACE VIEW public.job_phases           AS SELECT * FROM jobs.phases;
CREATE OR REPLACE VIEW public.job_tasks            AS SELECT * FROM jobs.tasks;
CREATE OR REPLACE VIEW public.job_notes            AS SELECT * FROM jobs.notes;
CREATE OR REPLACE VIEW public.attachments          AS SELECT * FROM jobs.attachments;
CREATE OR REPLACE VIEW public.work_orders          AS SELECT * FROM jobs.work_orders;
CREATE OR REPLACE VIEW public.purchase_orders      AS SELECT * FROM jobs.purchase_orders;
CREATE OR REPLACE VIEW public.purchase_order_lines AS SELECT * FROM jobs.purchase_order_lines;
CREATE OR REPLACE VIEW public.audit_log            AS SELECT * FROM shared.audit_log;

-- Grants for all views (existing + new)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites                TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs                 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes               TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_items           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills                TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff                TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractors          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_documents TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_phases           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_tasks            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_notes            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log            TO anon, authenticated;


-- ── Phase D: Storage buckets ───────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true)
  ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public read attachments" ON storage.objects
  FOR SELECT USING (bucket_id IN ('attachments', 'documents'));
CREATE POLICY "Allow upload attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id IN ('attachments', 'documents'));
CREATE POLICY "Allow update attachments" ON storage.objects
  FOR UPDATE USING (bucket_id IN ('attachments', 'documents'));
CREATE POLICY "Allow delete attachments" ON storage.objects
  FOR DELETE USING (bucket_id IN ('attachments', 'documents'));


-- ── Phase E: RLS (permissive for now) ──────────────────────────────────────

ALTER TABLE shared.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.contractor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- Permissive policies (full access for now — multi-tenancy deferred)
CREATE POLICY "full_access" ON shared.contractors FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON shared.contractor_documents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON shared.audit_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON jobs.phases FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON jobs.tasks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON jobs.notes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON jobs.attachments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON jobs.work_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON jobs.purchase_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON jobs.purchase_order_lines FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
