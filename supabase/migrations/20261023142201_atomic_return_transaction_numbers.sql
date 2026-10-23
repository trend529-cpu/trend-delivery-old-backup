-- Allocate an individual return transaction reference atomically per company and day.
-- Existing RTN references seed the sequence; no existing return row is rewritten.
CREATE OR REPLACE FUNCTION public.next_return_transaction_number(p_company_id uuid, p_day text)
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

  SELECT COALESCE(MAX(((regexp_match(return_transaction_no, '^RTN-' || v_day || '-([0-9]+)$'))[1])::bigint), 0)
    INTO v_max_existing
  FROM public.return_transactions
  WHERE company_id = p_company_id;

  INSERT INTO public.tds_number_counters
    (company_id, counter_kind, period_key, last_value, updated_at)
  VALUES
    (p_company_id, 'return_transaction', v_day, v_max_existing + 1, now())
  ON CONFLICT (company_id, counter_kind, period_key)
  DO UPDATE SET
    last_value = GREATEST(public.tds_number_counters.last_value + 1, v_max_existing + 1),
    updated_at = now()
  RETURNING last_value INTO v_number;

  RETURN 'RTN-' || v_day || '-' || lpad(v_number::text, 4, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.next_return_transaction_number(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_return_transaction_number(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_return_transaction_number(uuid, text) TO service_role;