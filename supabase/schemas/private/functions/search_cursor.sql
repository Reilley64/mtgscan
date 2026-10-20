CREATE OR REPLACE FUNCTION private.search_cursor (
  search_id  uuid,
  query_hash text,
  last_key   jsonb
)
  RETURNS text
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select translate(
    encode(
      convert_to(
        jsonb_build_object(
          'search_id', search_id,
          'query_hash', query_hash,
          'issued_at', extract(epoch from clock_timestamp()),
          'after', last_key
        )::text,
        'UTF8'
      ),
      'base64'
    ),
    E'\n',
    ''
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."search_cursor"(uuid, text, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."search_cursor"(uuid, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."search_cursor"(uuid, text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."search_cursor"(uuid, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."search_cursor"(uuid, text, jsonb) TO "postgres";
