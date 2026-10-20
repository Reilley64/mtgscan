CREATE OR REPLACE FUNCTION private.price_json (
  usd_cents integer,
  finish    public.card_finish
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case when usd_cents is not null then jsonb_build_object(
    'amount', private.usd_amount(usd_cents),
    'currency', 'USD',
    'finish', finish
  ) end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."price_json"(integer, public.card_finish) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."price_json"(integer, public.card_finish) TO "service_role";

REVOKE ALL ON FUNCTION "private"."price_json"(integer, public.card_finish) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."price_json"(integer, public.card_finish) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."price_json"(integer, public.card_finish) TO "postgres";
