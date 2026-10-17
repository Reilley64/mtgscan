create or replace function private.caller_ai_client()
returns table (client_id uuid, client_name text)
language plpgsql
stable
set search_path = ''
as $$
declare
  claimed_client_id uuid := (auth.jwt() ->> 'client_id')::uuid;
begin
  if claimed_client_id is null then
    raise exception 'Only an AI client can call this function.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select claimed_client_id, (select client.client_name from auth.oauth_clients client where client.id = claimed_client_id);
end;
$$;

create or replace function private.checked_object(path text, value jsonb, required_fields text[], optional_fields text[])
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
      when 'limit' then private.checked_integer(field, member, 1, 50)
      when 'cursor' then private.checked_cursor(field, member)
      when 'counts' then private.checked_basic_land_counts(field, member)
      when 'expected_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'expected_deck_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'idempotency_key' then private.checked_key(field, member, 8)
      when 'ref' then private.checked_key(field, member, 1)
      when 'reason' then private.checked_reason(field, member)
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

create or replace function private.remove_from_deck(caller uuid, deck_card public.deck_cards, change_kind public.deck_change_kind)
returns void
language plpgsql
set search_path = ''
as $$
declare
  chosen_copy public.copies;
  change_id uuid;
begin
  delete from public.deck_cards card where card.user_id = caller and card.copy_id = deck_card.copy_id;
  select * into chosen_copy from public.copies copy where copy.user_id = caller and copy.id = deck_card.copy_id;

  change_id := private.record_deck_change(caller, deck_card.deck_id, change_kind);
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (
      caller,
      change_id,
      chosen_copy.id,
      chosen_copy.card_printing_id,
      chosen_copy.finish,
      private.deck_role(deck_card.commander_at),
      null
    );
  perform private.save_deck_evaluation(caller, deck_card.deck_id);
end;
$$;

create or replace function public.add_deck_card(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  chosen_copy public.copies;
  copy_is_free boolean;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'copy_id', 'unprotect']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;

  perform private.lock_deck(caller, chosen_deck_id);
  select * into chosen_copy
    from public.copies copy
    where copy.user_id = caller and copy.id = (checked ->> 'copy_id')::uuid
    for update;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  select a.is_free into copy_is_free
    from private.collection_availability a
    where a.user_id = caller and a.copy_id = chosen_copy.id;
  if not copy_is_free then
    perform private.raise_search_error('copy_not_free', 'Only a free copy can go into a deck.', 'copy_id');
  end if;
  if chosen_copy.is_protected then
    if not (checked ->> 'unprotect')::boolean then
      perform private.raise_search_error(
        'copy_protected',
        'copy_id is a protected copy. Send unprotect: true to unprotect it and add it.',
        'copy_id'
      );
    end if;
    update public.copies copy set is_protected = false where copy.user_id = caller and copy.id = chosen_copy.id;
  end if;

  insert into public.deck_cards (user_id, deck_id, copy_id) values (caller, chosen_deck_id, chosen_copy.id);
  change_id := private.record_deck_change(caller, chosen_deck_id, 'added');
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (caller, change_id, chosen_copy.id, chosen_copy.card_printing_id, chosen_copy.finish, null, 'main');
  perform private.save_deck_evaluation(caller, chosen_deck_id);

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

create or replace function public.set_deck_commander(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy public.copies;
  chosen_deck_id uuid;
  deck_card public.deck_cards;
  commander boolean;
  commander_count integer;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['copy_id', 'commander']);
  commander := (checked ->> 'commander')::boolean;

  deck_card := private.lock_deck_card(caller, (checked ->> 'copy_id')::uuid);
  chosen_deck_id := deck_card.deck_id;
  select * into chosen_copy from public.copies copy where copy.user_id = caller and copy.id = deck_card.copy_id;

  if commander and deck_card.commander_at is null then
    select count(*) into commander_count
      from public.deck_cards card
      where card.user_id = caller and card.deck_id = chosen_deck_id and card.commander_at is not null;
    if commander_count >= 2 then
      perform private.raise_search_error('commander_limit', 'A deck has at most two commanders.', 'commander');
    end if;
    update public.deck_cards card set commander_at = now()
      where card.user_id = caller and card.copy_id = chosen_copy.id;
    change_id := private.record_deck_change(
      caller,
      chosen_deck_id,
      case when commander_count = 0 then 'made_commander' else 'made_partner' end::public.deck_change_kind
    );
  elsif not commander and deck_card.commander_at is not null then
    update public.deck_cards card set commander_at = null
      where card.user_id = caller and card.copy_id = chosen_copy.id;
    change_id := private.record_deck_change(caller, chosen_deck_id, 'moved_to_main_deck');
  end if;

  if change_id is not null then
    insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
      values (
        caller,
        change_id,
        chosen_copy.id,
        chosen_copy.card_printing_id,
        chosen_copy.finish,
        private.deck_role(deck_card.commander_at),
        case when commander then 'commander' else 'main' end::public.deck_role
      );
    perform private.save_deck_evaluation(caller, chosen_deck_id);
  end if;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

