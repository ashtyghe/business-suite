-- ============================================================================
-- Phase 3: Role-Based Access Control — RLS Policies
-- ============================================================================
-- Replaces permissive "USING (true)" policies with role-based access.
-- Admin: full access to everything.
-- Staff: read most tables, write restrictions on own data only.
-- ============================================================================

-- ── Helper function: get current user's role from shared.staff ──────────────
CREATE OR REPLACE FUNCTION shared.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM shared.staff WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ── Helper function: get current user's staff_id ────────────────────────────
CREATE OR REPLACE FUNCTION shared.get_my_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM shared.staff WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- Enable RLS on tables that don't have it yet
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE shared.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills.captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling.entries ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- Drop old permissive "full_access" policies
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "full_access" ON shared.contractors;
DROP POLICY IF EXISTS "full_access" ON shared.contractor_documents;
DROP POLICY IF EXISTS "full_access" ON shared.audit_log;
DROP POLICY IF EXISTS "full_access" ON jobs.phases;
DROP POLICY IF EXISTS "full_access" ON jobs.tasks;
DROP POLICY IF EXISTS "full_access" ON jobs.notes;
DROP POLICY IF EXISTS "full_access" ON jobs.attachments;
DROP POLICY IF EXISTS "full_access" ON jobs.work_orders;
DROP POLICY IF EXISTS "full_access" ON jobs.purchase_orders;
DROP POLICY IF EXISTS "full_access" ON jobs.purchase_order_lines;

-- ══════════════════════════════════════════════════════════════════════════════
-- shared.staff — everyone can read, only admins can modify
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "staff_select" ON shared.staff
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff_admin_all" ON shared.staff
  FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin')
  WITH CHECK (shared.get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════════════════════
-- jobs.customers — everyone reads, only admins write
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "customers_select" ON jobs.customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "customers_admin_write" ON jobs.customers
  FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin')
  WITH CHECK (shared.get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════════════════════
-- jobs.jobs — everyone reads, staff can update assigned jobs, admin full access
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "jobs_select" ON jobs.jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "jobs_admin_all" ON jobs.jobs
  FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin')
  WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "jobs_staff_update_assigned" ON jobs.jobs
  FOR UPDATE TO authenticated
  USING (
    shared.get_my_role() = 'staff'
    AND shared.get_my_staff_id() = ANY(assigned_staff_ids)
  )
  WITH CHECK (
    shared.get_my_role() = 'staff'
    AND shared.get_my_staff_id() = ANY(assigned_staff_ids)
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- jobs.sites, jobs.line_items, jobs.invoices, jobs.quotes — read all, admin write
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "sites_select" ON jobs.sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "sites_admin_write" ON jobs.sites FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "line_items_select" ON jobs.line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "line_items_admin_write" ON jobs.line_items FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "invoices_select" ON jobs.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "invoices_admin_write" ON jobs.invoices FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "quotes_select" ON jobs.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotes_admin_write" ON jobs.quotes FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════════════════════
-- timesheets.entries — staff can read all, insert/update/delete own only
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "time_select" ON timesheets.entries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "time_admin_all" ON timesheets.entries
  FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin')
  WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "time_staff_insert" ON timesheets.entries
  FOR INSERT TO authenticated
  WITH CHECK (
    shared.get_my_role() = 'staff'
    AND staff_id = shared.get_my_staff_id()
  );

CREATE POLICY "time_staff_update" ON timesheets.entries
  FOR UPDATE TO authenticated
  USING (
    shared.get_my_role() = 'staff'
    AND staff_id = shared.get_my_staff_id()
  )
  WITH CHECK (
    shared.get_my_role() = 'staff'
    AND staff_id = shared.get_my_staff_id()
  );

CREATE POLICY "time_staff_delete" ON timesheets.entries
  FOR DELETE TO authenticated
  USING (
    shared.get_my_role() = 'staff'
    AND staff_id = shared.get_my_staff_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- bills.captures — staff can read and insert (capture), only admin can update/delete
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "bills_select" ON bills.captures
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bills_admin_all" ON bills.captures
  FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin')
  WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "bills_staff_insert" ON bills.captures
  FOR INSERT TO authenticated
  WITH CHECK (shared.get_my_role() = 'staff');

-- ══════════════════════════════════════════════════════════════════════════════
-- bills.suppliers — everyone reads, admin writes
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "suppliers_select" ON bills.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_admin_write" ON bills.suppliers FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════════════════════
-- scheduling.entries — everyone reads, admin writes
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "schedule_select" ON scheduling.entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedule_admin_write" ON scheduling.entries FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- ══════════════════════════════════════════════════════════════════════════════
-- Tables from schema_standardization migration — replace full_access
-- ══════════════════════════════════════════════════════════════════════════════

-- shared.contractors
CREATE POLICY "contractors_select" ON shared.contractors FOR SELECT TO authenticated USING (true);
CREATE POLICY "contractors_admin_write" ON shared.contractors FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- shared.contractor_documents
CREATE POLICY "contractor_docs_select" ON shared.contractor_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "contractor_docs_admin_write" ON shared.contractor_documents FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- shared.audit_log
CREATE POLICY "audit_log_select" ON shared.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log_insert" ON shared.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- jobs.phases
CREATE POLICY "phases_select" ON jobs.phases FOR SELECT TO authenticated USING (true);
CREATE POLICY "phases_admin_write" ON jobs.phases FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- jobs.tasks
CREATE POLICY "tasks_select" ON jobs.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_admin_write" ON jobs.tasks FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- jobs.notes — staff can read and add notes
CREATE POLICY "notes_select" ON jobs.notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "notes_admin_all" ON jobs.notes FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');
CREATE POLICY "notes_staff_insert" ON jobs.notes FOR INSERT TO authenticated
  WITH CHECK (shared.get_my_role() = 'staff');

-- jobs.attachments — staff can read and upload
CREATE POLICY "attachments_select" ON jobs.attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "attachments_admin_all" ON jobs.attachments FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');
CREATE POLICY "attachments_staff_insert" ON jobs.attachments FOR INSERT TO authenticated
  WITH CHECK (shared.get_my_role() = 'staff');

-- jobs.work_orders
CREATE POLICY "work_orders_select" ON jobs.work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_orders_admin_write" ON jobs.work_orders FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- jobs.purchase_orders
CREATE POLICY "purchase_orders_select" ON jobs.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_orders_admin_write" ON jobs.purchase_orders FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');

-- jobs.purchase_order_lines
CREATE POLICY "po_lines_select" ON jobs.purchase_order_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_lines_admin_write" ON jobs.purchase_order_lines FOR ALL TO authenticated
  USING (shared.get_my_role() = 'admin') WITH CHECK (shared.get_my_role() = 'admin');
