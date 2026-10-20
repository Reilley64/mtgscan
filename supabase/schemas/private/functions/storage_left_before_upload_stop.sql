CREATE OR REPLACE FUNCTION private.storage_left_before_upload_stop()
  RETURNS numeric
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select 0.9 * l.bytes - (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o)
  from private.storage_limit l;
$function$;

REVOKE ALL ON FUNCTION "private"."storage_left_before_upload_stop"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."storage_left_before_upload_stop"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."storage_left_before_upload_stop"() TO "postgres";
