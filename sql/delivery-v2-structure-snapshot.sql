-- Delivery v2 database structure snapshot generated from the connected Delivery Supabase project.
-- Recreates public tables, constraints, indexes, RLS enablement, and current views only.
-- No business rows, user records, passwords, API keys, or other secrets are included.
-- Run ONLY in a NEW EMPTY Supabase project after review.
-- RLS is enabled, but policies are not guessed. Keep SUPABASE_SECRET_KEY server-side only.
-- Before any browser-side Supabase access, design and test explicit per-company RLS policies.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.adjustment_proofs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  adjustment_id uuid,
  file_name text,
  content_type text,
  file_size bigint,
  storage_bucket text,
  storage_path text,
  uploaded_by uuid,
  uploaded_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token_hash text,
  user_id text,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  last_seen_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.areas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  governorate_id uuid,
  name_ar text,
  name_en text,
  zone_name text
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  user_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  details jsonb
);

CREATE TABLE IF NOT EXISTS public.backup_schedules (
  company_id uuid NOT NULL,
  enabled boolean,
  frequency text,
  day integer,
  hour integer,
  email text,
  last_run_key text,
  last_run_at timestamp with time zone,
  last_attempt_at timestamp with time zone,
  last_error text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  order_code text,
  used boolean,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branch_transfer_shipments (
  transfer_id uuid NOT NULL,
  shipment_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.branch_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  transfer_no text,
  from_branch_id uuid,
  to_branch_id uuid,
  status text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  branch_no text,
  name text,
  address text
);

CREATE TABLE IF NOT EXISTS public.chat_conversation_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid,
  company_id uuid,
  user_id text,
  is_admin boolean,
  joined_at timestamp with time zone,
  last_read_at timestamp with time zone,
  left_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  type text,
  name text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  sender_id uuid,
  recipient_id uuid,
  message text,
  created_at timestamp with time zone DEFAULT now(),
  conversation_id uuid,
  deleted_at timestamp with time zone,
  deleted_by text
);

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text,
  name_en text,
  created_at timestamp with time zone DEFAULT now(),
  display_name text,
  logo_url text,
  admin_password_hash text,
  theme_config jsonb,
  menu_config jsonb
);

CREATE TABLE IF NOT EXISTS public.company_financial_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  type text,
  amount numeric,
  signed_amount numeric,
  description text,
  reason text,
  reference text,
  transaction_date timestamp with time zone,
  employee_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupon_bookings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  first_coupon bigint,
  last_coupon bigint,
  booked_by uuid,
  booked_by_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  updated_by_name text
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  customer_no text,
  name text,
  phone text,
  address text,
  governorate_id uuid,
  area_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deleted_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  original_order_id uuid,
  order_no text,
  tracking_number text,
  merchant_name text,
  customer_name text,
  customer_phone text,
  status text,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  order_data jsonb,
  shipments_data jsonb,
  related_data jsonb
);

CREATE TABLE IF NOT EXISTS public.delivery_job_shipments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  delivery_job_id uuid,
  shipment_id uuid,
  serial_no integer,
  delivery_job_code text,
  serial_date date
);

CREATE TABLE IF NOT EXISTS public.delivery_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  job_code text,
  driver_id uuid,
  status text,
  received_at timestamp with time zone,
  received_count integer,
  expected_count integer,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  job_date date
);

CREATE TABLE IF NOT EXISTS public.delivery_proofs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid,
  proof_type text,
  file_url text,
  captured_at timestamp with time zone,
  latitude numeric,
  longitude numeric,
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.driver_locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  driver_id uuid,
  latitude numeric,
  longitude numeric,
  recorded_at timestamp with time zone DEFAULT now(),
  accuracy numeric,
  company_id uuid
);

CREATE TABLE IF NOT EXISTS public.driver_settlements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  driver_id uuid,
  amount numeric,
  payment_method text,
  bank_name text,
  transfer_reference text,
  paid_at timestamp with time zone,
  employee_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  driver_no text,
  name text,
  phone text,
  vehicle_no text,
  active boolean,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  driver_code text
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  driver_id uuid,
  expense_type text,
  amount numeric,
  notes text,
  expense_date date,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  category text,
  details text,
  employee_id uuid,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.governorates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  name_ar text,
  name_en text
);

CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  merchant_id uuid,
  type text,
  name text,
  config jsonb,
  active boolean,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manifest_shipments (
  manifest_id uuid NOT NULL,
  shipment_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.manifests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  manifest_no text,
  status text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  type text,
  amount numeric,
  signed_amount numeric,
  reason text,
  reference text,
  adjustment_date timestamp with time zone,
  employee_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_delivery_prices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  merchant_id uuid,
  governorate_id uuid,
  area_id uuid,
  price numeric
);

CREATE TABLE IF NOT EXISTS public.merchant_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  merchant_id uuid,
  file_name text,
  mime_type text,
  data_url text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_integrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  type text,
  name text,
  config jsonb,
  active boolean,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_settlements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  amount numeric,
  payment_method text,
  bank_name text,
  transfer_reference text,
  paid_at timestamp with time zone,
  employee_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_no text,
  code text,
  name text,
  phone text,
  address text,
  active boolean,
  created_at timestamp with time zone DEFAULT now(),
  tax_enabled boolean,
  tax_rate numeric,
  base_delivery_fee numeric,
  store_type text,
  store_name text,
  store_url text,
  store_active boolean,
  username text,
  password_hash text,
  documents jsonb,
  portal_username text,
  portal_password_hash text,
  proof_images jsonb,
  external_code text,
  phone_2 text,
  portal_active boolean
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  user_id uuid,
  title text,
  body text,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  message text,
  type text
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  order_code text,
  serial_no integer,
  serial_date date,
  merchant_id uuid,
  customer_id uuid,
  merchant_order_no text,
  source text,
  value numeric,
  delivery_fee numeric,
  notes text,
  status text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  tax_enabled boolean,
  tax_rate numeric,
  tax_amount numeric,
  merchant_net_value numeric,
  customer_name text,
  customer_phone text,
  governorate_id uuid,
  area_id uuid,
  address text,
  external_id text,
  customer_phone_2 text,
  commission_verify_status text,
  commission_verified_at timestamp with time zone,
  commission_verified_by uuid,
  statement_removed_at timestamp with time zone,
  statement_removed_by uuid,
  statement_removed_from_driver_id uuid,
  driver_statement_action text,
  driver_scheduled_date date,
  driver_location_emirate_id uuid,
  driver_location_area_id uuid,
  driver_action_at timestamp with time zone,
  driver_action_by uuid,
  commission_paid_status text,
  commission_paid_at timestamp with time zone,
  commission_paid_by uuid,
  commission_payment_method text,
  service_charges numeric,
  cod numeric,
  reference_number text,
  cash_collection_status text,
  cash_collected_amount numeric,
  cash_collected_at timestamp with time zone,
  cash_collected_by uuid,
  credit_collected_amount numeric,
  collection_method text,
  scan_driver_id uuid,
  scan_at timestamp with time zone,
  scan_by_user_id uuid,
  shipper_rate_id uuid,
  shipper_rate_value numeric,
  shipper_cod_rate numeric,
  driver_old_location_governorate_id uuid,
  driver_old_location_area_id uuid,
  driver_return_reason text,
  return_operation_id uuid,
  return_operation_no text,
  shipment_number text,
  jop_cod text,
  created_by_name text
);

CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  item_id uuid,
  kind text,
  amount numeric,
  reason text,
  created_by text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_employees (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  name text,
  job_title text,
  is_driver boolean,
  linked_driver_id uuid,
  base_salary numeric,
  delivery_commission numeric,
  pickup_commission numeric,
  active boolean,
  notes text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  period_id uuid,
  employee_id uuid,
  employee_name text,
  job_title text,
  base_salary numeric,
  additions numeric,
  deductions numeric,
  paid_amount numeric,
  status text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  month_key text,
  status text,
  created_by text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  item_id uuid,
  receipt_no text,
  amount numeric,
  paid_at date,
  notes text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  storage_bucket text,
  storage_path text,
  proof_file_name text,
  proof_content_type text
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text,
  name_ar text,
  name_en text
);

