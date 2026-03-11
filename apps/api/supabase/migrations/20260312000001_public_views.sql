-- Public views so PostgREST can access custom schemas without extra config
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

-- Grant anon read/write through the views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_items   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff        TO anon, authenticated;
