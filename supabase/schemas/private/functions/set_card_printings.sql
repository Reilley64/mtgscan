CREATE OR REPLACE FUNCTION private.set_card_printings (
  set_codes text[]
)
  RETURNS TABLE (
    set_code         text,
    card_printing_id uuid,
    in_main_set      boolean
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with printing as (
    select p.set_code, p.id, p.booster, p.promo, p.variation
    from public.card_printings p
    where p.set_code = any (set_codes)
      and p.absent_since is null
      and not exists (select 1 from private.basic_land_cards() land where land.oracle_id = p.oracle_id)
  ),
  set_printings as (
    select
      printing.*,
      bool_or(printing.booster) over (partition by printing.set_code) as set_has_booster_cards,
      bool_and(printing.promo) over (partition by printing.set_code) as set_has_only_promos
    from printing
  )
  select
    set_printings.set_code,
    set_printings.id,
    case
      when set_printings.set_has_booster_cards then set_printings.booster and not set_printings.promo and not set_printings.variation
      when set_printings.set_has_only_promos then true
      else not set_printings.promo
    end
  from set_printings;
$function$;

GRANT EXECUTE ON FUNCTION "private"."set_card_printings"(text[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."set_card_printings"(text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."set_card_printings"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."set_card_printings"(text[]) TO "postgres";
