-- Allocate business references atomically per company and calendar day.
-- Existing records seed the counters; applying this migration does not reset numbering.
CREATE OR REPLACE FUNCTION public.next_tracking_number(p_company_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_max_existing bigint;
  v_number bigint;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id is required';
  END IF;

  SELECT COALESCE(MAX(tracking_number::bigint), 9999997)
    INTO v_max_existing
  FROM public.shipments
  WHERE company_id = p_company_id
    AND tracking_number ~ '^[0-9]+$';

  INSERT INTO public.tds_number_counters
    (company_id, counter_kind, period_key, last_value, updated_at)
  VALUES
    (p_company_id, 'tracking', 'global', GREATEST(v_max_existing + 1, 9999998), now())
  ON CONFLICT (company_id, counter_kind, period_key)
  DO UPDATE SET
    last_value = GREATEST(
      COALESCE(public.tds_number_counters.last_value, 9999997) + 1,
      v_max_existing + 1,
      9999998
    ),
    updated_at = now()
  RETURNING last_value INTO v_number;

  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_return_operation_number(p_company_id uuid, p_day text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_day text := regexp_replace(COALESCE(p_day, ''), '[^0-9]', '', 'g');
  v_max_existing bigint;
  v_number bigint;
BEGIN
  IF p_company_id IS NULL OR v_day !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'p_company_id and YYYYMMDD p_day are required';
  END IF;

  SELECT COALESCE(MAX(((regexp_match(operation_no, '^RTO-' || v_day || '-([0-9]+)$'))[1])::bigint), 0)
    INTO v_max_existing
  FROM public.return_operations
  WHERE company_id = p_company_id;

  INSERT INTO public.tds_number_counters
    (company_id, counter_kind, period_key, last_value, updated_at)
  VALUES
    (p_company_id, 'return_operation', v_day, v_max_existing + 1, now())
  ON CONFLICT (company_id, counter_kind, period_key)
  DO UPDATE SET
    last_value = GREATEST(public.tds_number_counters.last_value + 1, v_max_existing + 1),
    updated_at = now()
  RETURNING last_value INTO v_number;

  RETURN 'RTO-' || v_day || '-' || lpad(v_number::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_shipper_settlement_number(p_company_id uuid, p_day text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_day text := regexp_replace(COALESCE(p_day, ''), '[^0-9]', '', 'g');
  v_max_existing bigint;
  v_number bigint;
BEGIN
  IF p_company_id IS NULL OR v_day !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'p_company_id and YYYYMMDD p_day are required';
  END IF;

  SELECT COALESCE(MAX(((regexp_match(transaction_number, '^TD-' || v_day || '-([0-9]+)$'))[1])::bigint), 0)
    INTO v_max_existing
  FROM public.shipper_settlement_records
  WHERE company_id = p_company_id;

  INSERT INTO public.tds_number_counters
    (company_id, counter_kind, period_key, last_value, updated_at)
  VALUES
    (p_company_id, 'shipper_settlement', v_day, v_max_existing + 1, now())
  ON CONFLICT (company_id, counter_kind, period_key)
  DO UPDATE SET
    last_value = GREATEST(public.tds_number_counters.last_value + 1, v_max_existing + 1),
    updated_at = now()
  RETURNING last_value INTO v_number;

  RETURN 'TD-' || v_day || '-' || lpad(v_number::text, 4, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.next_tracking_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_tracking_number(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_tracking_number(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.next_return_operation_number(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_return_operation_number(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_return_operation_number(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.next_shipper_settlement_number(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_shipper_settlement_number(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_shipper_settlement_number(uuid, text) TO service_role;
