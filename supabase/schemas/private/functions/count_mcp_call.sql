CREATE OR REPLACE FUNCTION private.count_mcp_call (
  caller      uuid,
  call_period text,
  call_limit  integer
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  started timestamptz := pg_catalog.date_trunc(call_period, pg_catalog.now(), 'UTC');
  counted integer;
begin
  insert into public.mcp_call_counts as counts (user_id, period, period_start, count)
    values (caller, call_period, started, 1)
    on conflict (user_id, period, period_start) do update set count = counts.count + 1
    returning counts.count into counted;
  if counted > call_limit then
    perform private.raise_search_error(
      'rate_limited',
      format('You can make %s tool calls a %s. Wait, then try again.', call_limit, call_period),
      jsonb_build_object(
        'retry_after_seconds',
        ceil(extract(epoch from started + ('1 ' || call_period)::interval - pg_catalog.now()))::integer
      )::text
    );
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."count_mcp_call"(uuid, text, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."count_mcp_call"(uuid, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."count_mcp_call"(uuid, text, integer) TO "postgres";
