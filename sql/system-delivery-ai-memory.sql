-- System Delivery AI persistent company memory.
-- Run this once in Supabase SQL Editor before using the assistant memory feature.
create table if not exists public.system_delivery_ai_memory (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  created_by_user_id text not null,
  memory_type text not null check (memory_type in ('learning_mode','rule','pending_rule')),
  memory_key text not null,
  content text not null default '',
  proposed_content text,
  status text not null default 'active' check (status in ('active','inactive','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists system_delivery_ai_memory_company_type_key
  on public.system_delivery_ai_memory (company_id, memory_type, memory_key);
create index if not exists system_delivery_ai_memory_company_status
  on public.system_delivery_ai_memory (company_id, status, memory_type);
alter table public.system_delivery_ai_memory enable row level security;
-- The server accesses this table using its configured Supabase server key.
-- Do not add public/anon write policies to this table.
