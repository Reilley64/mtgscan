CREATE OR REPLACE FUNCTION private.page_cursor (
  query_hash text,
  last_key   jsonb
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select translate(
    encode(
      convert_to(
        jsonb_build_object(
          'query_hash', query_hash,
          'issued_at', extract(epoch from now()),
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

GRANT EXECUTE ON FUNCTION "private"."page_cursor"(text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."page_cursor"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."page_cursor"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."page_cursor"(text, jsonb) TO "postgres";