CREATE TABLE IF NOT EXISTS public.return_operations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  operation_no text,
  driver_id uuid,
  status text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.return_transaction_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  return_transaction_id uuid,
  file_name text,
  content_type text,
  file_size bigint,
  storage_bucket text,
  storage_path text,
  uploaded_by uuid,
  uploaded_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.return_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  order_id uuid,
  shipment_id uuid,
  merchant_id uuid,
  return_transaction_no text,
  return_status text,
  return_date date,
  note text,
  proof_received_at timestamp with time zone,
  proof_received_by uuid,
  completed_at timestamp with time zone,
  completed_by uuid,
  completed_without_proof boolean,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  original_status text,
  return_operation_id uuid,
  return_operation_no text,
  driver_id uuid
);

CREATE TABLE IF NOT EXISTS public.returns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid,
  reason_status text,
  status text,
  proof_url text,
  merchant_received_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  name text
);

CREATE TABLE IF NOT EXISTS public.scan_driver_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  driver_id uuid,
  order_number text,
  scan_date date,
  scanned_at timestamp with time zone,
  employee_id uuid,
  employee_name text,
  matched_order_id uuid,
  matched_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  key text,
  value jsonb
);

CREATE TABLE IF NOT EXISTS public.settlement_proofs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  settlement_id uuid,
  file_name text,
  content_type text,
  file_size bigint,
  storage_bucket text,
  storage_path text,
  uploaded_by uuid,
  uploaded_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.shipment_status_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid,
  status text,
  notes text,
  branch_id uuid,
  driver_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  previous_status text,
  user_id uuid,
  note text
);

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  shipment_no text,
  order_id uuid,
  status text,
  current_branch_id uuid,
  current_driver_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  tracking_number text,
  future_delivery_date date,
  warehouse_received_at timestamp with time zone,
  return_available_date date,
  in_ops_release_date date,
  new_job_code text,
  job_code text,
  external_tracking_number text,
  driver_id uuid
);

CREATE TABLE IF NOT EXISTS public.shipper_rate_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  shipper_rate_id uuid,
  governorate_id uuid,
  area_id uuid,
  old_rate numeric,
  new_rate numeric,
  old_cod_rate numeric,
  new_cod_rate numeric,
  effective_date timestamp with time zone,
  changed_by uuid,
  change_type text,
  changed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.shipper_rates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  governorate_id uuid,
  area_id uuid,
  delivery_rate numeric,
  cod_rate numeric,
  status text,
  is_default boolean,
  effective_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipper_settlement_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  settlement_id uuid,
  merchant_id uuid,
  order_id uuid,
  tracking_number text,
  shipment_no text,
  merchant_order_no text,
  cod numeric,
  service_charges numeric,
  merchant_net numeric,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipper_settlement_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  merchant_id uuid,
  settlement_date date,
  transaction_number text,
  status text,
  order_count integer,
  collection_amount numeric,
  generated_by uuid,
  generated_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_delivery_ai_memory (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id text,
  created_by_user_id text,
  memory_type text,
  memory_key text,
  content text,
  proposed_content text,
  status text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tds_number_counters (
  company_id uuid NOT NULL,
  counter_kind text NOT NULL,
  period_key text NOT NULL,
  last_value bigint,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  shipment_id uuid,
  merchant_id uuid,
  driver_id uuid,
  account_type text,
  transaction_type text,
  amount numeric,
  direction text,
  description text,
  status text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  name text,
  email text,
  password_hash text,
  language text,
  active boolean,
  created_at timestamp with time zone DEFAULT now(),
  username text,
  employee_code text
);

CREATE TABLE IF NOT EXISTS public.wanted_customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid,
  phone text,
  phone_normalized text,
  reason text,
  created_by text,
  updated_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.adjustment_proofs ADD CONSTRAINT adjustment_proofs_pkey PRIMARY KEY (id);

ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.areas ADD CONSTRAINT areas_pkey PRIMARY KEY (id);

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.backup_schedules ADD CONSTRAINT backup_schedules_pkey PRIMARY KEY (company_id);

ALTER TABLE public.bookings ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);

