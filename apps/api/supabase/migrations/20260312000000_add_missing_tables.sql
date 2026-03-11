-- Sites (multi-location per customer)
CREATE TABLE jobs.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES jobs.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Link jobs to a site
ALTER TABLE jobs.jobs ADD COLUMN site_id UUID REFERENCES jobs.sites(id);

-- Quotes
CREATE TABLE jobs.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs.jobs(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  tax_rate DECIMAL(5,2) DEFAULT 10,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Line items: support quote or invoice parent (job_id already exists)
ALTER TABLE jobs.line_items ADD COLUMN quote_id UUID REFERENCES jobs.quotes(id) ON DELETE CASCADE;
ALTER TABLE jobs.line_items ADD COLUMN invoice_id UUID REFERENCES jobs.invoices(id) ON DELETE CASCADE;

-- Invoice extras
ALTER TABLE jobs.invoices ADD COLUMN tax_rate DECIMAL(5,2) DEFAULT 10;
ALTER TABLE jobs.invoices ADD COLUMN notes TEXT;
ALTER TABLE jobs.invoices ADD COLUMN from_quote_id UUID REFERENCES jobs.quotes(id);

-- Schedule entries
CREATE TABLE scheduling.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs.jobs(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  notes TEXT,
  assigned_staff_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bills extras
ALTER TABLE bills.captures ADD COLUMN has_gst BOOLEAN DEFAULT true;
ALTER TABLE bills.captures ADD COLUMN markup DECIMAL(5,2) DEFAULT 0;
ALTER TABLE bills.captures ADD COLUMN category TEXT;
