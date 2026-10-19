create function private.record_who_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changer uuid := coalesce((auth.jwt() ->> 'client_id')::uuid, auth.uid(), new.user_id);
begin
  if tg_op = 'INSERT' then
    new.created_by := changer;
  else
    new.created_by := old.created_by;
  end if;
  new.updated_by := changer;
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  covered record;
begin
  for covered in
    select *
    from (
      values
        ('copies', null, 'user_id'),
        ('collection_additions', 'added_at', 'user_id'),
        ('decks', 'created_at', 'user_id'),
        ('deck_cards', 'added_at', 'user_id'),
        ('deck_basic_lands', null, 'user_id'),
        ('deck_changes', 'changed_at', 'user_id'),
        ('user_tags', 'created_at', 'user_id'),
        ('copy_user_tags', null, 'user_id'),
        ('planned_swaps', 'created_at', 'client_id'),
        ('buylist_cards', 'created_at', 'client_id')
    ) covered_table (table_name, time_column, changer_column)
  loop
    if covered.time_column is distinct from 'created_at' then
      execute format('alter table public.%I add column created_at timestamptz not null default now()', covered.table_name);
    end if;
    execute format(
      'alter table public.%I add column updated_at timestamptz, add column created_by uuid, add column updated_by uuid',
      covered.table_name
    );
    execute format(
      'update public.%I set created_at = %s, updated_at = %s, created_by = %I, updated_by = %I',
      covered.table_name,
      coalesce(quote_ident(covered.time_column), 'created_at'),
      coalesce(quote_ident(covered.time_column), 'created_at'),
      covered.changer_column,
      covered.changer_column
    );
    execute format(
      'alter table public.%I '
        'alter column updated_at set not null, alter column updated_at set default now(), '
        'alter column created_by set not null, alter column created_by set default auth.uid(), '
        'alter column updated_by set not null, alter column updated_by set default auth.uid()',
      covered.table_name
    );
    execute format(
      'create trigger record_who_changed before insert or update on public.%I for each row execute function private.record_who_changed()',
      covered.table_name
    );
  end loop;
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
  checked jsonb;
  replayed jsonb;
  swaps private.new_planned_swap[] := '{}';
  item_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
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
    id, user_id, deck_id, incoming_copy_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason
  )
  select
    swap.planned_swap_id, caller, swap.deck_id, swap.incoming_copy_id, swap.incoming_oracle_id, swap.as_commander,
    swap.outgoing_copy_id, swap.outgoing_oracle_id, swap.reason
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
  checked jsonb;
  replayed jsonb;
  cards private.new_buylist_card[] := '{}';
  item_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
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
    id, user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason
  )
  select
    card.buylist_card_id, caller, card.deck_id, card.incoming_oracle_id, card.as_commander, card.outgoing_copy_id,
    card.outgoing_oracle_id, card.reason
  from unnest(cards) card;

  return private.save_ai_write(caller, request, result);
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
    user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason, created_at
  )
  select
    moved.user_id,
    moved.deck_id,
    moved.incoming_oracle_id,
    moved.as_commander,
    moved.outgoing_copy_id,
    moved.outgoing_oracle_id,
    moved.reason,
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

alter table public.planned_swaps drop column client_id;
alter table public.buylist_cards drop column client_id;
