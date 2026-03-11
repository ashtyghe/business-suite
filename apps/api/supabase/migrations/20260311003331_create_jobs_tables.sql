CREATE TABLE jobs.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE jobs.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  customer_id UUID REFERENCES jobs.customers(id),
  site_address TEXT,
  assigned_staff_ids UUID[] DEFAULT '{}',
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE jobs.line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs.jobs(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE jobs.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs.jobs(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  due_date DATE,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  xero_invoice_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);