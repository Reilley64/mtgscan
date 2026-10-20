CREATE OR REPLACE FUNCTION private.minor_unit_digits (
  currency text
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case
    when currency in ('BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF')
      then 0
    else 2
  end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."minor_unit_digits"(text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."minor_unit_digits"(text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."minor_unit_digits"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."minor_unit_digits"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."minor_unit_digits"(text) TO "postgres";
