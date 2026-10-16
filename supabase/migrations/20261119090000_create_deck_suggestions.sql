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

create table public.deck_suggestion_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index deck_suggestion_requests_by_creation on public.deck_suggestion_requests (created_at);

alter table public.deck_suggestions enable row level security;
alter table public.deck_suggestion_events enable row level security;
alter table public.deck_suggestion_requests enable row level security;

revoke all on table public.deck_suggestions, public.deck_suggestion_events, public.deck_suggestion_requests
  from anon, authenticated;
grant select on table public.deck_suggestions, public.deck_suggestion_events, public.deck_suggestion_requests
  to authenticated;

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

create policy "Users read their own deck suggestion requests"
  on public.deck_suggestion_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

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

create function private.check_object_fields(field text, value jsonb, known text[], required text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  prefix text := coalesce(field || '.', '');
  unknown_field text;
  required_field text;
begin
  if jsonb_typeof(value) is distinct from 'object' then
    perform private.invalid_argument(field, format('%s must be a JSON object.', coalesce(field, 'The request')));
  end if;
  select key into unknown_field from jsonb_object_keys(value) key where key <> all (known) order by key limit 1;
  if unknown_field is not null then
    perform private.invalid_argument(prefix || unknown_field, format('%s%s is not a known field.', prefix, unknown_field));
  end if;
  foreach required_field in array required loop
    if not value ? required_field then
      perform private.invalid_argument(prefix || required_field, format('%s%s is required.', prefix, required_field));
    end if;
  end loop;
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

create function private.checked_deck_suggestion(field text, item jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  incoming jsonb := item -> 'incoming';
  outgoing jsonb := item -> 'outgoing';
  reason jsonb := item -> 'reason';
begin
  perform private.check_object_fields(
    field,
    item,
    array['ref', 'deck_id', 'expected_deck_revision', 'incoming', 'outgoing', 'reason', 'pair_with'],
    array['ref', 'deck_id', 'expected_deck_revision', 'incoming', 'reason']
  );
  perform private.check_object_fields(field || '.incoming', incoming, array['oracle_id', 'as_commander', 'from_deck_id'], array['oracle_id']);
  if outgoing is not null then
    perform private.check_object_fields(field || '.outgoing', outgoing, array['copy_id', 'basic_land_oracle_id'], '{}');
    if (select count(*) from jsonb_object_keys(outgoing)) <> 1 then
      perform private.invalid_argument(
        field || '.outgoing',
        format('%s.outgoing must have either copy_id or basic_land_oracle_id.', field)
      );
    end if;
  end if;
  if jsonb_typeof(reason) is distinct from 'string' or char_length(reason #>> '{}') not between 20 and 600 then
    perform private.invalid_argument(field || '.reason', format('%s.reason must be a string of 20 to 600 characters.', field));
  end if;
  if (incoming ? 'from_deck_id') <> (item ? 'pair_with') then
    perform private.invalid_argument(
      field || case when item ? 'pair_with' then '.incoming.from_deck_id' else '.pair_with' end,
      format('%s.incoming.from_deck_id and %s.pair_with go together.', field, field)
    );
  end if;

  return jsonb_build_object(
    'ref', private.checked_key(field || '.ref', item -> 'ref', 1),
    'deck_id', private.checked_uuid(field || '.deck_id', item -> 'deck_id'),
    'expected_deck_revision', private.checked_integer(field || '.expected_deck_revision', item -> 'expected_deck_revision', 0, 2147483647),
    'incoming_oracle_id', private.checked_uuid(field || '.incoming.oracle_id', incoming -> 'oracle_id'),
    'as_commander', case when incoming ? 'as_commander' then private.checked_boolean(field || '.incoming.as_commander', incoming -> 'as_commander') end,
    'from_deck_id', case when incoming ? 'from_deck_id' then private.checked_uuid(field || '.incoming.from_deck_id', incoming -> 'from_deck_id') end,
    'outgoing_copy_id', case when outgoing ? 'copy_id' then private.checked_uuid(field || '.outgoing.copy_id', outgoing -> 'copy_id') end,
    'outgoing_basic_land_oracle_id', case when outgoing ? 'basic_land_oracle_id'
      then private.checked_uuid(field || '.outgoing.basic_land_oracle_id', outgoing -> 'basic_land_oracle_id') end,
    'reason', reason,
    'pair_with', case when item ? 'pair_with' then private.checked_key(field || '.pair_with', item -> 'pair_with', 1) end
  );
end;
$$;

create function private.deck_suggestion_effect(owner_id uuid, item jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  chosen_deck_id uuid := (item ->> 'deck_id')::uuid;
  incoming_oracle_id uuid := (item ->> 'incoming_oracle_id')::uuid;
  incoming_is_basic_land boolean := (item ->> 'incoming_is_basic_land')::boolean;
  outgoing_basic_land_oracle_id uuid := case when item ->> 'outgoing_copy_id' is null then (item ->> 'outgoing_oracle_id')::uuid end;
  contents jsonb;
  evaluation public.deck_evaluations;
begin
  contents := private.deck_contents(owner_id, chosen_deck_id);
  select * into evaluation from public.deck_evaluations stored where stored.user_id = owner_id and stored.deck_id = chosen_deck_id;

  contents := jsonb_build_object(
    'copies', coalesce((
      select jsonb_agg(copy)
      from (
        select copy
        from jsonb_array_elements(contents -> 'copies') copy
        where (copy ->> 'copy_id') is distinct from (item ->> 'outgoing_copy_id')
        union all
        select jsonb_build_object(
          'copy_id', item -> 'suggestion_id',
          'card_printing_id', (
            select printing.id
            from public.card_printings printing
            where printing.oracle_id = incoming_oracle_id
            order by printing.absent_since is not null, printing.released_at desc, printing.id
            limit 1
          ),
          'role', case when (item ->> 'as_commander')::boolean then 'commander' else 'main' end
        )
        where not incoming_is_basic_land
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
          select incoming_oracle_id, 1 where incoming_is_basic_land
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

create function private.deck_rules_data_is_stale(owner_id uuid, chosen_deck_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  evaluation public.deck_evaluations;
begin
  select * into evaluation from public.deck_evaluations stored where stored.user_id = owner_id and stored.deck_id = chosen_deck_id;
  if evaluation.deck_id is not null then
    return (private.deck_evaluation_staleness(evaluation) ->> 'bracket_stale')::boolean;
  end if;
  return exists (
    select 1
    from public.catalog_freshness() freshness
    where freshness.source in ('catalog', 'oracle_tags', 'commander_spellbook')
      and freshness.succeeded_at is not null
      and freshness.is_stale
  );
end;
$$;

create function private.deck_suggestion_warnings(owner_id uuid, item jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  deck public.decks;
  from_deck public.decks;
  effect jsonb;
  owned_count integer;
  free_count integer;
  free_unprotected_count integer;
  other_decks jsonb;
  warnings jsonb := '[]';
begin
  select * into deck from public.decks named_deck where named_deck.user_id = owner_id and named_deck.id = (item ->> 'deck_id')::uuid;
  select * into from_deck from public.decks named_deck where named_deck.user_id = owner_id and named_deck.id = (item ->> 'from_deck_id')::uuid;

  effect := private.deck_suggestion_effect(owner_id, item);
  if effect is not null then
    warnings := warnings || jsonb_build_object('code', 'would_break_validity', 'effect', effect);
  end if;

  if not (item ->> 'incoming_is_basic_land')::boolean then
    select count(*), count(*) filter (where a.is_free), count(*) filter (where a.is_free and not a.is_protected)
      into owned_count, free_count, free_unprotected_count
      from private.collection_availability a
      where a.user_id = owner_id and a.oracle_id = (item ->> 'incoming_oracle_id')::uuid;
    select jsonb_agg(
        jsonb_build_object('deck_id', other.id, 'name', other.name, 'priority', other.priority)
        order by other.priority, lower(other.name), other.id
      )
      into other_decks
      from public.decks other
      where other.user_id = owner_id
        and other.id <> deck.id
        and exists (
          select 1
          from public.deck_cards deck_card
          join private.collection_availability a on a.user_id = deck_card.user_id and a.copy_id = deck_card.copy_id
          where deck_card.user_id = owner_id
            and deck_card.deck_id = other.id
            and a.oracle_id = (item ->> 'incoming_oracle_id')::uuid
        );

    if free_count > 0 and free_unprotected_count = 0 then
      warnings := warnings || jsonb_build_object('code', 'protected_only');
    end if;
    if free_count = 0 and other_decks is not null and from_deck.id is null then
      warnings := warnings || jsonb_build_object('code', 'in_other_decks', 'decks', other_decks);
    end if;
    if owned_count = 0 then
      warnings := warnings || jsonb_build_object('code', 'not_owned');
    end if;
  end if;

  if (item ->> 'outgoing_is_commander')::boolean then
    warnings := warnings || jsonb_build_object('code', 'replaces_commander');
  end if;
  if from_deck.priority < deck.priority then
    warnings := warnings || jsonb_build_object(
      'code', 'against_deck_priority',
      'from_deck_priority', from_deck.priority,
      'deck_priority', deck.priority
    );
  end if;
  if private.deck_rules_data_is_stale(owner_id, deck.id) then
    warnings := warnings || jsonb_build_object('code', 'rules_stale');
  end if;
  return warnings;
end;
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
  request_key text;
  stored public.deck_suggestion_requests;
  items jsonb := '[]';
  resolved jsonb := '[]';
  item jsonb;
  other jsonb;
  field text;
  pointer text;
  item_index integer;
  deck public.decks;
  outgoing record;
  from_deck_id uuid;
  duplicate_id uuid;
  result jsonb;
begin
  caller := private.caller_user_id();
  select client.client_id, client.client_name into ai_client_id, ai_client_name from private.caller_ai_client() client;

  perform private.check_object_fields(null, request, array['idempotency_key', 'suggestions'], array['idempotency_key', 'suggestions']);
  request_key := private.checked_key('idempotency_key', request -> 'idempotency_key', 8) #>> '{}';
  if jsonb_typeof(request -> 'suggestions') is distinct from 'array'
    or jsonb_array_length(request -> 'suggestions') not between 1 and 10 then
    perform private.invalid_argument('suggestions', 'suggestions must be a list of 1 to 10 suggestions.');
  end if;
  for item_index in 0 .. jsonb_array_length(request -> 'suggestions') - 1 loop
    field := format('suggestions[%s]', item_index);
    item := private.checked_deck_suggestion(field, request -> 'suggestions' -> item_index);
    for other in select value from jsonb_array_elements(items) loop
      if other ->> 'ref' = item ->> 'ref' then
        perform private.invalid_argument(field || '.ref', format('%s.ref repeats the ref of suggestions[%s].', field, other ->> 'index'));
      end if;
      if other ->> 'deck_id' = item ->> 'deck_id' and other -> 'expected_deck_revision' <> item -> 'expected_deck_revision' then
        perform private.invalid_argument(
          field || '.expected_deck_revision',
          format('%s.expected_deck_revision must match suggestions[%s], which names the same deck.', field, other ->> 'index')
        );
      end if;
    end loop;
    if item ->> 'from_deck_id' = item ->> 'deck_id' then
      perform private.invalid_argument(
        field || '.incoming.from_deck_id',
        format('%s.incoming.from_deck_id must be another deck.', field)
      );
    end if;
    items := items || (jsonb_build_object('index', item_index, 'suggestion_id', gen_random_uuid()) || item);
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_deck_suggestions ' || caller::text, 0));
  delete from public.deck_suggestion_requests old where old.created_at < now() - interval '24 hours';
  select * into stored
    from public.deck_suggestion_requests earlier_request
    where earlier_request.user_id = caller and earlier_request.idempotency_key = request_key;
  if stored.user_id is not null then
    if stored.request <> request then
      perform private.raise_search_error(
        'idempotency_conflict',
        'idempotency_key was used with different input. Send a new idempotency_key.',
        'idempotency_key'
      );
    end if;
    return stored.result || jsonb_build_object('replayed', true);
  end if;

  perform 1
    from public.decks locked
    where locked.user_id = caller
      and locked.id in (
        select (named ->> 'deck_id')::uuid from jsonb_array_elements(items) named
        union
        select (named ->> 'from_deck_id')::uuid from jsonb_array_elements(items) named
      )
    order by locked.id
    for update;

  for item in select value from jsonb_array_elements(items) order by (value ->> 'index')::integer loop
    field := format('suggestions[%s]', item ->> 'index');
    pointer := format('/suggestions/%s', item ->> 'index');
    select * into deck from public.decks named_deck where named_deck.user_id = caller and named_deck.id = (item ->> 'deck_id')::uuid;
    if deck.id is null then
      perform private.raise_search_error('not_found', format('%s.deck_id is not one of your decks.', field), field || '.deck_id');
    end if;
    if deck.revision <> (item ->> 'expected_deck_revision')::integer then
      perform private.raise_search_error(
        'stale_revision',
        format('%s.expected_deck_revision is not the deck revision. Read the deck again.', field),
        jsonb_build_object(
          'pointer', pointer || '/expected_deck_revision',
          'expected', (item ->> 'expected_deck_revision')::integer,
          'current', deck.revision
        )::text
      );
    end if;
    if not exists (select 1 from public.cards card where card.oracle_id = (item ->> 'incoming_oracle_id')::uuid) then
      perform private.raise_search_error(
        'invalid_card',
        format('%s.incoming.oracle_id is not a card in the card catalog.', field),
        field || '.incoming.oracle_id'
      );
    end if;
    item := item || jsonb_build_object(
      'incoming_is_basic_land',
      exists (select 1 from private.basic_land_cards() land where land.oracle_id = (item ->> 'incoming_oracle_id')::uuid),
      'outgoing_oracle_id', null,
      'outgoing_is_commander', false
    );

    if item ->> 'outgoing_copy_id' is not null then
      select printing.oracle_id, deck_card.deck_id, deck_card.commander_at is not null as is_commander
        into outgoing
        from public.copies copy
        join public.card_printings printing on printing.id = copy.card_printing_id
        left join public.deck_cards deck_card on deck_card.user_id = copy.user_id and deck_card.copy_id = copy.id
        where copy.user_id = caller and copy.id = (item ->> 'outgoing_copy_id')::uuid;
      if outgoing.oracle_id is null then
        perform private.raise_search_error(
          'not_found',
          format('%s.outgoing.copy_id is not one of your copies.', field),
          field || '.outgoing.copy_id'
        );
      end if;
      if outgoing.deck_id is distinct from deck.id then
        perform private.raise_search_error(
          'outgoing_not_in_deck',
          format('%s.outgoing.copy_id is not in the deck. Read the deck again.', field),
          field || '.outgoing.copy_id'
        );
      end if;
      item := item || jsonb_build_object('outgoing_oracle_id', outgoing.oracle_id, 'outgoing_is_commander', outgoing.is_commander);
    elsif item ->> 'outgoing_basic_land_oracle_id' is not null then
      if not exists (
        select 1 from private.basic_land_cards() land where land.oracle_id = (item ->> 'outgoing_basic_land_oracle_id')::uuid
      ) then
        perform private.invalid_argument(
          field || '.outgoing.basic_land_oracle_id',
          format('%s.outgoing.basic_land_oracle_id is not a basic land card.', field)
        );
      end if;
      if not exists (
        select 1
        from public.deck_basic_lands land
        where land.user_id = caller and land.deck_id = deck.id and land.oracle_id = (item ->> 'outgoing_basic_land_oracle_id')::uuid
      ) then
        perform private.raise_search_error(
          'outgoing_not_in_deck',
          format('%s.outgoing.basic_land_oracle_id is not in the deck. Read the deck again.', field),
          field || '.outgoing.basic_land_oracle_id'
        );
      end if;
      item := item || jsonb_build_object('outgoing_oracle_id', item -> 'outgoing_basic_land_oracle_id');
    end if;
    item := item || jsonb_build_object(
      'as_commander',
      coalesce((item ->> 'as_commander')::boolean, (item ->> 'outgoing_is_commander')::boolean)
    );

    from_deck_id := (item ->> 'from_deck_id')::uuid;
    if from_deck_id is not null then
      if not exists (select 1 from public.decks named_deck where named_deck.user_id = caller and named_deck.id = from_deck_id) then
        perform private.raise_search_error(
          'not_found',
          format('%s.incoming.from_deck_id is not one of your decks.', field),
          field || '.incoming.from_deck_id'
        );
      end if;
      if not exists (
        select 1
        from public.deck_cards deck_card
        join public.copies copy on copy.user_id = deck_card.user_id and copy.id = deck_card.copy_id
        join public.card_printings printing on printing.id = copy.card_printing_id
        where deck_card.user_id = caller
          and deck_card.deck_id = from_deck_id
          and printing.oracle_id = (item ->> 'incoming_oracle_id')::uuid
      ) then
        perform private.raise_search_error(
          'pair_incomplete',
          format('%s.incoming.from_deck_id names a deck without the incoming card.', field),
          field || '.incoming.from_deck_id'
        );
      end if;
      if not exists (select 1 from jsonb_array_elements(items) partner where partner ->> 'ref' = item ->> 'pair_with') then
        perform private.raise_search_error(
          'not_found',
          format('%s.pair_with is not the ref of a suggestion in this call.', field),
          field || '.pair_with'
        );
      end if;
    end if;
    resolved := resolved || item;
  end loop;

  items := resolved;
  resolved := '[]';
  for item in select value from jsonb_array_elements(items) order by (value ->> 'index')::integer loop
    field := format('suggestions[%s]', item ->> 'index');
    pointer := format('/suggestions/%s', item ->> 'index');
    if item ->> 'pair_with' is not null then
      select partner into other from jsonb_array_elements(items) partner where partner ->> 'ref' = item ->> 'pair_with';
      if other ->> 'deck_id' <> item ->> 'from_deck_id' or other ->> 'outgoing_copy_id' is null
        or other ->> 'outgoing_oracle_id' <> item ->> 'incoming_oracle_id' then
        perform private.raise_search_error(
          'pair_incomplete',
          format('%s.pair_with must take the incoming card out of incoming.from_deck_id with an incoming card of its own.', field),
          field || '.pair_with'
        );
      end if;
      if other ->> 'pair_with' is distinct from item ->> 'ref' and other ->> 'pair_with' is not null then
        perform private.invalid_argument(field || '.pair_with', format('%s.pair_with names a suggestion paired with another one.', field));
      end if;
      if exists (
        select 1
        from jsonb_array_elements(items) rival
        where rival ->> 'pair_with' = item ->> 'pair_with' and (rival ->> 'index')::integer < (item ->> 'index')::integer
      ) then
        perform private.invalid_argument(field || '.pair_with', format('%s.pair_with names a suggestion paired with another one.', field));
      end if;
      item := item || jsonb_build_object('paired_suggestion_id', other -> 'suggestion_id');
    else
      select partner -> 'suggestion_id' into other
        from jsonb_array_elements(items) partner
        where partner ->> 'pair_with' = item ->> 'ref';
      item := item || jsonb_build_object('paired_suggestion_id', other);
    end if;

    if exists (
      select 1
      from jsonb_array_elements(items) earlier
      where (earlier ->> 'index')::integer < (item ->> 'index')::integer
        and earlier ->> 'deck_id' = item ->> 'deck_id'
        and earlier ->> 'incoming_oracle_id' = item ->> 'incoming_oracle_id'
        and earlier -> 'as_commander' = item -> 'as_commander'
        and earlier -> 'outgoing_copy_id' = item -> 'outgoing_copy_id'
        and earlier -> 'outgoing_oracle_id' = item -> 'outgoing_oracle_id'
    ) then
      perform private.invalid_argument(field, format('%s repeats another suggestion in this call.', field));
    end if;
    select suggestion.id into duplicate_id
      from public.deck_suggestions suggestion
      where suggestion.user_id = caller
        and suggestion.deck_id = (item ->> 'deck_id')::uuid
        and suggestion.status = 'open'
        and suggestion.incoming_oracle_id = (item ->> 'incoming_oracle_id')::uuid
        and suggestion.as_commander = (item ->> 'as_commander')::boolean
        and suggestion.outgoing_copy_id is not distinct from (item ->> 'outgoing_copy_id')::uuid
        and suggestion.outgoing_oracle_id is not distinct from (item ->> 'outgoing_oracle_id')::uuid
      limit 1;
    if duplicate_id is not null then
      perform private.raise_search_error(
        'duplicate_open_suggestion',
        format('%s is the same as an open suggestion. Withdraw it or replace its reason instead.', field),
        jsonb_build_object('pointer', pointer, 'suggestion_id', duplicate_id)::text
      );
    end if;
    resolved := resolved || item;
  end loop;
  items := resolved;

  if (
    select count(*)
    from public.deck_suggestions suggestion
    where suggestion.user_id = caller and suggestion.created_at > now() - interval '1 hour'
  ) + jsonb_array_length(items) > 30 then
    perform private.raise_search_error(
      'limit_exceeded',
      'This call would pass 30 suggestions in an hour. Try again later.',
      'suggestions'
    );
  end if;
  select format('suggestions[%s].deck_id', named.first_index) into field
    from (
      select (named_item ->> 'deck_id')::uuid as deck_id, count(*) as item_count, min((named_item ->> 'index')::integer) as first_index
      from jsonb_array_elements(items) named_item
      group by named_item ->> 'deck_id'
    ) named
    where named.item_count + (
      select count(*)
      from public.deck_suggestions suggestion
      where suggestion.user_id = caller and suggestion.deck_id = named.deck_id and suggestion.status = 'open'
    ) > 50
    order by named.first_index
    limit 1;
  if field is not null then
    perform private.raise_search_error(
      'limit_exceeded',
      format('This call would pass 50 open suggestions in the deck of %s. Withdraw some first.', field),
      field
    );
  end if;

  resolved := '[]';
  for item in select value from jsonb_array_elements(items) order by (value ->> 'index')::integer loop
    resolved := resolved || (item || jsonb_build_object('warnings', private.deck_suggestion_warnings(caller, item)));
  end loop;
  items := resolved;

  insert into public.deck_suggestions (
    id, user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason,
    from_deck_id, paired_suggestion_id, client_id, client_name
  )
  select
    suggested.suggestion_id, caller, suggested.deck_id, suggested.incoming_oracle_id, suggested.as_commander,
    suggested.outgoing_copy_id, suggested.outgoing_oracle_id, suggested.reason, suggested.from_deck_id,
    suggested.paired_suggestion_id, ai_client_id, ai_client_name
  from jsonb_to_recordset(items) as suggested(
    suggestion_id uuid,
    deck_id uuid,
    incoming_oracle_id uuid,
    as_commander boolean,
    outgoing_copy_id uuid,
    outgoing_oracle_id uuid,
    reason text,
    from_deck_id uuid,
    paired_suggestion_id uuid
  );

  result := jsonb_build_object(
    'suggestions', (
      select jsonb_agg(
        jsonb_build_object(
          'ref', suggested -> 'ref',
          'suggestion_id', suggested -> 'suggestion_id',
          'paired_suggestion_id', suggested -> 'paired_suggestion_id',
          'warnings', suggested -> 'warnings'
        )
        order by (suggested ->> 'index')::integer
      )
      from jsonb_array_elements(items) suggested
    ),
    'replayed', false
  );
  insert into public.deck_suggestion_requests (user_id, idempotency_key, request, result)
    values (caller, request_key, request, result);
  return result;
end;
$$;

revoke all on function public.create_deck_suggestions(jsonb) from public, anon, service_role;
grant execute on function public.create_deck_suggestions(jsonb) to authenticated;
