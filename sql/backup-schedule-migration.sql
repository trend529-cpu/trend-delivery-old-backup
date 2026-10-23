-- Trend Delivery Service: automatic backup schedule configuration.
-- Run once in Supabase SQL Editor. Safe to re-run.
create table if not exists public.backup_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique,
  enabled boolean not null default false,
  frequency text not null default 'weekly'
    check (frequency in ('weekly', 'monthly')),
  day integer not null default 1,
  hour integer not null default 2,
  email text not null default '',
  last_run_key text not null default '',
  last_run_at timestamptz,
  last_attempt_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backup_schedules_day_check
    check ((frequency = 'weekly' and day between 0 and 6)
        or (frequency = 'monthly' and day between 1 and 28)),
  constraint backup_schedules_hour_check check (hour between 0 and 23)
);

create index if not exists backup_schedules_enabled_idx
  on public.backup_schedules (enabled)
  where enabled = true;
