create type public.deck_suggestion_status as enum ('open', 'withdrawn', 'stale');

create type public.deck_suggestion_event_kind as enum ('withdrawn', 'reason_replaced');

create table public.deck_suggestions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  deck_id uuid not null,
  incoming_oracle_id uuid not null references public.cards (oracle_id),
  as_commander boolean not null,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid references public.cards (oracle_id),
  reason text not null check (char_length(reason) between 20 and 600),
  status public.deck_suggestion_status not null default 'open',
  from_deck_id uuid,
  paired_suggestion_id uuid,
  client_id uuid not null,
  client_name text,
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  primary key (user_id, id),
  check (outgoing_copy_id is null or outgoing_oracle_id is not null),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade,
  foreign key (user_id, from_deck_id) references public.decks (user_id, id) on delete set null (from_deck_id),
  foreign key (user_id, paired_suggestion_id) references public.deck_suggestions (user_id, id)
    on delete set null (paired_suggestion_id)
);

create index deck_suggestions_by_deck on public.deck_suggestions (user_id, deck_id, status);
create index deck_suggestions_by_creation on public.deck_suggestions (user_id, created_at);

create table public.deck_suggestion_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  suggestion_id uuid not null,
  kind public.deck_suggestion_event_kind not null,
  client_id uuid not null,
  client_name text,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, suggestion_id) references public.deck_suggestions (user_id, id) on delete cascade
);

alter table public.deck_suggestions enable row level security;
alter table public.deck_suggestion_events enable row level security;

revoke all on table public.deck_suggestions, public.deck_suggestion_events from anon, authenticated;
grant select on table public.deck_suggestions, public.deck_suggestion_events to authenticated;

create policy "Users read their own deck suggestions"
  on public.deck_suggestions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own deck suggestion events"
  on public.deck_suggestion_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create table public.deck_suggestion_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index deck_suggestion_requests_by_creation on public.deck_suggestion_requests (created_at);

alter table public.deck_suggestion_requests enable row level security;

revoke all on table public.deck_suggestion_requests from anon, authenticated, service_role;

create type private.new_deck_suggestion as (
  index integer,
  suggestion_id uuid,
  ref text,
  deck_id uuid,
  deck_priority public.deck_priority,
  incoming_oracle_id uuid,
  incoming_is_basic_land boolean,
  as_commander boolean,
  from_deck_id uuid,
  from_deck_priority public.deck_priority,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid,
  outgoing_is_commander boolean,
  reason text,
  pair_with text,
  paired_suggestion_id uuid
);

create function private.caller_ai_client()
returns table (client_id uuid, client_name text)
language plpgsql
stable
set search_path = ''
as $$
declare
  claimed_client_id uuid := (auth.jwt() ->> 'client_id')::uuid;
begin
  if claimed_client_id is null then
    raise exception 'Only an AI client can change deck suggestions.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select claimed_client_id, (select client.client_name from auth.oauth_clients client where client.id = claimed_client_id);
end;
$$;

