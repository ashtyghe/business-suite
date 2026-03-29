-- Allow 'digest' as a valid type for voice_settings_defaults
ALTER TABLE shared.voice_settings_defaults
  DROP CONSTRAINT voice_settings_defaults_type_check,
  ADD CONSTRAINT voice_settings_defaults_type_check CHECK (type IN ('inbound', 'outbound', 'digest'));
