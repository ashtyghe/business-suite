-- ============================================================================
-- Migrate localStorage data to Supabase tables
-- ============================================================================
-- Moves company_info, email_templates, and user_permissions from browser
-- localStorage into proper database tables so data persists across devices.
-- ============================================================================

-- ── Company Info (single-row settings table) ────────────────────────────────

CREATE TABLE shared.company_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE VIEW public.company_info AS SELECT * FROM shared.company_info;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_info TO authenticated;

ALTER TABLE shared.company_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read company info" ON shared.company_info
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage company info" ON shared.company_info
  FOR INSERT TO authenticated WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "Admins update company info" ON shared.company_info
  FOR UPDATE TO authenticated
  USING (shared.get_my_role() = 'admin')
  WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "Admins delete company info" ON shared.company_info
  FOR DELETE TO authenticated
  USING (shared.get_my_role() = 'admin');

-- ── Email Templates (single-row, stores array of template objects) ──────────

CREATE TABLE shared.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  templates JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE VIEW public.email_templates AS SELECT * FROM shared.email_templates;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;

ALTER TABLE shared.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read templates" ON shared.email_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage templates" ON shared.email_templates
  FOR INSERT TO authenticated WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "Admins update templates" ON shared.email_templates
  FOR UPDATE TO authenticated
  USING (shared.get_my_role() = 'admin')
  WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "Admins delete templates" ON shared.email_templates
  FOR DELETE TO authenticated
  USING (shared.get_my_role() = 'admin');

-- ── User Permissions (one row per user) ─────────────────────────────────────

CREATE TABLE shared.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE OR REPLACE VIEW public.user_permissions AS SELECT * FROM shared.user_permissions;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;

ALTER TABLE shared.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read permissions" ON shared.user_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage permissions" ON shared.user_permissions
  FOR INSERT TO authenticated WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "Admins update permissions" ON shared.user_permissions
  FOR UPDATE TO authenticated
  USING (shared.get_my_role() = 'admin')
  WITH CHECK (shared.get_my_role() = 'admin');

CREATE POLICY "Admins delete permissions" ON shared.user_permissions
  FOR DELETE TO authenticated
  USING (shared.get_my_role() = 'admin');