create or replace function public.set_basic_lands(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  changes jsonb;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'counts']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  perform private.lock_deck(caller, chosen_deck_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'oracle_id', requested.oracle_id,
    'count_before', coalesce(basic_land.count, 0),
    'count_after', requested.count
  )), '[]'::jsonb)
    into changes
    from jsonb_to_recordset(checked -> 'counts') as requested(oracle_id uuid, count integer)
    left join public.deck_basic_lands basic_land
      on basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = requested.oracle_id
    where requested.count <> coalesce(basic_land.count, 0);

  if jsonb_array_length(changes) > 0 then
    change_id := private.record_deck_change(caller, chosen_deck_id, 'basic_lands');
    insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
      select caller, change_id, changed.oracle_id, changed.count_before, changed.count_after
      from jsonb_to_recordset(changes) as changed(oracle_id uuid, count_before integer, count_after integer);
    delete from public.deck_basic_lands basic_land
      where basic_land.user_id = caller
        and basic_land.deck_id = chosen_deck_id
        and basic_land.oracle_id in (select (change ->> 'oracle_id')::uuid from jsonb_array_elements(changes) change);
    insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
      select caller, chosen_deck_id, changed.oracle_id, changed.count_after
      from jsonb_to_recordset(changes) as changed(oracle_id uuid, count_after integer)
      where changed.count_after > 0;
    perform private.save_deck_evaluation(caller, chosen_deck_id);
  end if;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

create or replace function public.revert_deck_changes(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  chosen_change_id uuid;
  from_revision integer;
  effect jsonb;
  block jsonb;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'deck_change_id', 'expected_revision', 'unprotect']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  chosen_change_id := (checked ->> 'deck_change_id')::uuid;

  perform private.lock_deck(caller, chosen_deck_id);
  from_revision := private.reverted_revision(caller, chosen_deck_id, chosen_change_id);
  if (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
    <> (checked ->> 'expected_revision')::integer then
    perform private.raise_search_error(
      'stale_revision',
      'expected_revision is not the deck revision. Read the revert preview again.',
      'expected_revision'
    );
  end if;

  perform 1
    from public.copies copy
    where copy.user_id = caller and copy.id in (
      select line.copy_id
      from public.deck_change_lines line
      join public.deck_changes change on change.user_id = line.user_id and change.id = line.deck_change_id
      where change.user_id = caller and change.deck_id = chosen_deck_id and change.revision >= from_revision
    )
    order by copy.id
    for update of copy;
  effect := private.revert_effect(caller, chosen_change_id);

  block := effect -> 'blocks' -> 0;
  if block is not null then
    perform private.raise_search_error(
      'revert_blocked',
      case when jsonb_typeof(block -> 'deck') = 'object'
        then format('%s is in %s.', block ->> 'name', block -> 'deck' ->> 'name')
        else format('%s is no longer in your collection.', block ->> 'name')
      end,
      'deck_change_id'
    );
  end if;
  if jsonb_array_length(effect -> 'protected_copies') > 0 then
    if not (checked ->> 'unprotect')::boolean then
      perform private.raise_search_error(
        'copy_protected',
        format(
          '%s is a protected copy. Send unprotect: true to unprotect it and revert.',
          effect -> 'protected_copies' -> 0 ->> 'name'
        ),
        'unprotect'
      );
    end if;
    update public.copies copy
      set is_protected = false
      where copy.user_id = caller
        and copy.id in (select (item ->> 'copy_id')::uuid from jsonb_array_elements(effect -> 'protected_copies') item);
  end if;

  change_id := private.record_deck_change(caller, chosen_deck_id, 'revert');
  update public.deck_changes change
    set reverted_by = change_id
    where change.user_id = caller
      and change.deck_id = chosen_deck_id
      and change.revision >= from_revision
      and change.id <> change_id
      and change.reverted_by is null;

  delete from public.deck_cards card
    using jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_after public.deck_role)
    where card.user_id = caller and card.copy_id = line.copy_id and line.place_after is null;
  update public.deck_cards card
    set commander_at = case when line.place_after = 'commander' then now() end
    from jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_before public.deck_role, place_after public.deck_role)
    where card.user_id = caller and card.copy_id = line.copy_id and line.place_before is not null and line.place_after is not null;
  insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
    select caller, chosen_deck_id, line.copy_id, case when line.place_after = 'commander' then now() end
    from jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_before public.deck_role, place_after public.deck_role)
    where line.place_before is null;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select caller, change_id, line.copy_id, line.card_printing_id, line.finish, line.place_before, line.place_after
    from jsonb_to_recordset(effect -> 'copy_lines') as line(
      copy_id uuid,
      card_printing_id uuid,
      finish public.card_finish,
      place_before public.deck_role,
      place_after public.deck_role
    );

  insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
    select caller, change_id, line.oracle_id, line.count_before, line.count_after
    from jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid, count_before integer, count_after integer);
  delete from public.deck_basic_lands basic_land
    using jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid)
    where basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = line.oracle_id;
  insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
    select caller, chosen_deck_id, line.oracle_id, line.count_after
    from jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid, count_after integer)
    where line.count_after > 0;
  perform private.save_deck_evaluation(caller, chosen_deck_id);

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

