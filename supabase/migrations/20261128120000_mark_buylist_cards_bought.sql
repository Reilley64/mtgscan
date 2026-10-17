create or replace function private.finish_deck_change(owner_id uuid, chosen_deck_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.planned_swaps swap
    set status = 'closed', close_note = 'outgoing_left_deck', status_changed_at = now()
    where swap.user_id = owner_id
      and swap.deck_id = chosen_deck_id
      and swap.status = 'open'
      and not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, swap.outgoing_copy_id, swap.outgoing_oracle_id);
  update public.buylist_cards card
    set status = 'closed', close_note = 'outgoing_left_deck', status_changed_at = now()
    where card.user_id = owner_id
      and card.deck_id = chosen_deck_id
      and card.status = 'open'
      and not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, card.outgoing_copy_id, card.outgoing_oracle_id);
  perform private.save_deck_evaluation(owner_id, chosen_deck_id);
end;
$$;

create function private.swap_into_deck(
  owner_id uuid,
  chosen_deck_id uuid,
  incoming public.copies,
  incoming_as_commander boolean,
  outgoing_copy_id uuid,
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
  insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
    values (owner_id, chosen_deck_id, incoming.id, case when incoming_as_commander then now() end);

  change_id := private.record_deck_change(owner_id, chosen_deck_id, change_kind);
  update public.deck_changes change
    set reason = change_reason, client_name = change_client_name
    where change.user_id = owner_id and change.id = change_id;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (
      owner_id,
      change_id,
      incoming.id,
      incoming.card_printing_id,
      incoming.finish,
      null,
      case when incoming_as_commander then 'commander' else 'main' end::public.deck_role
    );
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select owner_id, change_id, copy.id, copy.card_printing_id, copy.finish, private.deck_role(outgoing_card.commander_at), null
    from public.copies copy
    where copy.user_id = owner_id and copy.id = outgoing_card.copy_id;
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
    caller, swap.deck_id, held_copy, swap.as_commander, swap.outgoing_copy_id, 'swapped_in', swap.reason, swap.client_name,
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

create function private.locked_buylist_card(
  owner_id uuid,
  chosen_buylist_card_id uuid,
  changeable_statuses public.buylist_card_status[]
)
returns public.buylist_cards
language plpgsql
set search_path = ''
as $$
declare
  card public.buylist_cards;
begin
  select * into card from public.buylist_cards found where found.user_id = owner_id and found.id = chosen_buylist_card_id;
  if card.id is null then
    perform private.raise_search_error('not_found', 'buylist_card_id is not one of your buylist cards.', 'buylist_card_id');
  end if;
  perform private.lock_deck(owner_id, card.deck_id);
  select * into card from public.buylist_cards found where found.user_id = owner_id and found.id = chosen_buylist_card_id for update;
  if not card.status = any(changeable_statuses) then
    perform private.raise_search_error(
      'not_open',
      format('The buylist card is %s. Only an open buylist card can change.', card.status),
      'buylist_card_id'
    );
  end if;
  return card;
end;
$$;

create function public.mark_buylist_card_bought(request jsonb)
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
    caller, card.deck_id, chosen_copy, card.as_commander, card.outgoing_copy_id, 'bought', card.reason, card.client_name,
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

create function private.closed_buylist_card(owner_id uuid, request jsonb, note public.close_note)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  checked jsonb;
  card public.buylist_cards;
begin
  checked := private.check_request(request, array['buylist_card_id']);
  card := private.locked_buylist_card(
    owner_id,
    (checked ->> 'buylist_card_id')::uuid,
    array['open', 'closed']::public.buylist_card_status[]
  );
  if card.status = 'open' then
    update public.buylist_cards closed
      set status = 'closed', close_note = note, status_changed_at = now()
      where closed.user_id = owner_id and closed.id = card.id;
  end if;
  return jsonb_build_object('id', card.id, 'changed', card.status = 'open');
end;
$$;

create function public.close_buylist_card(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  return private.closed_buylist_card(caller, request, 'closed_by_user');
end;
$$;

create function public.mcp_close_buylist_card(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  return private.closed_buylist_card(caller, request, 'closed_by_ai_client');
end;
$$;

revoke all on function
  public.mark_buylist_card_bought(jsonb),
  public.close_buylist_card(jsonb),
  public.mcp_close_buylist_card(jsonb)
  from public, anon, service_role;
grant execute on function
  public.mark_buylist_card_bought(jsonb),
  public.close_buylist_card(jsonb),
  public.mcp_close_buylist_card(jsonb)
  to authenticated;

create function public.list_free_copies(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  prices_stale boolean;
begin
  perform private.caller_user_id();
  checked := private.checked_object(null, query, array['oracle_id'], '{}');
  select f.is_stale into prices_stale from public.catalog_freshness() f where f.source = 'prices';

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      private.copy_row(a, p, c, price, prices_stale)
      order by p.released_at desc, p.set_code, p.collector_number, a.finish, a.condition, a.copy_id
    )
    from private.collection_availability a
    join public.card_printings p on p.id = a.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
    left join public.card_prices price on price.printing_id = p.id
    where a.oracle_id = (checked ->> 'oracle_id')::uuid and a.is_free
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.list_free_copies(jsonb) from public, anon, service_role;
grant execute on function public.list_free_copies(jsonb) to authenticated;
