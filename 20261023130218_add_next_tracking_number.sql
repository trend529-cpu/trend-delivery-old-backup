-- Restore the database-backed numeric tracking sequence required by src/server.js.
CREATE OR REPLACE FUNCTION public.next_tracking_number(p_company_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_number bigint;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id is required';
  END IF;

  INSERT INTO public.tds_number_counters
    (company_id, counter_kind, period_key, last_value, updated_at)
  VALUES
    (p_company_id, 'tracking', 'global', 9999998, now())
  ON CONFLICT (company_id, counter_kind, period_key)
  DO UPDATE SET
    last_value = GREATEST(COALESCE(public.tds_number_counters.last_value, 9999997) + 1, 9999998),
    updated_at = now()
  RETURNING last_value INTO v_number;

  RETURN v_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.next_tracking_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_tracking_number(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_tracking_number(uuid) TO service_role;
