CREATE TABLE timesheets.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES shared.staff(id),
  job_id UUID REFERENCES jobs.jobs(id),
  entry_date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bills.captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs.jobs(id),
  supplier_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2),
  total DECIMAL(10,2),
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  xero_bill_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bills.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);