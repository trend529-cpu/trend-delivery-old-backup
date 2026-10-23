-- Safe, repeatable migration for the order-entry Tracking Number RPC.
-- Run only against the Supabase project configured in the deployed app.
create table if not exists public.tds_number_counters (
  company_id uuid not null,
  counter_kind text not null,
  period_key text not null,
  last_value bigint,
  updated_at timestamptz not null default now()
);

alter table public.tds_number_counters
  add column if not exists company_id uuid;
alter table public.tds_number_counters
  add column if not exists counter_kind text;
alter table public.tds_number_counters
  add column if not exists period_key text;
alter table public.tds_number_counters
  add column if not exists last_value bigint;
alter table public.tds_number_counters
  add column if not exists updated_at timestamptz default now();

create unique index if not exists tds_number_counters_company_kind_period_uidx
  on public.tds_number_counters (company_id, counter_kind, period_key);

alter table public.tds_number_counters enable row level security;
revoke all on table public.tds_number_counters from public, anon, authenticated;
grant select, insert, update on table public.tds_number_counters to service_role;

create or replace function public.next_tracking_number(p_company_id uuid)
returns bigint
language plpgsql
set search_path = ''
as $function$
declare
  v_number bigint;
begin
  if p_company_id is null then
    raise exception 'p_company_id is required';
  end if;

  insert into public.tds_number_counters
    (company_id, counter_kind, period_key, last_value, updated_at)
  values
    (p_company_id, 'tracking', 'global', 9999998, now())
  on conflict (company_id, counter_kind, period_key)
  do update set
    last_value = greatest(
      coalesce(public.tds_number_counters.last_value, 9999997) + 1,
      9999998
    ),
    updated_at = now()
  returning last_value into v_number;

  return v_number;
end;
$function$;

revoke all on function public.next_tracking_number(uuid) from public, anon, authenticated;
grant execute on function public.next_tracking_number(uuid) to service_role;