create function private.checked_key(field text, value jsonb, min_length integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'string' or (value #>> '{}') !~ format('^[A-Za-z0-9_-]{%s,64}$', min_length) then
    perform private.invalid_argument(field, format('%s must be %s to 64 of A-Z a-z 0-9 _ -.', field, min_length));
  end if;
  return value;
end;
$$;

create function private.checked_reason(field text, value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'string' or char_length(value #>> '{}') not between 20 and 600 then
    perform private.invalid_argument(field, format('%s must be a string of 20 to 600 characters.', field));
  end if;
  return value;
end;
$$;

create function private.checked_object(path text, value jsonb, required_fields text[], optional_fields text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  key text;
  member jsonb;
  field text;
begin
  if jsonb_typeof(value) is distinct from 'object' then
    perform private.invalid_argument(path, coalesce(path || ' must be a JSON object.', 'The request must be a JSON object.'));
  end if;

  for key, member in select entry.key, entry.value from jsonb_each(value) as entry order by entry.key loop
    field := concat_ws('.', path, key);
    if not key = any(required_fields || optional_fields) then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(key, case key
      when 'name' then private.checked_name(member)
      when 'tagged' then private.checked_boolean(field, member)
      when 'unprotect' then private.checked_boolean(field, member)
      when 'commander' then private.checked_boolean(field, member)
      when 'as_commander' then private.checked_boolean(field, member)
      when 'priority' then private.checked_choice(field, member, enum_range(null::public.deck_priority)::text[])
      when 'counts' then private.checked_basic_land_counts(field, member)
      when 'expected_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'expected_deck_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'idempotency_key' then private.checked_key(field, member, 8)
      when 'ref' then private.checked_key(field, member, 1)
      when 'pair_with' then private.checked_key(field, member, 1)
      when 'reason' then private.checked_reason(field, member)
      when 'suggestions' then private.checked_deck_suggestions(field, member)
      when 'incoming' then private.checked_object(field, member, array['oracle_id'], array['as_commander', 'from_deck_id'])
      when 'outgoing' then private.checked_outgoing(field, member)
      else private.checked_uuid(field, member)
    end);
  end loop;

  foreach key in array required_fields loop
    if not checked ? key then
      field := concat_ws('.', path, key);
      perform private.invalid_argument(field, format('%s is required.', field));
    end if;
  end loop;
  return checked;
end;
$$;


create or replace function private.check_request(request jsonb, fields text[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.checked_object(null, request, fields, '{}');
$$;

create function private.checked_outgoing(field text, value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := private.checked_object(field, value, '{}', array['copy_id', 'basic_land_oracle_id']);
begin
  if (select count(*) from jsonb_object_keys(checked)) <> 1 then
    perform private.invalid_argument(field, format('%s must have either copy_id or basic_land_oracle_id.', field));
  end if;
  return checked;
end;
$$;

create function private.checked_deck_suggestions(field text, value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '[]';
  suggestion jsonb;
  suggestion_field text;
  suggestion_index integer;
  earlier jsonb;
  earlier_index integer;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 10 then
    perform private.invalid_argument(field, format('%s must be a list of 1 to 10 suggestions.', field));
  end if;

  for suggestion_index in 0 .. jsonb_array_length(value) - 1 loop
    suggestion_field := format('%s[%s]', field, suggestion_index);
    suggestion := private.checked_object(
      suggestion_field,
      value -> suggestion_index,
      array['ref', 'deck_id', 'expected_deck_revision', 'incoming', 'reason'],
      array['outgoing', 'pair_with']
    );
    if (suggestion -> 'incoming' ? 'from_deck_id') <> (suggestion ? 'pair_with') then
      perform private.invalid_argument(
        suggestion_field || case when suggestion ? 'pair_with' then '.incoming.from_deck_id' else '.pair_with' end,
        format('%s.incoming.from_deck_id and %s.pair_with go together.', suggestion_field, suggestion_field)
      );
    end if;
    if suggestion -> 'incoming' ->> 'from_deck_id' = suggestion ->> 'deck_id' then
      perform private.invalid_argument(
        suggestion_field || '.incoming.from_deck_id',
        format('%s.incoming.from_deck_id must be another deck.', suggestion_field)
      );
    end if;
    for earlier, earlier_index in
      select element, ordinality - 1 from jsonb_array_elements(checked) with ordinality as listed(element, ordinality)
    loop
      if earlier ->> 'ref' = suggestion ->> 'ref' then
        perform private.invalid_argument(
          suggestion_field || '.ref',
          format('%s.ref repeats the ref of %s[%s].', suggestion_field, field, earlier_index)
        );
      end if;
      if earlier ->> 'deck_id' = suggestion ->> 'deck_id' and earlier -> 'expected_deck_revision' <> suggestion -> 'expected_deck_revision' then
        perform private.invalid_argument(
          suggestion_field || '.expected_deck_revision',
          format('%s.expected_deck_revision must match %s[%s], which names the same deck.', suggestion_field, field, earlier_index)
        );
      end if;
    end loop;
    checked := checked || jsonb_build_array(suggestion);
  end loop;
  return checked;
end;
$$;

grant execute on function
  private.checked_key(text, jsonb, integer),
  private.checked_reason(text, jsonb),
  private.checked_object(text, jsonb, text[], text[]),
  private.checked_outgoing(text, jsonb),
  private.checked_deck_suggestions(text, jsonb)
to authenticated;

create function private.is_basic_land_card(card_oracle_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from private.basic_land_cards() land where land.oracle_id = card_oracle_id);
$$;

create function private.outgoing_card_is_in_deck(owner_id uuid, chosen_deck_id uuid, outgoing_copy_id uuid, outgoing_oracle_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when outgoing_copy_id is not null then exists (
      select 1
      from public.deck_cards deck_card
      where deck_card.user_id = owner_id and deck_card.deck_id = chosen_deck_id and deck_card.copy_id = outgoing_copy_id
    )
    when outgoing_oracle_id is not null then exists (
      select 1
      from public.deck_basic_lands basic_land
      where basic_land.user_id = owner_id and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = outgoing_oracle_id
    )
    else true
  end;
$$;

create function private.deck_suggestion_identity(suggestion jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'deck_id', suggestion -> 'deck_id',
    'incoming_oracle_id', suggestion -> 'incoming_oracle_id',
    'as_commander', suggestion -> 'as_commander',
    'outgoing_copy_id', suggestion -> 'outgoing_copy_id',
    'outgoing_oracle_id', suggestion -> 'outgoing_oracle_id'
  );
$$;

create function private.resolved_deck_suggestion(owner_id uuid, suggestion_index integer, checked jsonb)
returns private.new_deck_suggestion
language plpgsql
stable
set search_path = ''
as $$
declare
  field text := format('suggestions[%s]', suggestion_index);
  resolved private.new_deck_suggestion;
  deck public.decks;
  from_deck public.decks;
begin
  select * into deck from public.decks found_deck where found_deck.user_id = owner_id and found_deck.id = (checked ->> 'deck_id')::uuid;
  if deck.id is null then
    perform private.raise_search_error('not_found', format('%s.deck_id is not one of your decks.', field), field || '.deck_id');
  end if;
  if deck.revision <> (checked ->> 'expected_deck_revision')::integer then
    perform private.raise_search_error(
      'stale_revision',
      format('%s.expected_deck_revision is not the deck revision. Read the deck again.', field),
      jsonb_build_object(
        'pointer', format('/suggestions/%s/expected_deck_revision', suggestion_index),
        'expected', (checked ->> 'expected_deck_revision')::integer,
        'current', deck.revision
      )::text
    );
  end if;

  resolved.index := suggestion_index;
  resolved.suggestion_id := gen_random_uuid();
  resolved.ref := checked ->> 'ref';
  resolved.deck_id := deck.id;
  resolved.deck_priority := deck.priority;
  resolved.incoming_oracle_id := (checked -> 'incoming' ->> 'oracle_id')::uuid;
  resolved.reason := checked ->> 'reason';
  resolved.pair_with := checked ->> 'pair_with';
  resolved.outgoing_is_commander := false;
  if not exists (select 1 from public.cards card where card.oracle_id = resolved.incoming_oracle_id) then
    perform private.raise_search_error(
      'invalid_card',
      format('%s.incoming.oracle_id is not a card in the card catalog.', field),
      field || '.incoming.oracle_id'
    );
  end if;
  resolved.incoming_is_basic_land := private.is_basic_land_card(resolved.incoming_oracle_id);

  if checked -> 'outgoing' ? 'copy_id' then
    resolved.outgoing_copy_id := (checked -> 'outgoing' ->> 'copy_id')::uuid;
    select printing.oracle_id, deck_card.commander_at is not null
      into resolved.outgoing_oracle_id, resolved.outgoing_is_commander
      from public.copies copy
      join public.card_printings printing on printing.id = copy.card_printing_id
      left join public.deck_cards deck_card
        on deck_card.user_id = copy.user_id and deck_card.copy_id = copy.id and deck_card.deck_id = deck.id
      where copy.user_id = owner_id and copy.id = resolved.outgoing_copy_id;
    if resolved.outgoing_oracle_id is null then
      perform private.raise_search_error(
        'not_found',
        format('%s.outgoing.copy_id is not one of your copies.', field),
        field || '.outgoing.copy_id'
      );
    end if;
  elsif checked -> 'outgoing' ? 'basic_land_oracle_id' then
    resolved.outgoing_oracle_id := (checked -> 'outgoing' ->> 'basic_land_oracle_id')::uuid;
    if not private.is_basic_land_card(resolved.outgoing_oracle_id) then
      perform private.invalid_argument(
        field || '.outgoing.basic_land_oracle_id',
        format('%s.outgoing.basic_land_oracle_id is not a basic land card.', field)
      );
    end if;
  end if;
  if not private.outgoing_card_is_in_deck(owner_id, deck.id, resolved.outgoing_copy_id, resolved.outgoing_oracle_id) then
    perform private.raise_search_error(
      'outgoing_not_in_deck',
      format('%s.outgoing is not in the deck. Read the deck again.', field),
      field || '.outgoing.' || case when resolved.outgoing_copy_id is not null then 'copy_id' else 'basic_land_oracle_id' end
    );
  end if;
  resolved.as_commander := coalesce((checked -> 'incoming' ->> 'as_commander')::boolean, resolved.outgoing_is_commander);

  resolved.from_deck_id := (checked -> 'incoming' ->> 'from_deck_id')::uuid;
  if resolved.from_deck_id is not null then
    select * into from_deck from public.decks found_deck where found_deck.user_id = owner_id and found_deck.id = resolved.from_deck_id;
    if from_deck.id is null then
      perform private.raise_search_error(
        'not_found',
        format('%s.incoming.from_deck_id is not one of your decks.', field),
        field || '.incoming.from_deck_id'
      );
    end if;
    resolved.from_deck_priority := from_deck.priority;
    if not exists (
      select 1
      from public.deck_cards deck_card
      join public.copies copy on copy.user_id = deck_card.user_id and copy.id = deck_card.copy_id
      join public.card_printings printing on printing.id = copy.card_printing_id
      where deck_card.user_id = owner_id and deck_card.deck_id = from_deck.id and printing.oracle_id = resolved.incoming_oracle_id
    ) then
      perform private.raise_search_error(
        'pair_incomplete',
        format('%s.incoming.from_deck_id names a deck without the incoming card.', field),
        field || '.incoming.from_deck_id'
      );
    end if;
  end if;
  return resolved;
end;
$$;

create function private.paired_deck_suggestions(suggestions private.new_deck_suggestion[])
returns private.new_deck_suggestion[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  suggestion private.new_deck_suggestion;
  partner private.new_deck_suggestion;
  field text;
begin
  foreach suggestion in array suggestions loop
    continue when suggestion.pair_with is null;
    field := format('suggestions[%s].pair_with', suggestion.index);
    select * into partner from unnest(suggestions) candidate where candidate.ref = suggestion.pair_with;
    if partner.ref is null then
      perform private.raise_search_error('not_found', format('%s is not the ref of a suggestion in this call.', field), field);
    end if;
    if partner.deck_id <> suggestion.from_deck_id
      or partner.outgoing_copy_id is null
      or partner.outgoing_oracle_id <> suggestion.incoming_oracle_id then
      perform private.raise_search_error(
        'pair_incomplete',
        format('%s must take the incoming card out of incoming.from_deck_id with an incoming card of its own.', field),
        field
      );
    end if;
    if coalesce(partner.pair_with, suggestion.ref) <> suggestion.ref or exists (
      select 1 from unnest(suggestions) other_suggestion
      where other_suggestion.pair_with = suggestion.pair_with and other_suggestion.index <> suggestion.index
    ) then
      perform private.invalid_argument(field, format('%s names a suggestion paired with another one.', field));
    end if;
    suggestion.paired_suggestion_id := partner.suggestion_id;
    partner.paired_suggestion_id := suggestion.suggestion_id;
    suggestions[suggestion.index + 1] := suggestion;
    suggestions[partner.index + 1] := partner;
  end loop;
  return suggestions;
end;
$$;

create function private.check_duplicate_deck_suggestions(owner_id uuid, suggestions private.new_deck_suggestion[])
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  suggestion private.new_deck_suggestion;
  open_suggestion_id uuid;
begin
  foreach suggestion in array suggestions loop
    if exists (
      select 1
      from unnest(suggestions) earlier
      where earlier.index < suggestion.index
        and private.deck_suggestion_identity(to_jsonb(earlier)) = private.deck_suggestion_identity(to_jsonb(suggestion))
    ) then
      perform private.invalid_argument(
        format('suggestions[%s]', suggestion.index),
        format('suggestions[%s] repeats another suggestion in this call.', suggestion.index)
      );
    end if;
    select saved.id into open_suggestion_id
      from public.deck_suggestions saved
      where saved.user_id = owner_id
        and saved.deck_id = suggestion.deck_id
        and saved.status = 'open'
        and private.deck_suggestion_identity(to_jsonb(saved)) = private.deck_suggestion_identity(to_jsonb(suggestion))
      limit 1;
    if open_suggestion_id is not null then
      perform private.raise_search_error(
        'duplicate_open_suggestion',
        format('suggestions[%s] is the same as an open suggestion. Withdraw it or replace its reason instead.', suggestion.index),
        jsonb_build_object('pointer', format('/suggestions/%s', suggestion.index), 'suggestion_id', open_suggestion_id)::text
      );
    end if;
  end loop;
end;
$$;

create function private.check_deck_suggestion_limits(owner_id uuid, suggestions private.new_deck_suggestion[])
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  hour_count integer;
  frees_room_at timestamptz;
  full_deck_index integer;
begin
  select count(*) into hour_count
    from public.deck_suggestions saved
    where saved.user_id = owner_id and saved.created_at > now() - interval '1 hour';
  if hour_count + cardinality(suggestions) > 30 then
    select saved.created_at + interval '1 hour' into frees_room_at
      from public.deck_suggestions saved
      where saved.user_id = owner_id and saved.created_at > now() - interval '1 hour'
      order by saved.created_at
      offset hour_count + cardinality(suggestions) - 31
      limit 1;
    perform private.raise_search_error(
      'limit_exceeded',
      'This call would pass 30 suggestions in an hour. Wait, then try again.',
      jsonb_build_object(
        'pointer', '/suggestions',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from frees_room_at - now()))::integer)
      )::text
    );
  end if;

  select min(per_deck.first_index) into full_deck_index
    from (
      select suggestion.deck_id, count(*) as new_count, min(suggestion.index) as first_index
      from unnest(suggestions) suggestion
      group by suggestion.deck_id
    ) per_deck
    where per_deck.new_count + (
      select count(*)
      from public.deck_suggestions saved
      where saved.user_id = owner_id and saved.deck_id = per_deck.deck_id and saved.status = 'open'
    ) > 50;
  if full_deck_index is not null then
    perform private.raise_search_error(
      'limit_exceeded',
      format('This call would pass 50 open suggestions in the deck of suggestions[%s]. Withdraw some first.', full_deck_index),
      format('suggestions[%s].deck_id', full_deck_index)
    );
  end if;
end;
$$;

create function private.deck_suggestion_effect(
  owner_id uuid,
  suggestion private.new_deck_suggestion,
  evaluation public.deck_evaluations
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  contents jsonb := private.deck_contents(owner_id, suggestion.deck_id);
  outgoing_basic_land_oracle_id uuid := case when suggestion.outgoing_copy_id is null then suggestion.outgoing_oracle_id end;
begin
  contents := jsonb_build_object(
    'copies', coalesce((
      select jsonb_agg(copy)
      from (
        select copy
        from jsonb_array_elements(contents -> 'copies') copy
        where (copy ->> 'copy_id')::uuid is distinct from suggestion.outgoing_copy_id
        union all
        select jsonb_build_object(
          'copy_id', suggestion.suggestion_id,
          'card_printing_id', (
            select printing.id
            from public.card_printings printing
            where printing.oracle_id = suggestion.incoming_oracle_id
            order by printing.absent_since is not null, printing.released_at desc, printing.id
            limit 1
          ),
          'role', case when suggestion.as_commander then 'commander' else 'main' end
        )
        where not suggestion.incoming_is_basic_land
      ) suggested_copies
    ), '[]'::jsonb),
    'basic_lands', coalesce((
      select jsonb_agg(jsonb_build_object('oracle_id', land.oracle_id, 'count', land.count) order by land.oracle_id)
      from (
        select counted.oracle_id, sum(counted.count) as count
        from (
          select (stored_land ->> 'oracle_id')::uuid as oracle_id, (stored_land ->> 'count')::integer as count
          from jsonb_array_elements(contents -> 'basic_lands') stored_land
          union all
          select suggestion.incoming_oracle_id, 1 where suggestion.incoming_is_basic_land
          union all
          select outgoing_basic_land_oracle_id, -1 where outgoing_basic_land_oracle_id is not null
        ) counted
        group by counted.oracle_id
        having sum(counted.count) > 0
      ) land
    ), '[]'::jsonb)
  );

  return private.deck_change_effect(evaluation, private.judge_deck(contents));
end;
$$;

create function private.deck_suggestion_warnings(owner_id uuid, suggestion private.new_deck_suggestion)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  evaluation public.deck_evaluations;
  effect jsonb;
  owned_count integer;
  free_count integer;
  free_unprotected_count integer;
  other_decks jsonb;
  warnings jsonb := '[]';
begin
  select * into evaluation
    from public.deck_evaluations stored
    where stored.user_id = owner_id and stored.deck_id = suggestion.deck_id;

  effect := private.deck_suggestion_effect(owner_id, suggestion, evaluation);
  if effect is not null then
    warnings := warnings || jsonb_build_object('code', 'would_break_validity', 'effect', effect);
  end if;

  if not suggestion.incoming_is_basic_land then
    select count(*), count(*) filter (where a.is_free), count(*) filter (where a.is_free and not a.is_protected)
      into owned_count, free_count, free_unprotected_count
      from private.collection_availability a
      where a.user_id = owner_id and a.oracle_id = suggestion.incoming_oracle_id;
    select jsonb_agg(
        jsonb_build_object('deck_id', holding_deck.id, 'name', holding_deck.name, 'priority', holding_deck.priority)
        order by holding_deck.priority, lower(holding_deck.name), holding_deck.id
      )
      into other_decks
      from public.decks holding_deck
      where holding_deck.user_id = owner_id
        and holding_deck.id <> suggestion.deck_id
        and exists (
          select 1
          from public.deck_cards deck_card
          join private.collection_availability a on a.user_id = deck_card.user_id and a.copy_id = deck_card.copy_id
          where deck_card.user_id = owner_id and deck_card.deck_id = holding_deck.id and a.oracle_id = suggestion.incoming_oracle_id
        );

    if free_count > 0 and free_unprotected_count = 0 then
      warnings := warnings || jsonb_build_object('code', 'protected_only');
    end if;
    if free_count = 0 and other_decks is not null and suggestion.from_deck_id is null then
      warnings := warnings || jsonb_build_object('code', 'in_other_decks', 'decks', other_decks);
    end if;
    if owned_count = 0 then
      warnings := warnings || jsonb_build_object('code', 'not_owned');
    end if;
  end if;

  if suggestion.outgoing_is_commander then
    warnings := warnings || jsonb_build_object('code', 'replaces_commander');
  end if;
  if suggestion.from_deck_priority < suggestion.deck_priority then
    warnings := warnings || jsonb_build_object(
      'code', 'against_deck_priority',
      'from_deck_priority', suggestion.from_deck_priority,
      'deck_priority', suggestion.deck_priority
    );
  end if;
  if (private.deck_evaluation_staleness(evaluation) ->> 'bracket_stale')::boolean then
    warnings := warnings || jsonb_build_object('code', 'rules_stale');
  end if;
  return warnings;
end;
$$;

create or replace function private.rules_data_behind(evaluation public.deck_evaluations)
returns table (source public.import_source)
language sql
stable
security definer
set search_path = ''
as $$
  select snapshot.source
  from public.import_snapshots snapshot
  where evaluation.deck_id is not null
    and snapshot.source in ('catalog', 'oracle_tags', 'commander_spellbook')
    and snapshot.snapshot_at > coalesce(
      case snapshot.source
        when 'catalog' then evaluation.catalog_at
        when 'oracle_tags' then evaluation.oracle_tags_at
        when 'commander_spellbook' then evaluation.commander_spellbook_at
      end,
      '-infinity'
    )
  union
  select 'oracle_tags'::public.import_source
  where evaluation.judged_at < (select max(change.changed_at) from public.disabled_tag_changes change);
$$;

create function public.create_deck_suggestions(request jsonb)
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
  perform private.check_deck_suggestion_limits(caller, suggestions);

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

revoke all on function public.create_deck_suggestions(jsonb) from public, anon, service_role;
grant execute on function public.create_deck_suggestions(jsonb) to authenticated;
