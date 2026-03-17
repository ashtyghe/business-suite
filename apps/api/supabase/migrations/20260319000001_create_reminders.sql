-- Personal reminders for each user
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  text text not null default '',
  is_checklist boolean not null default false,
  reminder_date date,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reminders_staff_id_idx on public.reminders(staff_id);
create index if not exists reminders_date_idx on public.reminders(reminder_date);

-- Auto-update updated_at
create or replace function public.update_reminders_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger reminders_updated_at
  before update on public.reminders
  for each row execute function public.update_reminders_timestamp();

-- Enable RLS
alter table public.reminders enable row level security;

-- Users can only see their own reminders
create policy "Users can read own reminders"
  on public.reminders for select
  to authenticated
  using (
    staff_id in (
      select id from public.staff where auth_user_id = auth.uid()
    )
  );

create policy "Users can insert own reminders"
  on public.reminders for insert
  to authenticated
  with check (
    staff_id in (
      select id from public.staff where auth_user_id = auth.uid()
    )
  );

create policy "Users can update own reminders"
  on public.reminders for update
  to authenticated
  using (
    staff_id in (
      select id from public.staff where auth_user_id = auth.uid()
    )
  );

create policy "Users can delete own reminders"
  on public.reminders for delete
  to authenticated
  using (
    staff_id in (
      select id from public.staff where auth_user_id = auth.uid()
    )
  );

-- Service role full access
create policy "Service role full access to reminders"
  on public.reminders for all
  to service_role
  using (true)
  with check (true);
