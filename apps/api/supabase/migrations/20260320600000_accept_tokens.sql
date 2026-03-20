-- Accept tokens for quotes, work orders, and purchase orders
-- Allows external recipients to accept documents via secure link

ALTER TABLE jobs.quotes ADD COLUMN IF NOT EXISTS accept_token UUID UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE jobs.quotes ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE jobs.quotes ADD COLUMN IF NOT EXISTS accepted_by TEXT;

ALTER TABLE jobs.work_orders ADD COLUMN IF NOT EXISTS accept_token UUID UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE jobs.work_orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE jobs.work_orders ADD COLUMN IF NOT EXISTS accepted_by TEXT;

ALTER TABLE jobs.purchase_orders ADD COLUMN IF NOT EXISTS accept_token UUID UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE jobs.purchase_orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE jobs.purchase_orders ADD COLUMN IF NOT EXISTS accepted_by TEXT;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_quotes_accept_token ON jobs.quotes(accept_token);
CREATE INDEX IF NOT EXISTS idx_work_orders_accept_token ON jobs.work_orders(accept_token);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_accept_token ON jobs.purchase_orders(accept_token);
