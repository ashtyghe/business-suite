-- Voice assistant settings (one row per org, singleton for now)
create table if not exists public.voice_assistant_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Iris',
  voice text not null default 'sage',
  greeting_style text not null default '',
  personality text not null default '',
  general_knowledge text not null default '',
  silence_duration integer not null default 500,
  vad_threshold numeric(2,1) not null default 0.5,
  confirm_writes boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Ensure only one settings row exists
create unique index if not exists voice_assistant_settings_singleton on public.voice_assistant_settings ((true));

-- Auto-update updated_at
create or replace function public.update_voice_assistant_settings_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger voice_assistant_settings_updated_at
  before update on public.voice_assistant_settings
  for each row execute function public.update_voice_assistant_settings_timestamp();

-- Enable RLS
alter table public.voice_assistant_settings enable row level security;

-- Authenticated users can read settings
create policy "Authenticated users can read voice settings"
  on public.voice_assistant_settings for select
  to authenticated
  using (true);

-- Only admins can update settings (staff with role = 'admin')
create policy "Admins can update voice settings"
  on public.voice_assistant_settings for update
  to authenticated
  using (
    exists (
      select 1 from public.staff
      where staff.auth_user_id = auth.uid()
        and staff.role = 'admin'
    )
  );

-- Allow insert for admins (first-time setup)
create policy "Admins can insert voice settings"
  on public.voice_assistant_settings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.staff
      where staff.auth_user_id = auth.uid()
        and staff.role = 'admin'
    )
  );

-- Service role bypass for voice-assistant server
create policy "Service role full access"
  on public.voice_assistant_settings for all
  to service_role
  using (true)
  with check (true);
