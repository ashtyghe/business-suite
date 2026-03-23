-- Add missing columns to suppliers table for contact, notes, and address fields
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE bills.suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Recreate the view to include new columns
CREATE OR REPLACE VIEW public.suppliers AS SELECT * FROM bills.suppliers;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO anon, authenticated;
