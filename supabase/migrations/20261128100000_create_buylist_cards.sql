create type public.buylist_card_status as enum ('open', 'bought', 'closed');

create table public.buylist_cards (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  deck_id uuid not null,
  incoming_oracle_id uuid not null references public.cards (oracle_id),
  as_commander boolean not null,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid references public.cards (oracle_id),
  reason text not null check (char_length(reason) between 20 and 600),
  status public.buylist_card_status not null default 'open',
  close_note public.close_note,
  client_id uuid not null,
  client_name text,
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  primary key (user_id, id),
  check (outgoing_copy_id is null or outgoing_oracle_id is not null),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);

create index buylist_cards_by_deck on public.buylist_cards (user_id, deck_id, status);
create index buylist_cards_by_creation on public.buylist_cards (user_id, created_at);

alter table public.buylist_cards enable row level security;

revoke all on table public.buylist_cards from anon, authenticated;
grant select on table public.buylist_cards to authenticated;

create policy "Users read their own buylist cards"
  on public.buylist_cards
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

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
      when 'order' then private.checked_choice(field, member, array['newest_first', 'oldest_first'])
      when 'status' then member
      when 'limit' then private.checked_integer(field, member, 1, 50)
      when 'cursor' then private.checked_cursor(field, member)
      when 'counts' then private.checked_basic_land_counts(field, member)
      when 'expected_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'expected_deck_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'idempotency_key' then private.checked_key(field, member, 8)
      when 'ref' then private.checked_key(field, member, 1)
      when 'reason' then private.checked_reason(field, member)
      when 'planned_swaps' then private.checked_planned_swaps(field, member)
      when 'buylist_cards' then private.checked_buylist_cards(field, member)
      when 'incoming' then member
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

create function private.checked_plan_items(field text, value jsonb, noun text, incoming_fields text[])
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
      private.checked_object(item_field || '.incoming', item -> 'incoming', incoming_fields, array['as_commander'])
    );
    if item -> 'outgoing' ? 'basic_land_oracle_id' then
      perform private.invalid_argument(
        item_field || '.outgoing.basic_land_oracle_id',
        format('%s.outgoing.basic_land_oracle_id is not a known field.', item_field)
      );
    end if;
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

grant execute on function private.checked_plan_items(text, jsonb, text, text[]) to authenticated;

create or replace function private.checked_planned_swaps(field text, value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := private.checked_plan_items(field, value, 'planned swaps', array['copy_id']);
  item_index integer;
  earlier_index integer;
begin
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

create function private.checked_buylist_cards(field text, value jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.checked_plan_items(field, value, 'buylist cards', array['oracle_id']);
$$;

grant execute on function private.checked_buylist_cards(text, jsonb) to authenticated;

create function private.resolved_plan_deck(owner_id uuid, list_field text, item_index integer, checked jsonb)
returns public.decks
language plpgsql
stable
set search_path = ''
as $$
declare
  field text := format('%s[%s]', list_field, item_index);
  deck public.decks;
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
        'pointer', format('/%s/%s/expected_deck_revision', list_field, item_index),
        'expected', (checked ->> 'expected_deck_revision')::integer,
        'current', deck.revision
      )::text
    );
  end if;
  return deck;
end;
$$;

