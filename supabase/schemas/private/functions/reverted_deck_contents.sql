CREATE OR REPLACE FUNCTION private.reverted_deck_contents (
  contents jsonb,
  changes  jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'copies', coalesce((
      select jsonb_agg(copy order by copy ->> 'copy_id')
      from (
        select copy
        from jsonb_array_elements(contents -> 'copies') copy
        where not exists (
          select from jsonb_array_elements(changes -> 'copy_lines') line where line ->> 'copy_id' = copy ->> 'copy_id'
        )
        union all
        select jsonb_build_object('copy_id', line -> 'copy_id', 'card_printing_id', line -> 'card_printing_id', 'role', line -> 'place_after')
        from jsonb_array_elements(changes -> 'copy_lines') line
        where line ->> 'place_after' is not null
      ) reverted_copies
    ), '[]'::jsonb),
    'basic_lands', coalesce((
      select jsonb_agg(land order by land ->> 'oracle_id')
      from (
        select land
        from jsonb_array_elements(contents -> 'basic_lands') land
        where not exists (
          select from jsonb_array_elements(changes -> 'basic_land_lines') line where line ->> 'oracle_id' = land ->> 'oracle_id'
        )
        union all
        select jsonb_build_object('oracle_id', line -> 'oracle_id', 'count', line -> 'count_after')
        from jsonb_array_elements(changes -> 'basic_land_lines') line
        where (line ->> 'count_after')::integer > 0
      ) reverted_lands
    ), '[]'::jsonb)
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."reverted_deck_contents"(jsonb, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."reverted_deck_contents"(jsonb, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."reverted_deck_contents"(jsonb, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."reverted_deck_contents"(jsonb, jsonb) TO "postgres";
