CREATE OR REPLACE FUNCTION private.planned_line (
  owner_id       uuid,
  line_copy_id   uuid,
  line_oracle_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select case
    when line_copy_id is null and line_oracle_id is not null then (
      select jsonb_build_object(
        'kind', 'basic_land',
        'oracle_id', land.oracle_id,
        'name', land.name,
        'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb)
      )
      from private.basic_land_cards() land
      where land.oracle_id = line_oracle_id
    )
    else private.planned_copy_line(owner_id, line_copy_id, line_oracle_id)
  end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."planned_line"(uuid, uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."planned_line"(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."planned_line"(uuid, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."planned_line"(uuid, uuid, uuid) TO "postgres";
