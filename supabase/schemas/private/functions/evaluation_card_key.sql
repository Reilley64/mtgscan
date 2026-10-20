CREATE OR REPLACE FUNCTION private.evaluation_card_key (
  card jsonb
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case card ->> 'kind' when 'copy' then card ->> 'copy_id' else card ->> 'oracle_id' end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."evaluation_card_key"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."evaluation_card_key"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."evaluation_card_key"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluation_card_key"(jsonb) TO "postgres";
