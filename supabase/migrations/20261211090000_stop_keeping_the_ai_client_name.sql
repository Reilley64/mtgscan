drop function private.caller_ai_client();

create function private.caller_ai_client()
returns table (client_id uuid)
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
  return query select claimed_client_id;
end;
$$;

create or replace function public.create_planned_swaps(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  ai_client_id uuid;
  checked jsonb;
  replayed jsonb;
  swaps private.new_planned_swap[] := '{}';
  item_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  select client.client_id into ai_client_id from private.caller_ai_client() client;
  checked := private.check_request(request, array['idempotency_key', 'planned_swaps']);
  replayed := private.replayed_ai_write(caller, request);
  if replayed is not null then
    return replayed;
  end if;

  perform 1
    from public.decks locked_deck
    where locked_deck.user_id = caller
      and locked_deck.id in (select (item ->> 'deck_id')::uuid from jsonb_array_elements(checked -> 'planned_swaps') item)
    order by locked_deck.id
    for update;
  perform 1
    from public.copies held
    where held.user_id = caller
      and held.id in (select (item -> 'incoming' ->> 'copy_id')::uuid from jsonb_array_elements(checked -> 'planned_swaps') item)
    order by held.id
    for update;

  for item_index in 0 .. jsonb_array_length(checked -> 'planned_swaps') - 1 loop
    swaps := swaps || private.resolved_planned_swap(caller, item_index, checked -> 'planned_swaps' -> item_index);
  end loop;
  perform private.check_duplicate_plans(caller, 'planned_swaps', (select jsonb_agg(to_jsonb(swap)) from unnest(swaps) swap));

  result := jsonb_build_object(
    'planned_swaps', (
      select jsonb_agg(
        jsonb_build_object(
          'ref', swap.ref,
          'planned_swap_id', swap.planned_swap_id,
          'warnings', private.planned_swap_warnings(caller, swap)
        )
        order by swap.index
      )
      from unnest(swaps) swap
    ),
    'replayed', false
  );

  insert into public.planned_swaps (
    id, user_id, deck_id, incoming_copy_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason,
    client_id
  )
  select
    swap.planned_swap_id, caller, swap.deck_id, swap.incoming_copy_id, swap.incoming_oracle_id, swap.as_commander,
    swap.outgoing_copy_id, swap.outgoing_oracle_id, swap.reason, ai_client_id
  from unnest(swaps) swap;

  return private.save_ai_write(caller, request, result);
end;
$$;

create or replace function public.create_buylist_cards(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  ai_client_id uuid;
  checked jsonb;
  replayed jsonb;
  cards private.new_buylist_card[] := '{}';
  item_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  select client.client_id into ai_client_id from private.caller_ai_client() client;
  checked := private.check_request(request, array['idempotency_key', 'buylist_cards']);
  replayed := private.replayed_ai_write(caller, request);
  if replayed is not null then
    return replayed;
  end if;

  perform 1
    from public.decks locked_deck
    where locked_deck.user_id = caller
      and locked_deck.id in (select (item ->> 'deck_id')::uuid from jsonb_array_elements(checked -> 'buylist_cards') item)
    order by locked_deck.id
    for update;

  for item_index in 0 .. jsonb_array_length(checked -> 'buylist_cards') - 1 loop
    cards := cards || private.resolved_buylist_card(caller, item_index, checked -> 'buylist_cards' -> item_index);
  end loop;
  perform private.check_duplicate_plans(caller, 'buylist_cards', (select jsonb_agg(to_jsonb(card)) from unnest(cards) card));

  result := jsonb_build_object(
    'buylist_cards', (
      select jsonb_agg(
        jsonb_build_object(
          'ref', card.ref,
          'buylist_card_id', card.buylist_card_id,
          'warnings', private.buylist_card_warnings(caller, card)
        )
        order by card.index
      )
      from unnest(cards) card
    ),
    'replayed', false
  );

  insert into public.buylist_cards (
    id, user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason, client_id
  )
  select
    card.buylist_card_id, caller, card.deck_id, card.incoming_oracle_id, card.as_commander, card.outgoing_copy_id,
    card.outgoing_oracle_id, card.reason, ai_client_id
  from unnest(cards) card;

  return private.save_ai_write(caller, request, result);
end;
$$;

create or replace function public.list_planned_swaps(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  oldest_first boolean;
  after_created_at timestamptz;
  after_id uuid;
  page_rows jsonb;
begin
  perform private.caller_user_id();
  checked := private.checked_plan_query(query, 'planned swaps', enum_range(null::public.planned_swap_status)::text[]);
  oldest_first := checked ->> 'order' = 'oldest_first';
  after_created_at := (checked ->> 'after_created_at')::timestamptz;
  after_id := (checked ->> 'after_id')::uuid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'planned_swap_id', swap.id,
      'deck_id', swap.deck_id,
      'deck_name', deck.name,
      'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri',
      'incoming', private.planned_line(swap.user_id, swap.incoming_copy_id, swap.incoming_oracle_id),
      'outgoing', private.planned_line(swap.user_id, swap.outgoing_copy_id, swap.outgoing_oracle_id),
      'as_commander', swap.as_commander,
      'reason', swap.reason,
      'status', swap.status,
      'close_note', swap.close_note,
      'created_at', swap.created_at,
      'status_changed_at', swap.status_changed_at,
      'effect', case when swap.status = 'open' then private.planned_swap_effect(
        swap.user_id,
        swap.deck_id,
        swap.incoming_copy_id,
        swap.incoming_oracle_id,
        swap.as_commander,
        swap.outgoing_copy_id,
        swap.outgoing_oracle_id
      ) end
    )
    order by
      case when oldest_first then swap.created_at end,
      case when oldest_first then swap.id end,
      swap.created_at desc,
      swap.id desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.planned_swaps listed
      where (not checked ? 'deck_id' or listed.deck_id = (checked ->> 'deck_id')::uuid)
        and (not checked ? 'status' or listed.status = (checked ->> 'status')::public.planned_swap_status)
        and (
          after_id is null
          or (oldest_first and (listed.created_at, listed.id) > (after_created_at, after_id))
          or (not oldest_first and (listed.created_at, listed.id) < (after_created_at, after_id))
        )
      order by
        case when oldest_first then listed.created_at end,
        case when oldest_first then listed.id end,
        listed.created_at desc,
        listed.id desc
      limit (checked ->> 'limit')::integer + 1
    ) swap
    join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id;

  return private.plan_page(page_rows, (checked ->> 'limit')::integer, checked ->> 'query_hash', 'planned_swap_id');
end;
$$;

create or replace function public.list_buylist(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  oldest_first boolean;
  after_created_at timestamptz;
  after_id uuid;
  page_rows jsonb;
begin
  perform private.caller_user_id();
  checked := private.checked_plan_query(query, 'buylist', enum_range(null::public.buylist_card_status)::text[]);
  oldest_first := checked ->> 'order' = 'oldest_first';
  after_created_at := (checked ->> 'after_created_at')::timestamptz;
  after_id := (checked ->> 'after_id')::uuid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'buylist_card_id', card.id,
      'deck_id', card.deck_id,
      'deck_name', deck.name,
      'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri',
      'incoming', private.planned_card_line(card.incoming_oracle_id),
      'outgoing', private.planned_line(card.user_id, card.outgoing_copy_id, card.outgoing_oracle_id),
      'as_commander', card.as_commander,
      'reason', card.reason,
      'status', card.status,
      'close_note', card.close_note,
      'created_at', card.created_at,
      'status_changed_at', card.status_changed_at,
      'effect', case when card.status = 'open' then private.buylist_card_effect(
        card.user_id, card.deck_id, card.incoming_oracle_id, card.as_commander, card.outgoing_copy_id, card.outgoing_oracle_id
      ) end
    )
    order by
      case when oldest_first then card.created_at end,
      case when oldest_first then card.id end,
      card.created_at desc,
      card.id desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.buylist_cards listed
      where (not checked ? 'deck_id' or listed.deck_id = (checked ->> 'deck_id')::uuid)
        and (not checked ? 'status' or listed.status = (checked ->> 'status')::public.buylist_card_status)
        and (
          after_id is null
          or (oldest_first and (listed.created_at, listed.id) > (after_created_at, after_id))
          or (not oldest_first and (listed.created_at, listed.id) < (after_created_at, after_id))
        )
      order by
        case when oldest_first then listed.created_at end,
        case when oldest_first then listed.id end,
        listed.created_at desc,
        listed.id desc
      limit (checked ->> 'limit')::integer + 1
    ) card
    join public.decks deck on deck.user_id = card.user_id and deck.id = card.deck_id;

  return private.plan_page(page_rows, (checked ->> 'limit')::integer, checked ->> 'query_hash', 'buylist_card_id');
