CREATE OR REPLACE FUNCTION private.format_deck_change_lines (
  copy_lines       jsonb,
  basic_land_lines jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'kind', 'copy',
        'copy_id', line.copy_id,
        'name', card.name,
        'image_uris', to_jsonb(printing.image_uris),
        'type_line', card.type_line,
        'place_before', line.place_before,
        'place_after', line.place_after
      )
      order by card.name, line.copy_id
    )
    from jsonb_to_recordset(copy_lines) as line(
      copy_id uuid,
      card_printing_id uuid,
      place_before public.deck_role,
      place_after public.deck_role
    )
    join public.card_printings printing on printing.id = line.card_printing_id
    join public.cards card on card.oracle_id = printing.oracle_id
  ), '[]'::jsonb) || coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'kind', 'basic_land',
        'oracle_id', line.oracle_id,
        'name', land.name,
        'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb),
        'count_before', line.count_before,
        'count_after', line.count_after
      )
      order by land.kind_order
    )
    from jsonb_to_recordset(basic_land_lines) as line(oracle_id uuid, count_before integer, count_after integer)
    join private.basic_land_cards() land on land.oracle_id = line.oracle_id
  ), '[]'::jsonb);
$function$;

GRANT EXECUTE ON FUNCTION "private"."format_deck_change_lines"(jsonb, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."format_deck_change_lines"(jsonb, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."format_deck_change_lines"(jsonb, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."format_deck_change_lines"(jsonb, jsonb) TO "postgres";
