-- Lightweight caller context / memory for voice assistant
-- Stores key points per caller phone number, per user
CREATE TABLE shared.caller_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  caller_name TEXT,
  notes JSONB NOT NULL DEFAULT '[]',        -- [{text, date}] max 20 entries
  last_call_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, phone)
);

CREATE INDEX idx_caller_context_user ON shared.caller_context(user_id);
CREATE INDEX idx_caller_context_phone ON shared.caller_context(phone);

-- Public view
CREATE OR REPLACE VIEW public.caller_context AS SELECT * FROM shared.caller_context;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caller_context TO authenticated;

-- RLS: users can only access their own caller context
ALTER TABLE shared.caller_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own caller context" ON shared.caller_context
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