create function private.resolved_outgoing(
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

  resolved.index := item_index;
  resolved.planned_swap_id := gen_random_uuid();
  resolved.ref := checked ->> 'ref';
  resolved.deck_id := deck.id;
  resolved.incoming_copy_id := incoming.copy_id;
  resolved.incoming_oracle_id := incoming.oracle_id;
  resolved.reason := checked ->> 'reason';
  select outgoing.outgoing_copy_id, outgoing.outgoing_oracle_id, outgoing.outgoing_is_commander
    into resolved.outgoing_copy_id, resolved.outgoing_oracle_id, resolved.outgoing_is_commander
    from private.resolved_outgoing(owner_id, field, deck.id, checked -> 'outgoing') outgoing;
  resolved.as_commander := coalesce((checked -> 'incoming' ->> 'as_commander')::boolean, resolved.outgoing_is_commander);
  return resolved;
end;
$$;

create type private.new_buylist_card as (
  index integer,
  buylist_card_id uuid,
  ref text,
  deck_id uuid,
  incoming_oracle_id uuid,
  as_commander boolean,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid,
  outgoing_is_commander boolean,
  reason text
);

create function private.resolved_buylist_card(owner_id uuid, item_index integer, checked jsonb)
returns private.new_buylist_card
language plpgsql
stable
set search_path = ''
as $$
declare
  field text := format('buylist_cards[%s]', item_index);
  resolved private.new_buylist_card;
  deck public.decks := private.resolved_plan_deck(owner_id, 'buylist_cards', item_index, checked);
  free_copy_ids jsonb;
begin
  resolved.incoming_oracle_id := (checked -> 'incoming' ->> 'oracle_id')::uuid;
  if not exists (select 1 from public.cards card where card.oracle_id = resolved.incoming_oracle_id) then
    perform private.raise_search_error(
      'invalid_card',
      format('%s.incoming.oracle_id is not a card in the card catalog.', field),
      field || '.incoming.oracle_id'
    );
  end if;
  if private.is_basic_land_card(resolved.incoming_oracle_id) then
    perform private.raise_search_error(
      'invalid_card',
      format('%s.incoming.oracle_id is a basic land card. Basic lands are never bought.', field),
      field || '.incoming.oracle_id'
    );
  end if;
  select jsonb_agg(a.copy_id order by a.copy_id)
    into free_copy_ids
    from private.collection_availability a
    where a.user_id = owner_id and a.oracle_id = resolved.incoming_oracle_id and a.is_free and not a.is_protected;
  if free_copy_ids is not null then
    perform private.raise_search_error(
      'free_copy_exists',
      format('%s.incoming.oracle_id has a free copy that is not protected. Make a planned swap with it instead.', field),
      jsonb_build_object('pointer', format('/buylist_cards/%s/incoming/oracle_id', item_index), 'copy_ids', free_copy_ids)::text
    );
  end if;

  resolved.index := item_index;
  resolved.buylist_card_id := gen_random_uuid();
  resolved.ref := checked ->> 'ref';
  resolved.deck_id := deck.id;
  resolved.reason := checked ->> 'reason';
  select outgoing.outgoing_copy_id, outgoing.outgoing_oracle_id, outgoing.outgoing_is_commander
    into resolved.outgoing_copy_id, resolved.outgoing_oracle_id, resolved.outgoing_is_commander
    from private.resolved_outgoing(owner_id, field, deck.id, checked -> 'outgoing') outgoing;
  resolved.as_commander := coalesce((checked -> 'incoming' ->> 'as_commander')::boolean, resolved.outgoing_is_commander);
  return resolved;
end;
$$;

create function private.open_plan_like(owner_id uuid, plan jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object('planned_swap_id', saved.id)
      from public.planned_swaps saved
      where saved.user_id = owner_id
        and saved.deck_id = (plan ->> 'deck_id')::uuid
        and saved.status = 'open'
        and private.planned_swap_identity(to_jsonb(saved)) = private.planned_swap_identity(plan)
      limit 1
    ),
    (
      select jsonb_build_object('buylist_card_id', saved.id)
      from public.buylist_cards saved
      where saved.user_id = owner_id
        and saved.deck_id = (plan ->> 'deck_id')::uuid
        and saved.status = 'open'
        and private.planned_swap_identity(to_jsonb(saved)) = private.planned_swap_identity(plan)
      limit 1
    )
  );
$$;