ALTER TABLE public.branch_transfer_shipments ADD CONSTRAINT branch_transfer_shipments_pkey PRIMARY KEY (transfer_id, shipment_id);

ALTER TABLE public.branch_transfers ADD CONSTRAINT branch_transfers_pkey PRIMARY KEY (id);

ALTER TABLE public.branches ADD CONSTRAINT branches_pkey PRIMARY KEY (id);

ALTER TABLE public.chat_conversation_members ADD CONSTRAINT chat_conversation_members_pkey PRIMARY KEY (id);

ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);

ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

ALTER TABLE public.company_financial_adjustments ADD CONSTRAINT company_financial_adjustments_pkey PRIMARY KEY (id);

ALTER TABLE public.coupon_bookings ADD CONSTRAINT coupon_bookings_pkey PRIMARY KEY (id);

ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

ALTER TABLE public.deleted_orders ADD CONSTRAINT deleted_orders_pkey PRIMARY KEY (id);

ALTER TABLE public.delivery_job_shipments ADD CONSTRAINT delivery_job_shipments_job_id_fkey FOREIGN KEY (delivery_job_id) REFERENCES delivery_jobs(id);

ALTER TABLE public.delivery_job_shipments ADD CONSTRAINT delivery_job_shipments_pkey PRIMARY KEY (id);

ALTER TABLE public.delivery_job_shipments ADD CONSTRAINT delivery_job_shipments_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id);

ALTER TABLE public.delivery_jobs ADD CONSTRAINT delivery_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.delivery_jobs ADD CONSTRAINT delivery_jobs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);

ALTER TABLE public.delivery_jobs ADD CONSTRAINT delivery_jobs_pkey PRIMARY KEY (id);

ALTER TABLE public.delivery_proofs ADD CONSTRAINT delivery_proofs_pkey PRIMARY KEY (id);

ALTER TABLE public.driver_locations ADD CONSTRAINT driver_locations_pkey PRIMARY KEY (id);

ALTER TABLE public.driver_settlements ADD CONSTRAINT driver_settlements_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.driver_settlements ADD CONSTRAINT driver_settlements_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);

ALTER TABLE public.driver_settlements ADD CONSTRAINT driver_settlements_pkey PRIMARY KEY (id);

ALTER TABLE public.drivers ADD CONSTRAINT drivers_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.drivers ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);

ALTER TABLE public.expenses ADD CONSTRAINT expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.expenses ADD CONSTRAINT expenses_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);

ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);

ALTER TABLE public.governorates ADD CONSTRAINT governorates_pkey PRIMARY KEY (id);

ALTER TABLE public.integrations ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);

ALTER TABLE public.manifest_shipments ADD CONSTRAINT manifest_shipments_pkey PRIMARY KEY (manifest_id, shipment_id);

ALTER TABLE public.manifests ADD CONSTRAINT manifests_pkey PRIMARY KEY (id);

ALTER TABLE public.merchant_adjustments ADD CONSTRAINT merchant_adjustments_pkey PRIMARY KEY (id);

ALTER TABLE public.merchant_delivery_prices ADD CONSTRAINT merchant_delivery_prices_pkey PRIMARY KEY (id);

ALTER TABLE public.merchant_documents ADD CONSTRAINT merchant_documents_pkey PRIMARY KEY (id);

ALTER TABLE public.merchant_integrations ADD CONSTRAINT merchant_integrations_pkey PRIMARY KEY (id);

ALTER TABLE public.merchant_settlements ADD CONSTRAINT merchant_settlements_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.merchant_settlements ADD CONSTRAINT merchant_settlements_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id);

ALTER TABLE public.merchant_settlements ADD CONSTRAINT merchant_settlements_pkey PRIMARY KEY (id);

