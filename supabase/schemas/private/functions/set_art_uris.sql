CREATE OR REPLACE FUNCTION private.set_art_uris (
  set_codes text[]
)
  RETURNS TABLE (
    set_code    text,
    set_art_uri text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select distinct on (printing.set_code) printing.set_code, p.art_crop_uri
  from private.set_card_printings(set_codes) printing
  join public.card_printings p on p.id = printing.card_printing_id
  left join public.card_prices price on price.printing_id = p.id
  where p.art_crop_uri is not null
  order by
    printing.set_code,
    greatest(price.usd_nonfoil_cents, price.usd_foil_cents, price.usd_etched_cents) desc nulls last,
    private.collector_number_order(p.collector_number);
$function$;

GRANT EXECUTE ON FUNCTION "private"."set_art_uris"(text[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."set_art_uris"(text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."set_art_uris"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."set_art_uris"(text[]) TO "postgres";