create function private.check_duplicate_plans(owner_id uuid, list_field text, plans jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  plan jsonb;
  earlier_index integer;
  open_plan jsonb;
begin
  for plan in select element from jsonb_array_elements(plans) element loop
    select (earlier ->> 'index')::integer into earlier_index
      from jsonb_array_elements(plans) earlier
      where (earlier ->> 'index')::integer < (plan ->> 'index')::integer
        and private.planned_swap_identity(earlier) = private.planned_swap_identity(plan)
      limit 1;
    if earlier_index is not null then
      perform private.invalid_argument(
        format('%s[%s]', list_field, plan ->> 'index'),
        format('%s[%s] repeats %s[%s] in this call.', list_field, plan ->> 'index', list_field, earlier_index)
      );
    end if;
    open_plan := private.open_plan_like(owner_id, plan);
    if open_plan is not null then
      perform private.raise_search_error(
        'duplicate_open',
        format(
          '%s[%s] is the same as an open %s in the deck.',
          list_field,
          plan ->> 'index',
          case when open_plan ? 'planned_swap_id' then 'planned swap' else 'buylist card' end
        ),
        (jsonb_build_object('pointer', format('/%s/%s', list_field, plan ->> 'index')) || open_plan)::text
      );
    end if;
  end loop;
end;
$$;

drop function private.check_duplicate_planned_swaps(uuid, private.new_planned_swap[]);

create function private.swap_effect(owner_id uuid, chosen_deck_id uuid, incoming jsonb, outgoing_copy_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.deck_change_effect(
    evaluation,
    private.judge_deck(jsonb_set(
      deck.contents,
      '{copies}',
      coalesce((
        select jsonb_agg(deck_copy)
        from jsonb_array_elements(deck.contents -> 'copies') deck_copy
        where (deck_copy ->> 'copy_id')::uuid is distinct from swap_effect.outgoing_copy_id
      ), '[]'::jsonb) || jsonb_build_array(incoming)
    ))
  )
  from (select private.deck_contents(owner_id, chosen_deck_id) as contents) deck
  left join public.deck_evaluations evaluation on evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
$$;

grant execute on function private.swap_effect(uuid, uuid, jsonb, uuid) to authenticated;

create or replace function private.planned_swap_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  held_copy_id uuid,
  as_commander boolean,
  outgoing_copy_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.swap_effect(
    owner_id,
    chosen_deck_id,
    jsonb_build_object(
      'copy_id', held.id,
      'card_printing_id', held.card_printing_id,
      'role', case when planned_swap_effect.as_commander then 'commander' else 'main' end
    ),
    outgoing_copy_id
  )
  from public.copies held
  where held.user_id = owner_id and held.id = held_copy_id;
$$;

create function private.default_printing_id(card_oracle_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select printing.id
  from public.card_printings printing
  where printing.oracle_id = card_oracle_id
  order by
    printing.absent_since is not null,
    cardinality(printing.image_uris) > 0 desc,
    printing.lang = 'en' desc,
    'nonfoil' = any(printing.finishes) desc,
    printing.released_at desc,
    printing.set_code,
    printing.collector_number,
    printing.lang
  limit 1;
$$;

grant execute on function private.default_printing_id(uuid) to authenticated;

create or replace function private.basic_land_cards()
returns table (kind_order integer, name text, oracle_id uuid, image_uris text[])
language sql
stable
set search_path = ''
as $$
  select kind.kind_order, kind.name, land.oracle_id, land.image_uris
  from private.basic_land_kinds() kind
  left join lateral (
    select card.oracle_id, printing.image_uris
    from public.cards card
    join public.card_printings printing on printing.id = private.default_printing_id(card.oracle_id)
    where card.name_key = private.name_key(kind.name) collate "C"
      and card.name = kind.name
      and card.absent_since is null
      and printing.absent_since is null
    limit 1
  ) land on true;
$$;

create function private.buylist_card_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  card_oracle_id uuid,
  as_commander boolean,
  outgoing_copy_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.swap_effect(
    owner_id,
    chosen_deck_id,
    jsonb_build_object(
      'copy_id', card_oracle_id,
      'card_printing_id', private.default_printing_id(card_oracle_id),
      'role', case when buylist_card_effect.as_commander then 'commander' else 'main' end
    ),
    outgoing_copy_id
  );
$$;

grant execute on function private.buylist_card_effect(uuid, uuid, uuid, boolean, uuid) to authenticated;

create function private.plan_warnings(owner_id uuid, chosen_deck_id uuid, effect jsonb, outgoing_is_commander boolean)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  evaluation public.deck_evaluations;
  warnings jsonb := '[]';
begin
  select * into evaluation
    from public.deck_evaluations stored
    where stored.user_id = owner_id and stored.deck_id = chosen_deck_id;

  if effect is not null then
    warnings := warnings || jsonb_build_object('code', 'would_break_validity', 'effect', effect);
  end if;
  if outgoing_is_commander then
    warnings := warnings || jsonb_build_object('code', 'replaces_commander');
  end if;
  if (private.deck_evaluation_staleness(evaluation) ->> 'bracket_stale')::boolean then
    warnings := warnings || jsonb_build_object('code', 'rules_stale');
  end if;
  return warnings;
end;
$$;

create or replace function private.planned_swap_warnings(owner_id uuid, swap private.new_planned_swap)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.plan_warnings(
    owner_id,
    swap.deck_id,
    private.planned_swap_effect(owner_id, swap.deck_id, swap.incoming_copy_id, swap.as_commander, swap.outgoing_copy_id),
    swap.outgoing_is_commander
  );
$$;

create function private.buylist_card_warnings(owner_id uuid, card private.new_buylist_card)
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
    private.buylist_card_effect(owner_id, card.deck_id, card.incoming_oracle_id, card.as_commander, card.outgoing_copy_id),
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

create or replace function public.create_planned_swaps(request jsonb)
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
  replayed jsonb;
  swaps private.new_planned_swap[] := '{}';
  item_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  select client.client_id, client.client_name into ai_client_id, ai_client_name from private.caller_ai_client() client;
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
    client_id, client_name
  )
  select
    swap.planned_swap_id, caller, swap.deck_id, swap.incoming_copy_id, swap.incoming_oracle_id, swap.as_commander,
    swap.outgoing_copy_id, swap.outgoing_oracle_id, swap.reason, ai_client_id, ai_client_name
  from unnest(swaps) swap;

  return private.save_ai_write(caller, request, result);
end;
$$;

create function public.create_buylist_cards(request jsonb)
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
  replayed jsonb;
  cards private.new_buylist_card[] := '{}';
  item_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  select client.client_id, client.client_name into ai_client_id, ai_client_name from private.caller_ai_client() client;
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
    id, user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason, client_id, client_name
  )
  select
    card.buylist_card_id, caller, card.deck_id, card.incoming_oracle_id, card.as_commander, card.outgoing_copy_id,
    card.outgoing_oracle_id, card.reason, ai_client_id, ai_client_name
  from unnest(cards) card;

  return private.save_ai_write(caller, request, result);
end;
$$;

revoke all on function public.create_buylist_cards(jsonb) from public, anon, service_role;
grant execute on function public.create_buylist_cards(jsonb) to authenticated;
