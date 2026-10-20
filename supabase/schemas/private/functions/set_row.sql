CREATE OR REPLACE FUNCTION private.set_row (
  card_set    public.card_sets,
  set_art_uri text,
  completion  jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'code', card_set.code,
    'name', card_set.name,
    'icon_svg_uri', card_set.icon_svg_uri,
    'released_at', card_set.released_at,
    'set_art_uri', set_art_uri,
    'completion', completion
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."set_row"(public.card_sets, text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."set_row"(public.card_sets, text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."set_row"(public.card_sets, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."set_row"(public.card_sets, text, jsonb) TO "postgres";