end;
$$;

create or replace function public.list_deck_changes(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  chosen_deck_id uuid;
  page_size integer;
  query_hash text;
  after_revision integer;
  page_rows jsonb;
  next_cursor text;
begin
  perform private.caller_user_id();
  checked := private.check_deck_changes_query(query);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('deck changes ' || chosen_deck_id::text);

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    begin
      after_revision := (private.read_page_cursor(checked ->> 'cursor', query_hash, 1) ->> 0)::integer;
    exception when invalid_text_representation then
      after_revision := null;
    end;
    if after_revision is null then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
  end if;

  if not exists (select 1 from public.decks deck where deck.id = chosen_deck_id) then
    perform private.raise_deck_not_found();
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'deck_change_id', change.id,
      'revision', change.revision,
      'kind', change.kind,
      'changed_at', change.changed_at,
      'reverted', change.reverted_by is not null,
      'reason', change.reason,
      'lines', private.deck_change_lines(change.user_id, change.id)
    )
    order by change.revision desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.deck_changes change
      where change.deck_id = chosen_deck_id
        and (after_revision is null or change.revision < after_revision)
      order by change.revision desc
      limit page_size + 1
    ) change;

  if jsonb_array_length(page_rows) > page_size then
    page_rows := page_rows - page_size;
    next_cursor := private.page_cursor(query_hash, jsonb_build_array(page_rows -> (page_size - 1) -> 'revision'));
  end if;

  return jsonb_build_object('items', page_rows, 'next_cursor', next_cursor);
