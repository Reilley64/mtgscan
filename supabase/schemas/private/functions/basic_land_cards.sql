CREATE OR REPLACE FUNCTION private.basic_land_cards()
  RETURNS TABLE (
    kind_order integer,
    name       text,
    oracle_id  uuid,
    image_uris text[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select kind.kind_order, kind.name, land.oracle_id, land.image_uris
  from private.basic_land_kinds() kind
  left join lateral (
    select card.oracle_id, printing.image_uris
    from public.cards card
    join public.card_printings printing on printing.id = private.default_printing_id(card.oracle_id)
    where card.name_key = private.name_key(kind.name) collate "C"
      and card.name = kind.name
      and card.absent_since is null
      and printing.absent_since is null
    limit 1
  ) land on true;
$function$;

GRANT EXECUTE ON FUNCTION "private"."basic_land_cards"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."basic_land_cards"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."basic_land_cards"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."basic_land_cards"() TO "postgres";
