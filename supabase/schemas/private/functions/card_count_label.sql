CREATE OR REPLACE FUNCTION private.card_count_label (
  count integer
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case when count = 1 then '1 card' else format('%s cards', count) end;
$function$;

REVOKE ALL ON FUNCTION "private"."card_count_label"(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."card_count_label"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."card_count_label"(integer) TO "postgres";