end;
$$;

drop function private.swap_into_deck(uuid, uuid, public.copies, uuid, boolean, uuid, uuid, public.deck_change_kind, text, text, text);

create function private.swap_into_deck(
  owner_id uuid,
  chosen_deck_id uuid,
  incoming public.copies,
  incoming_oracle_id uuid,
  incoming_as_commander boolean,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid,
  change_kind public.deck_change_kind,
  change_reason text,
  field text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  outgoing_card public.deck_cards;
  change_id uuid;
begin
  delete from public.deck_cards card
    where card.user_id = owner_id and card.deck_id = chosen_deck_id and card.copy_id = swap_into_deck.outgoing_copy_id
    returning * into outgoing_card;
  if incoming_as_commander then
    perform private.commander_count_under_limit(owner_id, chosen_deck_id, field);
  end if;
  if incoming.id is not null then
    insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
      values (owner_id, chosen_deck_id, incoming.id, case when incoming_as_commander then now() end);
  end if;

  change_id := private.record_deck_change(owner_id, chosen_deck_id, change_kind);
  update public.deck_changes change
    set reason = change_reason
    where change.user_id = owner_id and change.id = change_id;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select
      owner_id,
      change_id,
      incoming.id,
      incoming.card_printing_id,
      incoming.finish,
      null,
      case when incoming_as_commander then 'commander' else 'main' end::public.deck_role
    where incoming.id is not null;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select owner_id, change_id, copy.id, copy.card_printing_id, copy.finish, private.deck_role(outgoing_card.commander_at), null
    from public.copies copy
    where copy.user_id = owner_id and copy.id = outgoing_card.copy_id;

  insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
    select owner_id, change_id, land.oracle_id, coalesce(stored.count, 0), coalesce(stored.count, 0) + land.change
    from (
      values
        (case when incoming.id is null then incoming_oracle_id end, 1),
        (case when outgoing_copy_id is null then outgoing_oracle_id end, -1)
    ) land(oracle_id, change)
    left join public.deck_basic_lands stored
      on stored.user_id = owner_id and stored.deck_id = chosen_deck_id and stored.oracle_id = land.oracle_id
    where land.oracle_id is not null and coalesce(stored.count, 0) + land.change >= 0;
  delete from public.deck_basic_lands stored
    using public.deck_change_basic_lands line
    where stored.user_id = owner_id
      and stored.deck_id = chosen_deck_id
      and line.user_id = owner_id
      and line.deck_change_id = change_id
      and line.oracle_id = stored.oracle_id;
  insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
    select owner_id, chosen_deck_id, line.oracle_id, line.count_after
    from public.deck_change_basic_lands line
    where line.user_id = owner_id and line.deck_change_id = change_id and line.count_after > 0;
end;
$$;

create or replace function private.swap_in(owner_id uuid, swap public.planned_swaps, field text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  held_copy public.copies;
begin
  select * into held_copy from public.copies copy where copy.user_id = owner_id and copy.id = swap.incoming_copy_id for update;

  perform private.swap_into_deck(
    owner_id,
    swap.deck_id,
    held_copy,
    swap.incoming_oracle_id,
    swap.as_commander,
    swap.outgoing_copy_id,
    swap.outgoing_oracle_id,
    'swapped_in',
    swap.reason,
    field
  );
  update public.planned_swaps planned
    set status = 'swapped_in', status_changed_at = now()
    where planned.user_id = owner_id and planned.id = swap.id;
  perform private.finish_deck_change(owner_id, swap.deck_id);
end;
$$;

create or replace function public.mark_buylist_card_bought(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  card public.buylist_cards;
  chosen_copy public.copies;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['buylist_card_id', 'copy_id', 'unprotect']);
  card := private.locked_buylist_card(caller, (checked ->> 'buylist_card_id')::uuid, array['open']::public.buylist_card_status[]);
  select * into chosen_copy
    from public.copies copy
    where copy.user_id = caller and copy.id = (checked ->> 'copy_id')::uuid
    for update;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  if (select printing.oracle_id from public.card_printings printing where printing.id = chosen_copy.card_printing_id)
    <> card.incoming_oracle_id then
    perform private.invalid_argument('copy_id', 'copy_id is not a copy of the card on the buylist card.');
  end if;
  perform private.take_free_copy(caller, chosen_copy, (checked ->> 'unprotect')::boolean);

  perform private.swap_into_deck(
    caller,
    card.deck_id,
    chosen_copy,
    card.incoming_oracle_id,
    card.as_commander,
    card.outgoing_copy_id,
    card.outgoing_oracle_id,
    'bought',
    card.reason,
    'buylist_card_id'
  );
  update public.buylist_cards bought
    set status = 'bought', status_changed_at = now()
    where bought.user_id = caller and bought.id = card.id;
  perform private.finish_deck_change(caller, card.deck_id);

  return jsonb_build_object(
    'deck_id', card.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = card.deck_id)
  );
end;
$$;

create or replace function private.move_planned_swaps_to_buylist(owner_id uuid, held_copy_ids uuid[], note public.close_note)
returns void
language sql
set search_path = ''
as $$
  with moved as (
    update public.planned_swaps swap
      set status = 'moved_to_buylist', close_note = note, status_changed_at = now()
      where swap.user_id = owner_id and swap.incoming_copy_id = any (held_copy_ids) and swap.status = 'open'
      returning swap.*
  )
  insert into public.buylist_cards (
    user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason, client_id, created_at
  )
  select
    moved.user_id,
    moved.deck_id,
    moved.incoming_oracle_id,
    moved.as_commander,
    moved.outgoing_copy_id,
    moved.outgoing_oracle_id,
    moved.reason,
    moved.client_id,
    moved.created_at
  from moved
  where not exists (
    select
    from public.buylist_cards saved
    where saved.user_id = moved.user_id
      and saved.deck_id = moved.deck_id
      and saved.status = 'open'
      and private.planned_swap_identity(to_jsonb(saved)) = private.planned_swap_identity(to_jsonb(moved))
  );
$$;

alter table public.planned_swaps drop column client_name;
alter table public.buylist_cards drop column client_name;
alter table public.deck_changes drop column client_name;
