drop function public.list_decks();

create function public.list_decks(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  perform private.check_request(query, array[]::text[]);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      private.deck_row(deck) || jsonb_build_object(
        'revision', deck.revision,
        'evaluation', (
          select jsonb_build_object('validity', evaluation.validity, 'estimated_bracket', evaluation.estimated_bracket)
            || private.deck_evaluation_staleness(evaluation)
          from public.deck_evaluations evaluation
          where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
        )
      )
      order by deck.last_used_at desc, lower(deck.name), deck.name, deck.id
    )
    from public.decks deck
  ), '[]'::jsonb));
end;
$$;

drop function public.list_user_tags();

create function public.list_user_tags(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  perform private.check_request(query, array[]::text[]);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_tag_id', user_tag.id,
        'name', user_tag.name,
        'copy_count', (
          select count(*) from public.copy_user_tags link where link.user_id = user_tag.user_id and link.user_tag_id = user_tag.id
        )
      )
      order by lower(user_tag.name), user_tag.name, user_tag.id
    )
    from public.user_tags user_tag
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.list_decks(jsonb), public.list_user_tags(jsonb) from public, anon, service_role;
grant execute on function public.list_decks(jsonb), public.list_user_tags(jsonb) to authenticated;

create or replace function private.record_search(
  search_id uuid,
  api public.search_api,
  query jsonb,
  result_count bigint,
  latency_ms double precision,
  result_ids uuid[]
)
returns void
language sql
security definer
set search_path = ''
as $$
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
$$;