ALTER TABLE public.merchants ADD CONSTRAINT merchants_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.merchants ADD CONSTRAINT merchants_pkey PRIMARY KEY (id);

ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.orders ADD CONSTRAINT orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE public.orders ADD CONSTRAINT orders_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id);

ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE public.payroll_adjustments ADD CONSTRAINT payroll_adjustments_pkey PRIMARY KEY (id);

ALTER TABLE public.payroll_employees ADD CONSTRAINT payroll_employees_pkey PRIMARY KEY (id);

ALTER TABLE public.payroll_items ADD CONSTRAINT payroll_items_pkey PRIMARY KEY (id);

ALTER TABLE public.payroll_periods ADD CONSTRAINT payroll_periods_pkey PRIMARY KEY (id);

ALTER TABLE public.payroll_receipts ADD CONSTRAINT payroll_receipts_pkey PRIMARY KEY (id);

ALTER TABLE public.permissions ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);

ALTER TABLE public.return_operations ADD CONSTRAINT return_operations_pkey PRIMARY KEY (id);

ALTER TABLE public.return_transaction_attachments ADD CONSTRAINT return_transaction_attachments_pkey PRIMARY KEY (id);

ALTER TABLE public.return_transactions ADD CONSTRAINT return_transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.returns ADD CONSTRAINT returns_pkey PRIMARY KEY (id);

ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);

ALTER TABLE public.roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE public.scan_driver_records ADD CONSTRAINT scan_driver_records_pkey PRIMARY KEY (id);

ALTER TABLE public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (id);

ALTER TABLE public.settlement_proofs ADD CONSTRAINT settlement_proofs_pkey PRIMARY KEY (id);

ALTER TABLE public.shipment_status_history ADD CONSTRAINT shipment_status_history_pkey PRIMARY KEY (id);

ALTER TABLE public.shipment_status_history ADD CONSTRAINT shipment_status_history_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES shipments(id);

ALTER TABLE public.shipments ADD CONSTRAINT shipments_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.shipments ADD CONSTRAINT shipments_current_driver_id_fkey FOREIGN KEY (current_driver_id) REFERENCES drivers(id);

ALTER TABLE public.shipments ADD CONSTRAINT shipments_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);

ALTER TABLE public.shipments ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE public.shipments ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);

ALTER TABLE public.shipper_rate_history ADD CONSTRAINT shipper_rate_history_pkey PRIMARY KEY (id);

ALTER TABLE public.shipper_rates ADD CONSTRAINT shipper_rates_pkey PRIMARY KEY (id);

ALTER TABLE public.shipper_settlement_items ADD CONSTRAINT shipper_settlement_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id);

ALTER TABLE public.shipper_settlement_items ADD CONSTRAINT shipper_settlement_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE public.shipper_settlement_items ADD CONSTRAINT shipper_settlement_items_pkey PRIMARY KEY (id);

ALTER TABLE public.shipper_settlement_items ADD CONSTRAINT shipper_settlement_items_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES shipper_settlement_records(id);

ALTER TABLE public.shipper_settlement_records ADD CONSTRAINT shipper_settlement_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.shipper_settlement_records ADD CONSTRAINT shipper_settlement_records_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants(id);

ALTER TABLE public.shipper_settlement_records ADD CONSTRAINT shipper_settlement_records_pkey PRIMARY KEY (id);

ALTER TABLE public.system_delivery_ai_memory ADD CONSTRAINT system_delivery_ai_memory_pkey PRIMARY KEY (id);

ALTER TABLE public.tds_number_counters ADD CONSTRAINT tds_number_counters_pkey PRIMARY KEY (company_id, counter_kind, period_key);

ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);

ALTER TABLE public.users ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE public.wanted_customers ADD CONSTRAINT wanted_customers_pkey PRIMARY KEY (id);

CREATE INDEX idx_delivery_job_shipments_job_id ON public.delivery_job_shipments USING btree (delivery_job_id);

CREATE INDEX idx_delivery_job_shipments_shipment_id ON public.delivery_job_shipments USING btree (shipment_id);

CREATE INDEX idx_delivery_jobs_company_id ON public.delivery_jobs USING btree (company_id);

