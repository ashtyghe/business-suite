-- ============================================================================
-- Security Hardening: revoke anon access, lock down storage buckets
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 1: Revoke ALL permissions from the anon role on public views
-- ══════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON public.customers            FROM anon;
REVOKE ALL ON public.sites                FROM anon;
REVOKE ALL ON public.jobs                 FROM anon;
REVOKE ALL ON public.quotes               FROM anon;
REVOKE ALL ON public.line_items           FROM anon;
REVOKE ALL ON public.invoices             FROM anon;
REVOKE ALL ON public.time_entries         FROM anon;
REVOKE ALL ON public.bills                FROM anon;
REVOKE ALL ON public.schedule             FROM anon;
REVOKE ALL ON public.staff                FROM anon;
REVOKE ALL ON public.suppliers            FROM anon;
REVOKE ALL ON public.contractors          FROM anon;
REVOKE ALL ON public.contractor_documents FROM anon;
REVOKE ALL ON public.job_phases           FROM anon;
REVOKE ALL ON public.job_tasks            FROM anon;
REVOKE ALL ON public.job_notes            FROM anon;
REVOKE ALL ON public.attachments          FROM anon;
REVOKE ALL ON public.work_orders          FROM anon;
REVOKE ALL ON public.purchase_orders      FROM anon;
REVOKE ALL ON public.purchase_order_lines FROM anon;
REVOKE ALL ON public.audit_log            FROM anon;

-- Ensure authenticated still has correct access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_items           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractors          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_phases           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_tasks            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_notes            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log            TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 2: Lock down storage buckets — set to private
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets SET public = false WHERE id IN ('attachments', 'documents');

-- Drop overly permissive storage policies
DROP POLICY IF EXISTS "Public read attachments"  ON storage.objects;
DROP POLICY IF EXISTS "Allow upload attachments"  ON storage.objects;
DROP POLICY IF EXISTS "Allow update attachments"  ON storage.objects;
DROP POLICY IF EXISTS "Allow delete attachments"  ON storage.objects;

-- Create authenticated-only storage policies with path and MIME type restrictions

-- SELECT: authenticated users can read files in their buckets
CREATE POLICY "Authenticated read storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('attachments', 'documents'));

-- INSERT: authenticated users can upload to organized paths with allowed MIME types
CREATE POLICY "Authenticated upload storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('attachments', 'documents')
    AND (storage.foldername(name))[1] IN (
      'jobs', 'bills', 'contractors', 'notes', 'work-orders',
      'purchase-orders', 'quotes', 'invoices', 'staff', 'forms'
    )
    AND (
      -- Images
      (storage.extension(name) IN ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'svg'))
      -- Documents
      OR (storage.extension(name) IN ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'rtf'))
    )
  );

-- UPDATE: authenticated users can update their uploads
CREATE POLICY "Authenticated update storage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('attachments', 'documents'));

-- DELETE: authenticated users can delete files
CREATE POLICY "Authenticated delete storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('attachments', 'documents'));
