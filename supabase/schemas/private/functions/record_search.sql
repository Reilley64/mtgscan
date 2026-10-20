CREATE OR REPLACE FUNCTION private.record_search (
  search_id    uuid,
  api          public.search_api,
  query        jsonb,
  result_count bigint,
  latency_ms   double precision,
  result_ids   uuid[]
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into public.search_telemetry (
    search_id, user_id, api, caller, query, result_count, latency_ms, result_ids
  )
  select
    search_id,
    auth.uid(),
    api,
    case
      when private.caller_uses_secret_key() then 'release_check'
      when auth.jwt() ->> 'client_id' is not null then 'mcp'
      else 'app'
    end::public.search_caller,
    query,
    result_count,
    latency_ms,
    result_ids;
$function$;

GRANT EXECUTE ON FUNCTION "private"."record_search"(uuid, public.search_api, jsonb, bigint, double precision, uuid[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."record_search"(uuid, public.search_api, jsonb, bigint, double precision, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "private"."record_search"(uuid, public.search_api, jsonb, bigint, double precision, uuid[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."record_search"(uuid, public.search_api, jsonb, bigint, double precision, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."record_search"(uuid, public.search_api, jsonb, bigint, double precision, uuid[]) TO "postgres";
