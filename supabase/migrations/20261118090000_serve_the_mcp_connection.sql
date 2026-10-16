create or replace function public.set_mcp_audience(event jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when event -> 'claims' ->> 'client_id' is null then event
    else jsonb_set(
      event,
      '{claims,aud}',
      jsonb_build_array('authenticated', regexp_replace(event -> 'claims' ->> 'iss', '/auth/v1$', '/functions/v1/mcp'))
    )
  end;
$$;

revoke all on function public.set_mcp_audience(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.set_mcp_audience(jsonb) to supabase_auth_admin;

create table public.mcp_call_counts (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null check (period in ('minute', 'day')),
  period_start timestamptz not null,
  count integer not null,
  primary key (user_id, period, period_start)
);

alter table public.mcp_call_counts enable row level security;

create policy "Users read their own MCP call counts"
  on public.mcp_call_counts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.mcp_call_counts from anon, authenticated;
grant select on table public.mcp_call_counts to authenticated;

create function private.count_mcp_call(caller uuid, call_period text, call_limit integer)
returns void
language plpgsql
set search_path = ''
as $$
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
$$;

create function public.begin_mcp_call(tool text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    where counts.user_id = caller and counts.period_start < pg_catalog.date_trunc('day', pg_catalog.now(), 'UTC');
  perform private.count_mcp_call(caller, 'minute', 120);
  perform private.count_mcp_call(caller, 'day', 2000);
end;
$$;

revoke all on function public.begin_mcp_call(text) from public, anon, authenticated, service_role;
grant execute on function public.begin_mcp_call(text) to authenticated;
