delete from public.mcp_call_counts counts where counts.period <> 'minute';

alter table public.mcp_call_counts
  drop constraint mcp_call_counts_period_check,
  add constraint mcp_call_counts_period_check check (period = 'minute');

create or replace function public.begin_mcp_call(tool text)
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
    where counts.user_id = caller and counts.period_start < pg_catalog.date_trunc('minute', pg_catalog.now(), 'UTC');
  perform private.count_mcp_call(caller, 'minute', 120);
end;
$$;

create or replace function public.create_deck_suggestions(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  ai_client_id uuid;
  ai_client_name text;
  checked jsonb;
  earlier_request public.deck_suggestion_requests;
  suggestions private.new_deck_suggestion[] := '{}';
  suggestion_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  select client.client_id, client.client_name into ai_client_id, ai_client_name from private.caller_ai_client() client;
  checked := private.check_request(request, array['idempotency_key', 'suggestions']);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_deck_suggestions ' || caller::text, 0));
  delete from public.deck_suggestion_requests expired where expired.created_at < now() - interval '24 hours';
  select * into earlier_request
    from public.deck_suggestion_requests saved
    where saved.user_id = caller and saved.idempotency_key = checked ->> 'idempotency_key';
  if earlier_request.user_id is not null then
    if earlier_request.request <> request then
      perform private.raise_search_error(
        'idempotency_conflict',
        'idempotency_key was used with different input. Send a new idempotency_key.',
        'idempotency_key'
      );
    end if;
    return earlier_request.result || jsonb_build_object('replayed', true);
  end if;

  perform 1
    from public.decks locked_deck
    where locked_deck.user_id = caller
      and locked_deck.id in (
        select (sent.suggestion ->> 'deck_id')::uuid from jsonb_array_elements(checked -> 'suggestions') sent(suggestion)
        union
        select (sent.suggestion -> 'incoming' ->> 'from_deck_id')::uuid from jsonb_array_elements(checked -> 'suggestions') sent(suggestion)
      )
    order by locked_deck.id
    for update;

  for suggestion_index in 0 .. jsonb_array_length(checked -> 'suggestions') - 1 loop
    suggestions := suggestions || private.resolved_deck_suggestion(caller, suggestion_index, checked -> 'suggestions' -> suggestion_index);
  end loop;
  suggestions := private.paired_deck_suggestions(suggestions);
  perform private.check_duplicate_deck_suggestions(caller, suggestions);

  result := jsonb_build_object(
    'suggestions', (
      select jsonb_agg(
        jsonb_build_object(
          'ref', suggestion.ref,
          'suggestion_id', suggestion.suggestion_id,
          'paired_suggestion_id', suggestion.paired_suggestion_id,
          'warnings', private.deck_suggestion_warnings(caller, suggestion)
        )
        order by suggestion.index
      )
      from unnest(suggestions) suggestion
    ),
    'replayed', false
  );

  insert into public.deck_suggestions (
    id, user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason,
    from_deck_id, paired_suggestion_id, client_id, client_name
  )
  select
    suggestion.suggestion_id, caller, suggestion.deck_id, suggestion.incoming_oracle_id, suggestion.as_commander,
    suggestion.outgoing_copy_id, suggestion.outgoing_oracle_id, suggestion.reason, suggestion.from_deck_id,
    suggestion.paired_suggestion_id, ai_client_id, ai_client_name
  from unnest(suggestions) suggestion;

  insert into public.deck_suggestion_requests (user_id, idempotency_key, request, result)
    values (caller, checked ->> 'idempotency_key', request, result);
  return result;
end;
$$;

drop function private.check_deck_suggestion_limits(uuid, private.new_deck_suggestion[]);
