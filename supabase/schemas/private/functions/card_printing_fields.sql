CREATE OR REPLACE FUNCTION private.card_printing_fields (
  printing public.card_printings
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'printing_id', printing.id,
    'set', printing.set_code,
    'set_name', printing.set_name,
    'collector_number', printing.collector_number,
    'rarity', printing.rarity,
    'released_at', printing.released_at,
    'finishes', to_jsonb(printing.finishes)
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."card_printing_fields"(public.card_printings) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."card_printing_fields"(public.card_printings) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."card_printing_fields"(public.card_printings) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."card_printing_fields"(public.card_printings) TO "postgres";
