CREATE OR REPLACE FUNCTION private.deck_change_lines (
  owner_id  uuid,
  change_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.format_deck_change_lines(
    (
      select coalesce(jsonb_agg(to_jsonb(line)), '[]'::jsonb)
      from public.deck_change_lines line
      where line.user_id = owner_id and line.deck_change_id = change_id
    ),
    (
      select coalesce(jsonb_agg(to_jsonb(line)), '[]'::jsonb)
      from public.deck_change_basic_lands line
      where line.user_id = owner_id and line.deck_change_id = change_id
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."deck_change_lines"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."deck_change_lines"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_change_lines"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_change_lines"(uuid, uuid) TO "postgres";
