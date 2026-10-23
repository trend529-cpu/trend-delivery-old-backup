-- Provide the atomic counter RPC already used by order, customer, serial and Delivery Job number generation.
-- Existing values seed each counter before the next number is allocated.
CREATE OR REPLACE FUNCTION public.tds_next_number(
  p_company_id uuid,
  p_kind text,
  p_period_key text DEFAULT ''
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_period text := COALESCE(p_period_key, '');
  v_max_existing bigint := 0;
  v_number bigint;
BEGIN
  IF p_company_id IS NULL OR v_kind NOT IN ('serial','order_code','customer_no','job_code') THEN
    RAISE EXCEPTION 'p_company_id and a supported p_kind are required';
  END IF;

  IF v_kind = 'serial' THEN
    IF v_period !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'serial counter requires YYYY-MM-DD p_period_key';
    END IF;
    SELECT COALESCE(MAX(serial_no), 0)::bigint
      INTO v_max_existing
    FROM public.orders
    WHERE company_id = p_company_id
      AND created_at::date = v_period::date;
  ELSIF v_kind = 'order_code' THEN
    SELECT COALESCE(MAX(((regexp_match(order_code, '(?:ORD-)?([0-9]+)$'))[1])::bigint), 0)
      INTO v_max_existing
    FROM public.orders
    WHERE company_id = p_company_id
      AND order_code IS NOT NULL;
  ELSIF v_kind = 'customer_no' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(customer_no, '[^0-9]', '', 'g'), '')::bigint), 0)
      INTO v_max_existing
    FROM public.customers
    WHERE company_id = p_company_id;
  ELSIF v_kind = 'job_code' THEN
    SELECT COALESCE(MAX(job_code::bigint), 0)
      INTO v_max_existing
    FROM public.delivery_jobs
    WHERE company_id = p_company_id
      AND job_code ~ '^[0-9]+$';
  END IF;

  INSERT INTO public.tds_number_counters
    (company_id, counter_kind, period_key, last_value, updated_at)
  VALUES
    (p_company_id, v_kind, v_period, GREATEST(v_max_existing + 1, 1), now())
  ON CONFLICT (company_id, counter_kind, period_key)
  DO UPDATE SET
    last_value = GREATEST(
      COALESCE(public.tds_number_counters.last_value, 0) + 1,
      v_max_existing + 1,
      1
    ),
    updated_at = now()
  RETURNING last_value INTO v_number;

  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tds_counter_health()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT pg_catalog.to_regclass('public.tds_number_counters') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'tds_next_number'
     );
$function$;

REVOKE ALL ON FUNCTION public.tds_next_number(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tds_next_number(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tds_next_number(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.tds_counter_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tds_counter_health() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tds_counter_health() TO service_role;