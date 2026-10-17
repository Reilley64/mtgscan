create type public.planned_swap_status as enum ('open', 'swapped_in', 'closed', 'moved_to_buylist');

create type public.close_note as enum (
  'closed_by_user',
  'closed_by_ai_client',
  'outgoing_left_deck',
  'held_copy_deleted',
  'held_copy_reverted'
);

create table public.planned_swaps (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  deck_id uuid not null,
  incoming_copy_id uuid,
  incoming_oracle_id uuid not null references public.cards (oracle_id),
  as_commander boolean not null,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid references public.cards (oracle_id),
  reason text not null check (char_length(reason) between 20 and 600),
  status public.planned_swap_status not null default 'open',
  close_note public.close_note,
  client_id uuid not null,
  client_name text,
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  primary key (user_id, id),
  check (outgoing_copy_id is null or outgoing_oracle_id is not null),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);

create unique index planned_swaps_hold_one_copy on public.planned_swaps (user_id, incoming_copy_id) where status = 'open';
create index planned_swaps_by_deck on public.planned_swaps (user_id, deck_id, status);
create index planned_swaps_by_creation on public.planned_swaps (user_id, created_at);

alter table public.planned_swaps enable row level security;

revoke all on table public.planned_swaps from anon, authenticated;
grant select on table public.planned_swaps to authenticated;

create policy "Users read their own planned swaps"
  on public.planned_swaps
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace view private.collection_availability with (security_invoker = true) as
select
  copy.id as copy_id,
  copy.user_id,
  copy.card_printing_id,
  printing.oracle_id,
  copy.finish,
  copy.condition,
  copy.language,
  copy.is_protected,
  deck_use.is_allocated,
  deck_use.is_held,
  not (deck_use.is_allocated or deck_use.is_held) as is_free
from public.copies copy
join public.card_printings printing on printing.id = copy.card_printing_id
cross join lateral (
  select
    exists (
      select 1 from public.deck_cards deck_card where deck_card.user_id = copy.user_id and deck_card.copy_id = copy.id
    ) as is_allocated,
    exists (
      select 1
      from public.planned_swaps swap
      where swap.user_id = copy.user_id and swap.incoming_copy_id = copy.id and swap.status = 'open'
    ) as is_held
) deck_use;

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

create function private.checked_planned_swaps(field text, value jsonb)
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
    perform private.invalid_argument(field, format('%s must be a list of 1 to 10 planned swaps.', field));
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
      private.checked_object(item_field || '.incoming', item -> 'incoming', array['copy_id'], array['as_commander'])
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
      if earlier -> 'incoming' ->> 'copy_id' = item -> 'incoming' ->> 'copy_id' then
        perform private.invalid_argument(
          item_field || '.incoming.copy_id',
          format('%s.incoming.copy_id repeats the copy of %s[%s]. A copy is held by one planned swap.', item_field, field, earlier_index)
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

grant execute on function private.checked_planned_swaps(text, jsonb) to authenticated;

create type private.new_planned_swap as (
  index integer,
  planned_swap_id uuid,
  ref text,
  deck_id uuid,
  incoming_copy_id uuid,
  incoming_oracle_id uuid,
  as_commander boolean,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid,
  outgoing_is_commander boolean,
  reason text
);

create function private.resolved_planned_swap(owner_id uuid, item_index integer, checked jsonb)
returns private.new_planned_swap
language plpgsql
stable
set search_path = ''
as $$
declare
  field text := format('planned_swaps[%s]', item_index);
  resolved private.new_planned_swap;
  deck public.decks;
  incoming private.collection_availability;
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
        'pointer', format('/planned_swaps/%s/expected_deck_revision', item_index),
        'expected', (checked ->> 'expected_deck_revision')::integer,
        'current', deck.revision
      )::text
    );
  end if;

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
  resolved.outgoing_is_commander := false;

  if checked ? 'outgoing' then
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
        format('%s.outgoing.copy_id is not a copy in your collection.', field),
        field || '.outgoing.copy_id'
      );
    end if;
    if not private.outgoing_card_is_in_deck(owner_id, deck.id, resolved.outgoing_copy_id, resolved.outgoing_oracle_id) then
      perform private.raise_search_error(
        'outgoing_not_in_deck',
        format('%s.outgoing.copy_id is not in the deck. Read the deck again.', field),
        field || '.outgoing.copy_id'
      );
    end if;
  end if;
  resolved.as_commander := coalesce((checked -> 'incoming' ->> 'as_commander')::boolean, resolved.outgoing_is_commander);
  return resolved;
