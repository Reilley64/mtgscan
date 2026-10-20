CREATE OR REPLACE FUNCTION public.begin_mcp_call (
  tool text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
begin
  caller := private.caller_user_id();
  if auth.jwt() ->> 'client_id' is null then
    perform private.raise_search_error('unauthorized', 'Only an AI client''s token can call the MCP server.');
  end if;
  if not exists (
    select 1
      from auth.sessions session
      where session.id = (auth.jwt() ->> 'session_id')::uuid
        and session.user_id = caller
        and (session.not_after is null or session.not_after > pg_catalog.now())
  ) then
    perform private.raise_search_error('unauthorized', 'This AI client''s session has ended. Connect it again in your AI chat.');
  end if;
  if tool is null then
    return;
  end if;

  delete from public.mcp_call_counts counts
    where counts.user_id = caller and counts.period_start < pg_catalog.date_trunc('minute', pg_catalog.now(), 'UTC');
  perform private.count_mcp_call(caller, 'minute', 120);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."begin_mcp_call"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."begin_mcp_call"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."begin_mcp_call"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."begin_mcp_call"(text) FROM PUBLIC, "anon", "service_role";