CREATE INDEX idx_delivery_jobs_driver_id ON public.delivery_jobs USING btree (driver_id);

CREATE INDEX idx_driver_settlements_company_id ON public.driver_settlements USING btree (company_id);

CREATE INDEX idx_driver_settlements_driver_id ON public.driver_settlements USING btree (driver_id);

CREATE INDEX idx_drivers_company_id ON public.drivers USING btree (company_id);

CREATE INDEX idx_expenses_company_id ON public.expenses USING btree (company_id);

CREATE INDEX idx_expenses_driver_id ON public.expenses USING btree (driver_id);

CREATE INDEX idx_merchant_settlements_company_id ON public.merchant_settlements USING btree (company_id);

CREATE INDEX idx_merchant_settlements_merchant_id ON public.merchant_settlements USING btree (merchant_id);

CREATE INDEX idx_merchants_company_id ON public.merchants USING btree (company_id);

CREATE INDEX idx_orders_company_id ON public.orders USING btree (company_id);

CREATE INDEX idx_orders_customer_id ON public.orders USING btree (customer_id);

CREATE INDEX idx_orders_merchant_id ON public.orders USING btree (merchant_id);

CREATE INDEX idx_shipment_status_history_shipment_id ON public.shipment_status_history USING btree (shipment_id);

CREATE INDEX idx_shipments_company_id ON public.shipments USING btree (company_id);

CREATE INDEX idx_shipments_current_driver_id ON public.shipments USING btree (current_driver_id);

CREATE INDEX idx_shipments_driver_id ON public.shipments USING btree (driver_id);

CREATE INDEX idx_shipments_order_id ON public.shipments USING btree (order_id);

CREATE INDEX idx_shipper_settlement_items_merchant_id ON public.shipper_settlement_items USING btree (merchant_id);

CREATE INDEX idx_shipper_settlement_items_order_id ON public.shipper_settlement_items USING btree (order_id);

CREATE INDEX idx_shipper_settlement_items_settlement_id ON public.shipper_settlement_items USING btree (settlement_id);

CREATE INDEX idx_shipper_settlement_records_company_id ON public.shipper_settlement_records USING btree (company_id);

CREATE INDEX idx_shipper_settlement_records_merchant_id ON public.shipper_settlement_records USING btree (merchant_id);

CREATE INDEX idx_users_company_id ON public.users USING btree (company_id);

ALTER TABLE public.adjustment_proofs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.branch_transfer_shipments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_conversation_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.company_financial_adjustments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coupon_bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deleted_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_job_shipments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_proofs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.governorates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.manifest_shipments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.manifests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.merchant_adjustments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.merchant_delivery_prices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.merchant_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.merchant_integrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.merchant_settlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_employees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_receipts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.return_operations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.return_transaction_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.return_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scan_driver_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.settlement_proofs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipment_status_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipper_rate_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipper_rates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipper_settlement_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipper_settlement_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.system_delivery_ai_memory ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tds_number_counters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wanted_customers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.company_delivery_revenue WITH (security_invoker=true) AS  SELECT o.id AS order_id,
    o.company_id,
    o.merchant_id,
    COALESCE(s.tracking_number, s.external_tracking_number, s.shipment_no, o.shipment_number, o.jop_cod) AS tracking_number,
    o.merchant_order_no,
    o.status,
    o.created_at,
    COALESCE(o.cod, o.value, 0::numeric) AS cod,
    COALESCE(o.service_charges, o.delivery_fee, 0::numeric) AS service_charges,
    COALESCE(o.tax_amount, 0::numeric) AS tax_amount,
    COALESCE(o.service_charges, o.delivery_fee, 0::numeric) + COALESCE(o.tax_amount, 0::numeric) AS company_delivery_revenue
   FROM orders o
     LEFT JOIN LATERAL ( SELECT sh.tracking_number,
            sh.external_tracking_number,
            sh.shipment_no
           FROM shipments sh
          WHERE sh.order_id = o.id
          ORDER BY sh.created_at DESC NULLS LAST
         LIMIT 1) s ON true;;
