CREATE OR REPLACE FUNCTION private.price_condition (
  price_cents text,
  checked     jsonb
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select format(
    '%1$s::numeric >= %2$L and %1$s::numeric <= %3$L',
    price_cents,
    coalesce((checked ->> 'price_min')::numeric * 100, 0),
    coalesce((checked ->> 'price_max')::numeric * 100, 'Infinity')
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."price_condition"(text, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."price_condition"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."price_condition"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."price_condition"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."price_condition"(text, jsonb) TO "postgres";
