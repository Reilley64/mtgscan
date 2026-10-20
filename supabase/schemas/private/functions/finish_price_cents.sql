CREATE OR REPLACE FUNCTION private.finish_price_cents (
  price  public.card_prices,
  finish public.card_finish
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case finish
    when 'nonfoil' then price.usd_nonfoil_cents
    when 'foil' then price.usd_foil_cents
    when 'etched' then price.usd_etched_cents
  end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."finish_price_cents"(public.card_prices, public.card_finish) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."finish_price_cents"(public.card_prices, public.card_finish) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."finish_price_cents"(public.card_prices, public.card_finish) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."finish_price_cents"(public.card_prices, public.card_finish) TO "postgres";
