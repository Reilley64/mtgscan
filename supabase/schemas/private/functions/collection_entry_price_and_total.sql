CREATE OR REPLACE FUNCTION private.collection_entry_price_and_total (
  price        public.card_prices,
  finish       public.card_finish,
  quantity     integer,
  prices_stale boolean
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'price', private.current_price(price, finish, prices_stale),
    'total', private.usd_amount(private.finish_price_cents(price, finish)::bigint * quantity)
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."collection_entry_price_and_total"(public.card_prices, public.card_finish, integer, boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."collection_entry_price_and_total"(public.card_prices, public.card_finish, integer, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "private"."collection_entry_price_and_total"(public.card_prices, public.card_finish, integer, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."collection_entry_price_and_total"(public.card_prices, public.card_finish, integer, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."collection_entry_price_and_total"(public.card_prices, public.card_finish, integer, boolean) TO "postgres";
