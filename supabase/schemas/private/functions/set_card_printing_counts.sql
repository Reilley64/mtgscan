CREATE OR REPLACE FUNCTION private.set_card_printing_counts (
  set_codes text[]
)
  RETURNS TABLE (
    set_code         text,
    card_printing_id uuid,
    in_main_set      boolean,
    counts           jsonb
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    printing.set_code,
    printing.card_printing_id,
    printing.in_main_set,
    jsonb_build_object(
      'any', owned.copies,
      'nonfoil', case
        when 'nonfoil' = any (p.finishes) then owned.nonfoil_copies
        else owned.copies
      end,
      'foil', case
        when p.finishes && array['foil', 'etched']::public.card_finish[] then owned.foil_copies
      end
    )
  from private.set_card_printings(set_codes) printing
  join public.card_printings p on p.id = printing.card_printing_id
  cross join lateral (
    select
      count(*) as copies,
      count(*) filter (where copy.finish = 'nonfoil') as nonfoil_copies,
      count(*) filter (where copy.finish in ('foil', 'etched')) as foil_copies
    from public.copies copy
    where copy.card_printing_id = printing.card_printing_id
  ) owned;
$function$;

GRANT EXECUTE ON FUNCTION "private"."set_card_printing_counts"(text[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."set_card_printing_counts"(text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."set_card_printing_counts"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."set_card_printing_counts"(text[]) TO "postgres";