drop function
  public.create_deck_suggestions(jsonb),
  public.withdraw_deck_suggestion(jsonb),
  public.update_deck_suggestion_reason(jsonb),
  public.list_deck_suggestions(jsonb),
  private.mark_stale_deck_suggestions(uuid, uuid),
  private.locked_deck_suggestion(uuid, uuid, public.deck_suggestion_status[]),
  private.record_deck_suggestion_event(uuid, uuid, public.deck_suggestion_event_kind, boolean),
  private.resolved_deck_suggestion(uuid, integer, jsonb),
  private.paired_deck_suggestions(private.new_deck_suggestion[]),
  private.check_duplicate_deck_suggestions(uuid, private.new_deck_suggestion[]),
  private.deck_suggestion_warnings(uuid, private.new_deck_suggestion),
  private.deck_suggestion_effect(uuid, private.new_deck_suggestion, public.deck_evaluations),
  private.deck_suggestion_identity(jsonb),
  private.checked_deck_suggestions(text, jsonb);

drop type private.new_deck_suggestion;

drop table public.deck_suggestion_events, public.deck_suggestions, public.deck_suggestion_requests;

drop type public.deck_suggestion_event_kind, public.deck_suggestion_status;

create table public.ai_write_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index ai_write_requests_by_creation on public.ai_write_requests (created_at);

alter table public.ai_write_requests enable row level security;

revoke all on table public.ai_write_requests from anon, authenticated, service_role;

create function private.replayed_ai_write(owner_id uuid, sent_request jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  earlier_request public.ai_write_requests;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai write ' || owner_id::text, 0));
  delete from public.ai_write_requests expired where expired.created_at < now() - interval '24 hours';
  select * into earlier_request
    from public.ai_write_requests saved
    where saved.user_id = owner_id and saved.idempotency_key = sent_request ->> 'idempotency_key';
  if earlier_request.user_id is null then
    return null;
  end if;
  if earlier_request.request <> sent_request then
    perform private.raise_search_error(
      'idempotency_conflict',
      'idempotency_key was used with different input. Send a new idempotency_key.',
      'idempotency_key'
    );
  end if;
  return earlier_request.result || jsonb_build_object('replayed', true);
end;
$$;

create function private.save_ai_write(owner_id uuid, sent_request jsonb, result jsonb)
returns jsonb
language sql
set search_path = ''
as $$
  insert into public.ai_write_requests (user_id, idempotency_key, request, result)
    values (owner_id, sent_request ->> 'idempotency_key', sent_request, result);
  select result;
$$;
