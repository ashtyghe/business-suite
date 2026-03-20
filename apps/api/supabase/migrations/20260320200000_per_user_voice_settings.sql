-- Per-user voice assistant settings
CREATE TABLE shared.voice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('inbound', 'outbound')),
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, type)
);

-- Public view
CREATE OR REPLACE VIEW public.voice_settings AS SELECT * FROM shared.voice_settings;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_settings TO authenticated;

-- RLS
ALTER TABLE shared.voice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own voice settings" ON shared.voice_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
