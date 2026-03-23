-- Add structured address fields (suburb, state, postcode) to all entity tables
-- Existing 'address' columns on customers/sites are kept as the street address field
-- Contractors and suppliers get all four fields (they had no address before)

-- Customers: already have address, add suburb/state/postcode
ALTER TABLE jobs.customers ADD COLUMN IF NOT EXISTS suburb TEXT;
ALTER TABLE jobs.customers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE jobs.customers ADD COLUMN IF NOT EXISTS postcode TEXT;

-- Sites: already have address, add suburb/state/postcode
ALTER TABLE jobs.sites ADD COLUMN IF NOT EXISTS suburb TEXT;
ALTER TABLE jobs.sites ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE jobs.sites ADD COLUMN IF NOT EXISTS postcode TEXT;

-- Contractors: no address at all, add all four
ALTER TABLE shared.contractors ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE shared.contractors ADD COLUMN IF NOT EXISTS suburb TEXT;
ALTER TABLE shared.contractors ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE shared.contractors ADD COLUMN IF NOT EXISTS postcode TEXT;

-- Suppliers: no address at all, add all four
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS suburb TEXT;
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS postcode TEXT;
