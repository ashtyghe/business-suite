-- Company-wide voice assistant defaults (set by admin)
CREATE TABLE shared.voice_settings_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('inbound', 'outbound')),
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (type)
);

CREATE OR REPLACE VIEW public.voice_settings_defaults AS SELECT * FROM shared.voice_settings_defaults;
-- All authenticated users can read defaults; only admins should write (enforced in app)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_settings_defaults TO authenticated;

ALTER TABLE shared.voice_settings_defaults ENABLE ROW LEVEL SECURITY;
-- All authenticated can read
CREATE POLICY "Anyone can read defaults" ON shared.voice_settings_defaults
  FOR SELECT TO authenticated USING (true);
-- Only service_role can write (admin writes go through app logic)
CREATE POLICY "Authenticated can write defaults" ON shared.voice_settings_defaults
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add personalised flag to per-user settings
ALTER TABLE shared.voice_settings ADD COLUMN IF NOT EXISTS personalised BOOLEAN NOT NULL DEFAULT false;