end;
$$;

create function private.planned_swap_identity(swap jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'deck_id', swap -> 'deck_id',
    'incoming_oracle_id', swap -> 'incoming_oracle_id',
    'as_commander', swap -> 'as_commander',
    'outgoing_copy_id', swap -> 'outgoing_copy_id',
    'outgoing_oracle_id', swap -> 'outgoing_oracle_id'
  );
$$;

create function private.check_duplicate_planned_swaps(owner_id uuid, swaps private.new_planned_swap[])
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  swap private.new_planned_swap;
  open_planned_swap_id uuid;
begin
  foreach swap in array swaps loop
    if exists (
      select 1
      from unnest(swaps) earlier
      where earlier.index < swap.index
        and private.planned_swap_identity(to_jsonb(earlier)) = private.planned_swap_identity(to_jsonb(swap))
    ) then
      perform private.invalid_argument(
        format('planned_swaps[%s]', swap.index),
        format('planned_swaps[%s] repeats another planned swap in this call.', swap.index)
      );
    end if;
    select saved.id into open_planned_swap_id
      from public.planned_swaps saved
      where saved.user_id = owner_id
        and saved.deck_id = swap.deck_id
        and saved.status = 'open'
        and private.planned_swap_identity(to_jsonb(saved)) = private.planned_swap_identity(to_jsonb(swap))
      limit 1;
    if open_planned_swap_id is not null then
      perform private.raise_search_error(
        'duplicate_open',
        format('planned_swaps[%s] is the same as an open planned swap in the deck.', swap.index),
        jsonb_build_object('pointer', format('/planned_swaps/%s', swap.index), 'planned_swap_id', open_planned_swap_id)::text
      );
    end if;
  end loop;
end;
$$;

create function private.planned_swap_effect(
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
  select private.deck_change_effect(
    evaluation,
    private.judge_deck(jsonb_set(
      deck.contents,
      '{copies}',
      coalesce((
        select jsonb_agg(deck_copy)
        from jsonb_array_elements(deck.contents -> 'copies') deck_copy
        where (deck_copy ->> 'copy_id')::uuid is distinct from planned_swap_effect.outgoing_copy_id
      ), '[]'::jsonb) || coalesce((
        select jsonb_agg(jsonb_build_object(
          'copy_id', held.id,
          'card_printing_id', held.card_printing_id,
          'role', case when planned_swap_effect.as_commander then 'commander' else 'main' end
        ))
        from public.copies held
        where held.user_id = owner_id and held.id = held_copy_id
      ), '[]'::jsonb)
    ))
  )
  from (select private.deck_contents(owner_id, chosen_deck_id) as contents) deck
  left join public.deck_evaluations evaluation on evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
$$;

grant execute on function private.planned_swap_effect(uuid, uuid, uuid, boolean, uuid) to authenticated;

create function private.planned_swap_warnings(owner_id uuid, swap private.new_planned_swap)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  evaluation public.deck_evaluations;
  effect jsonb;
  warnings jsonb := '[]';
begin
  select * into evaluation
    from public.deck_evaluations stored
    where stored.user_id = owner_id and stored.deck_id = swap.deck_id;

  effect := private.planned_swap_effect(owner_id, swap.deck_id, swap.incoming_copy_id, swap.as_commander, swap.outgoing_copy_id);
  if effect is not null then
    warnings := warnings || jsonb_build_object('code', 'would_break_validity', 'effect', effect);
  end if;
  if swap.outgoing_is_commander then
    warnings := warnings || jsonb_build_object('code', 'replaces_commander');
  end if;
  if (private.deck_evaluation_staleness(evaluation) ->> 'bracket_stale')::boolean then
    warnings := warnings || jsonb_build_object('code', 'rules_stale');
  end if;
  return warnings;
end;
$$;

create function public.create_planned_swaps(request jsonb)
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
  perform private.check_duplicate_planned_swaps(caller, swaps);

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

revoke all on function public.create_planned_swaps(jsonb) from public, anon, service_role;
grant execute on function public.create_planned_swaps(jsonb) to authenticated;
