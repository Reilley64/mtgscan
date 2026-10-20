CREATE OR REPLACE FUNCTION private.current_price (
  price        public.card_prices,
  finish       public.card_finish,
  prices_stale boolean
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select private.price_json(private.finish_price_cents(price, finish), finish)
    || jsonb_build_object('stale', prices_stale);
$function$;

GRANT EXECUTE ON FUNCTION "private"."current_price"(public.card_prices, public.card_finish, boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."current_price"(public.card_prices, public.card_finish, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "private"."current_price"(public.card_prices, public.card_finish, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."current_price"(public.card_prices, public.card_finish, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."current_price"(public.card_prices, public.card_finish, boolean) TO "postgres";
