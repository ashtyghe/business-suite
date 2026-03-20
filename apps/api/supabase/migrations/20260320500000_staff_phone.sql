-- Add phone number to staff table for voice assistant routing
ALTER TABLE shared.staff ADD COLUMN IF NOT EXISTS phone TEXT;
