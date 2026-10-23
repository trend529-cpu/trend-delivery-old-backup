-- Trend Delivery Service v2 schema. Run in Supabase SQL Editor before enabling database-backed modules.
create extension if not exists pgcrypto;
create table if not exists public.employees (
 id uuid primary key default gen_random_uuid(),
 email text not null unique,
 full_name text not null,
 role text not null default 'Employee',
 password_hash text not null,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.shippers (
 id uuid primary key default gen_random_uuid(), name text not null, code text unique,
 phone text, address text, delivery_fee numeric(12,2) not null default 0,
 tax_rate numeric(6,3) not null default 0, is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.customers (
 id uuid primary key default gen_random_uuid(), company_id uuid,
 name text not null, phone text, phone2 text, address text, area text, emirate text,
 created_at timestamptz not null default now()
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique, shipment_number text,
 tracking_number text unique, jop_cod text, shipper_id uuid references public.shippers(id), customer_id uuid references public.customers(id),
 status text not null default 'New', cod numeric(12,2) not null default 0,
 delivery_job_code text, driver_id uuid references public.employees(id),
 return_reason text, returned_at timestamptz, scheduled_for date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists orders_tracking_number_idx on public.orders(tracking_number);
create index if not exists orders_shipment_number_idx on public.orders(shipment_number);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_job_code_idx on public.orders(delivery_job_code);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create table if not exists public.returns (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 return_type text not null check (return_type in ('shipper','driver')),
 return_status text not null default 'Pending', reason text, proof_url text,
 driver_id uuid references public.employees(id), returned_at timestamptz not null default now(),
 completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.chat_groups (
 id uuid primary key default gen_random_uuid(), name text not null,
 created_by uuid references public.employees(id), created_at timestamptz not null default now()
);
create table if not exists public.chat_members (
 group_id uuid not null references public.chat_groups(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(group_id,employee_id)
);
create table if not exists public.chat_messages (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.chat_groups(id) on delete cascade,
 sender_id uuid not null references public.employees(id), body text not null,
 deleted_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.accounting_entries (
 id uuid primary key default gen_random_uuid(), entry_date date not null default current_date,
 entry_type text not null, amount numeric(12,2) not null, currency text not null default 'AED',
 reference text, notes text, created_by uuid references public.employees(id), created_at timestamptz not null default now()
);
create table if not exists public.areas (
 id uuid primary key default gen_random_uuid(), name text not null,
 emirate text not null, is_active boolean not null default true, created_at timestamptz not null default now(), unique(name,emirate)
);
-- Keep direct table access server-side; use Supabase secret/service key only on the server, never in frontend code.
alter table public.employees enable row level security;
alter table public.shippers enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.returns enable row level security;
alter table public.chat_groups enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.accounting_entries enable row level security;
alter table public.areas enable row level security;
