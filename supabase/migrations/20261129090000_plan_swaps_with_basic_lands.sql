drop function private.checked_plan_items(text, jsonb, text, text[]);

create function private.checked_plan_items(
  field text,
  value jsonb,
  noun text,
  required_incoming_fields text[],
  optional_incoming_fields text[]
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '[]';
  item jsonb;
  item_field text;
  item_index integer;
  earlier jsonb;
  earlier_index integer;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 10 then
    perform private.invalid_argument(field, format('%s must be a list of 1 to 10 %s.', field, noun));
  end if;

  for item_index in 0 .. jsonb_array_length(value) - 1 loop
    item_field := format('%s[%s]', field, item_index);
    item := private.checked_object(
      item_field,
      value -> item_index,
      array['ref', 'deck_id', 'expected_deck_revision', 'incoming', 'reason'],
      array['outgoing']
    );
    item := jsonb_set(
      item,
      '{incoming}',
      private.checked_object(item_field || '.incoming', item -> 'incoming', required_incoming_fields, optional_incoming_fields)
    );
    for earlier, earlier_index in
      select element, ordinality - 1 from jsonb_array_elements(checked) with ordinality as listed(element, ordinality)
    loop
      if earlier ->> 'ref' = item ->> 'ref' then
        perform private.invalid_argument(
          item_field || '.ref',
          format('%s.ref repeats the ref of %s[%s].', item_field, field, earlier_index)
        );
      end if;
      if earlier ->> 'deck_id' = item ->> 'deck_id' and earlier -> 'expected_deck_revision' <> item -> 'expected_deck_revision' then
        perform private.invalid_argument(
          item_field || '.expected_deck_revision',
          format('%s.expected_deck_revision must match %s[%s], which names the same deck.', item_field, field, earlier_index)
        );
      end if;
    end loop;
    checked := checked || jsonb_build_array(item);
  end loop;
  return checked;
end;
$$;

grant execute on function private.checked_plan_items(text, jsonb, text, text[], text[]) to authenticated;

create or replace function private.checked_planned_swaps(field text, value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := private.checked_plan_items(
    field,
    value,
    'planned swaps',
    '{}',
    array['copy_id', 'basic_land_oracle_id', 'as_commander']
  );
  item_field text;
  incoming jsonb;
  item_index integer;
  earlier_index integer;
begin
  for item_index in 0 .. jsonb_array_length(checked) - 1 loop
    item_field := format('%s[%s]', field, item_index);
    incoming := checked -> item_index -> 'incoming';
    if (incoming ? 'copy_id') = (incoming ? 'basic_land_oracle_id') then
      perform private.invalid_argument(
        item_field || '.incoming',
        format('%s.incoming must have either copy_id or basic_land_oracle_id.', item_field)
      );
    end if;
    if incoming ? 'basic_land_oracle_id' and incoming ? 'as_commander' then
      perform private.invalid_argument(
        item_field || '.incoming.as_commander',
        format('%s.incoming.as_commander must be left out for a basic land. A basic land is never a commander.', item_field)
      );
    end if;
    if incoming ->> 'basic_land_oracle_id' = checked -> item_index -> 'outgoing' ->> 'basic_land_oracle_id' then
      perform private.invalid_argument(
        item_field || '.outgoing.basic_land_oracle_id',
        format('%s.outgoing.basic_land_oracle_id is the incoming basic land.', item_field)
      );
    end if;
  end loop;

  for item_index in 1 .. jsonb_array_length(checked) - 1 loop
    for earlier_index in 0 .. item_index - 1 loop
      if checked -> earlier_index -> 'incoming' ->> 'copy_id' = checked -> item_index -> 'incoming' ->> 'copy_id' then
        perform private.invalid_argument(
          format('%s[%s].incoming.copy_id', field, item_index),
          format(
            '%s[%s].incoming.copy_id repeats the copy of %s[%s]. A copy is held by one planned swap.',
            field,
            item_index,
            field,
            earlier_index
          )
        );
      end if;
    end loop;
  end loop;
  return checked;
end;
$$;

create or replace function private.checked_buylist_cards(field text, value jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.checked_plan_items(field, value, 'buylist cards', array['oracle_id'], array['as_commander']);
$$;

create or replace function private.resolved_outgoing(
  owner_id uuid,
  field text,
  chosen_deck_id uuid,
  outgoing jsonb,
  out outgoing_copy_id uuid,
  out outgoing_oracle_id uuid,
  out outgoing_is_commander boolean
)
language plpgsql
stable
set search_path = ''
as $$
begin
  outgoing_is_commander := false;
  if outgoing is null then
    return;
  end if;
  if outgoing ? 'basic_land_oracle_id' then
    outgoing_oracle_id := (outgoing ->> 'basic_land_oracle_id')::uuid;
    if not private.is_basic_land_card(outgoing_oracle_id) then
      perform private.invalid_argument(
        field || '.outgoing.basic_land_oracle_id',
        format('%s.outgoing.basic_land_oracle_id is not a basic land card.', field)
      );
    end if;
    if not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, null, outgoing_oracle_id) then
      perform private.raise_search_error(
        'outgoing_not_in_deck',
        format('%s.outgoing.basic_land_oracle_id is not in the deck. Read the deck again.', field),
        field || '.outgoing.basic_land_oracle_id'
      );
    end if;
    return;
  end if;

  outgoing_copy_id := (outgoing ->> 'copy_id')::uuid;
  select printing.oracle_id, deck_card.commander_at is not null
    into outgoing_oracle_id, outgoing_is_commander
    from public.copies copy
    join public.card_printings printing on printing.id = copy.card_printing_id
    left join public.deck_cards deck_card
      on deck_card.user_id = copy.user_id and deck_card.copy_id = copy.id and deck_card.deck_id = chosen_deck_id
    where copy.user_id = owner_id and copy.id = resolved_outgoing.outgoing_copy_id;
  if outgoing_oracle_id is null then
    perform private.raise_search_error(
      'not_found',
      format('%s.outgoing.copy_id is not a copy in your collection.', field),
      field || '.outgoing.copy_id'
    );
  end if;
  if not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, outgoing_copy_id, outgoing_oracle_id) then
    perform private.raise_search_error(
      'outgoing_not_in_deck',
      format('%s.outgoing.copy_id is not in the deck. Read the deck again.', field),
      field || '.outgoing.copy_id'
    );
  end if;
end;
$$;

create or replace function private.resolved_planned_swap(owner_id uuid, item_index integer, checked jsonb)
returns private.new_planned_swap
language plpgsql
stable
set search_path = ''
as $$
declare
  field text := format('planned_swaps[%s]', item_index);
  resolved private.new_planned_swap;
  deck public.decks := private.resolved_plan_deck(owner_id, 'planned_swaps', item_index, checked);
  incoming private.collection_availability;
begin
  if checked -> 'incoming' ? 'basic_land_oracle_id' then
    resolved.incoming_oracle_id := (checked -> 'incoming' ->> 'basic_land_oracle_id')::uuid;
    if not private.is_basic_land_card(resolved.incoming_oracle_id) then
      perform private.invalid_argument(
        field || '.incoming.basic_land_oracle_id',
        format('%s.incoming.basic_land_oracle_id is not a basic land card.', field)
      );
    end if;
  else
    select * into incoming
      from private.collection_availability a
      where a.user_id = owner_id and a.copy_id = (checked -> 'incoming' ->> 'copy_id')::uuid;
    if incoming.copy_id is null then
      perform private.raise_search_error(
        'not_found',
        format('%s.incoming.copy_id is not a copy in your collection.', field),
        field || '.incoming.copy_id'
      );
    end if;
    if not incoming.is_free then
      perform private.raise_search_error(
        'copy_not_free',
        format('%s.incoming.copy_id is in a deck or held by another planned swap. Choose a free copy.', field),
        field || '.incoming.copy_id'
      );
    end if;
    if incoming.is_protected then
      perform private.raise_search_error(
        'protected_copy',
        format('%s.incoming.copy_id is a protected copy. Choose another copy, or ask the user to unprotect it.', field),
        field || '.incoming.copy_id'
      );
    end if;
    resolved.incoming_copy_id := incoming.copy_id;
    resolved.incoming_oracle_id := incoming.oracle_id;
  end if;

  resolved.index := item_index;
  resolved.planned_swap_id := gen_random_uuid();
  resolved.ref := checked ->> 'ref';
  resolved.deck_id := deck.id;
  resolved.reason := checked ->> 'reason';
  select outgoing.outgoing_copy_id, outgoing.outgoing_oracle_id, outgoing.outgoing_is_commander
    into resolved.outgoing_copy_id, resolved.outgoing_oracle_id, resolved.outgoing_is_commander
    from private.resolved_outgoing(owner_id, field, deck.id, checked -> 'outgoing') outgoing;
  resolved.as_commander := resolved.incoming_copy_id is not null
    and coalesce((checked -> 'incoming' ->> 'as_commander')::boolean, resolved.outgoing_is_commander);
  return resolved;
end;
$$;

drop function private.planned_swap_effect(uuid, uuid, uuid, boolean, uuid);
drop function private.buylist_card_effect(uuid, uuid, uuid, boolean, uuid);
drop function private.swap_effect(uuid, uuid, jsonb, uuid);

create function private.swap_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  incoming jsonb,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.deck_change_effect(
    evaluation,
    private.judge_deck(jsonb_build_object(
      'copies',
      coalesce((
        select jsonb_agg(deck_copy)
        from jsonb_array_elements(deck.contents -> 'copies') deck_copy
        where (deck_copy ->> 'copy_id')::uuid is distinct from swap_effect.outgoing_copy_id
      ), '[]'::jsonb) || coalesce(incoming -> 'copies', '[]'::jsonb),
      'basic_lands',
      coalesce((
        select jsonb_agg(jsonb_build_object('oracle_id', land.oracle_id, 'count', land.count) order by land.oracle_id)
        from (
          select counted.oracle_id, sum(counted.count) as count
          from (
            select (stored_land ->> 'oracle_id')::uuid as oracle_id, (stored_land ->> 'count')::integer as count
            from jsonb_array_elements((deck.contents -> 'basic_lands') || coalesce(incoming -> 'basic_lands', '[]'::jsonb)) stored_land
            union all
            select swap_effect.outgoing_oracle_id, -1
            where swap_effect.outgoing_copy_id is null and swap_effect.outgoing_oracle_id is not null
          ) counted
          group by counted.oracle_id
          having sum(counted.count) > 0
        ) land
      ), '[]'::jsonb)
    ))
  )
  from (select private.deck_contents(owner_id, chosen_deck_id) as contents) deck
  left join public.deck_evaluations evaluation on evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
$$;

grant execute on function private.swap_effect(uuid, uuid, jsonb, uuid, uuid) to authenticated;

create function private.planned_swap_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  held_copy_id uuid,
  incoming_oracle_id uuid,
  as_commander boolean,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when held_copy_id is null then private.swap_effect(
      owner_id,
      chosen_deck_id,
      jsonb_build_object('basic_lands', jsonb_build_array(jsonb_build_object('oracle_id', incoming_oracle_id, 'count', 1))),
      outgoing_copy_id,
      outgoing_oracle_id
    )
    else (
      select private.swap_effect(
        owner_id,
        chosen_deck_id,
        jsonb_build_object('copies', jsonb_build_array(jsonb_build_object(
          'copy_id', held.id,
          'card_printing_id', held.card_printing_id,
          'role', case when planned_swap_effect.as_commander then 'commander' else 'main' end
        ))),
        outgoing_copy_id,
        outgoing_oracle_id
      )
      from public.copies held
      where held.user_id = owner_id and held.id = held_copy_id
    )
  end;
$$;

grant execute on function private.planned_swap_effect(uuid, uuid, uuid, uuid, boolean, uuid, uuid) to authenticated;

create function private.buylist_card_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  card_oracle_id uuid,
  as_commander boolean,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.swap_effect(
    owner_id,
    chosen_deck_id,
    jsonb_build_object('copies', jsonb_build_array(jsonb_build_object(
      'copy_id', card_oracle_id,
      'card_printing_id', private.default_printing_id(card_oracle_id),
      'role', case when buylist_card_effect.as_commander then 'commander' else 'main' end
    ))),
    outgoing_copy_id,
    outgoing_oracle_id
  );
$$;

grant execute on function private.buylist_card_effect(uuid, uuid, uuid, boolean, uuid, uuid) to authenticated;

create or replace function private.planned_swap_warnings(owner_id uuid, swap private.new_planned_swap)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.plan_warnings(
    owner_id,
    swap.deck_id,
    private.planned_swap_effect(
      owner_id,
      swap.deck_id,
      swap.incoming_copy_id,
      swap.incoming_oracle_id,
      swap.as_commander,
      swap.outgoing_copy_id,
      swap.outgoing_oracle_id
    ),
    swap.outgoing_is_commander
  );
$$;

create or replace function private.buylist_card_warnings(owner_id uuid, card private.new_buylist_card)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  free_count integer;
  other_decks jsonb;
  warnings jsonb := private.plan_warnings(
    owner_id,
    card.deck_id,
    private.buylist_card_effect(
      owner_id,
      card.deck_id,
      card.incoming_oracle_id,
      card.as_commander,
      card.outgoing_copy_id,
      card.outgoing_oracle_id
    ),
    card.outgoing_is_commander
  );
begin
  select count(*) into free_count
    from private.collection_availability a
    where a.user_id = owner_id and a.oracle_id = card.incoming_oracle_id and a.is_free;
  select jsonb_agg(
      jsonb_build_object('deck_id', holding_deck.id, 'name', holding_deck.name, 'priority', holding_deck.priority)
      order by holding_deck.priority, lower(holding_deck.name), holding_deck.id
    )
    into other_decks
    from public.decks holding_deck
    where holding_deck.user_id = owner_id
      and holding_deck.id <> card.deck_id
      and exists (
        select 1
        from public.deck_cards deck_card
        join public.copies copy on copy.user_id = deck_card.user_id and copy.id = deck_card.copy_id
        join public.card_printings printing on printing.id = copy.card_printing_id
        where deck_card.user_id = owner_id and deck_card.deck_id = holding_deck.id and printing.oracle_id = card.incoming_oracle_id
      );

  if free_count > 0 then
    warnings := warnings || jsonb_build_object('code', 'protected_only');
  end if;
  if free_count = 0 and other_decks is not null then
    warnings := warnings || jsonb_build_object('code', 'in_other_decks', 'decks', other_decks);
  end if;
  return warnings;
end;
$$;

create function private.planned_line(owner_id uuid, line_copy_id uuid, line_oracle_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when line_copy_id is null and line_oracle_id is not null then (
      select jsonb_build_object(
        'kind', 'basic_land',
        'oracle_id', land.oracle_id,
        'name', land.name,
        'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb)
      )
      from private.basic_land_cards() land
      where land.oracle_id = line_oracle_id
    )
    else private.planned_copy_line(owner_id, line_copy_id, line_oracle_id)
  end;
$$;

grant execute on function private.planned_line(uuid, uuid, uuid) to authenticated;

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
      'client_name', swap.client_name,
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
      'client_name', card.client_name,
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

drop function private.swap_into_deck(uuid, uuid, public.copies, boolean, uuid, public.deck_change_kind, text, text, text);

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
  change_client_name text,
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
  if incoming_as_commander and (
    select count(*)
    from public.deck_cards card
    where card.user_id = owner_id and card.deck_id = chosen_deck_id and card.commander_at is not null
  ) >= 2 then
    perform private.raise_search_error('commander_limit', 'A deck has at most two commanders.', field);
  end if;
  if incoming.id is not null then
    insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
      values (owner_id, chosen_deck_id, incoming.id, case when incoming_as_commander then now() end);
  end if;

  change_id := private.record_deck_change(owner_id, chosen_deck_id, change_kind);
  update public.deck_changes change
    set reason = change_reason, client_name = change_client_name
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

create or replace function public.swap_in_planned_swap(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  swap public.planned_swaps;
  held_copy public.copies;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['planned_swap_id']);
  swap := private.locked_planned_swap(caller, (checked ->> 'planned_swap_id')::uuid, array['open']::public.planned_swap_status[]);
  select * into held_copy from public.copies copy where copy.user_id = caller and copy.id = swap.incoming_copy_id for update;

  perform private.swap_into_deck(
    caller,
    swap.deck_id,
    held_copy,
    swap.incoming_oracle_id,
    swap.as_commander,
    swap.outgoing_copy_id,
    swap.outgoing_oracle_id,
    'swapped_in',
    swap.reason,
    swap.client_name,
    'planned_swap_id'
  );
  update public.planned_swaps planned
    set status = 'swapped_in', status_changed_at = now()
    where planned.user_id = caller and planned.id = swap.id;
  perform private.finish_deck_change(caller, swap.deck_id);

  return jsonb_build_object(
    'deck_id', swap.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = swap.deck_id)
  );
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
  availability private.collection_availability;
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

  select * into availability from private.collection_availability a where a.user_id = caller and a.copy_id = chosen_copy.id;
  if availability.oracle_id <> card.incoming_oracle_id then
    perform private.invalid_argument('copy_id', 'copy_id is not a copy of the card on the buylist card.');
  end if;
  if not availability.is_free then
    perform private.raise_search_error('copy_not_free', 'Only a free copy can go into a deck.', 'copy_id');
  end if;
  if chosen_copy.is_protected then
    if not (checked ->> 'unprotect')::boolean then
      perform private.raise_search_error(
        'copy_protected',
        'copy_id is a protected copy. Send unprotect: true to unprotect it and mark the buylist card bought.',
        'copy_id'
      );
    end if;
    update public.copies copy set is_protected = false where copy.user_id = caller and copy.id = chosen_copy.id;
  end if;

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
    card.client_name,
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
