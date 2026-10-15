create function private.lock_deck_card(caller uuid, chosen_copy_id uuid)
returns public.deck_cards
language plpgsql
set search_path = ''
as $$
declare
  chosen_deck_id uuid;
  found_card public.deck_cards;
begin
  perform 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;

  select card.deck_id into chosen_deck_id
    from public.deck_cards card
    where card.user_id = caller and card.copy_id = chosen_copy_id;
  if chosen_deck_id is not null then
    perform private.lock_deck(caller, chosen_deck_id);
    select * into found_card
      from public.deck_cards card
      where card.user_id = caller and card.copy_id = chosen_copy_id and card.deck_id = chosen_deck_id;
  end if;
  if found_card.copy_id is null then
    perform private.raise_search_error('copy_not_in_deck', 'copy_id is not in a deck.', 'copy_id');
  end if;
  return found_card;
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
  end if;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

create function public.remove_deck_card(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  removed public.deck_cards;
  chosen_copy public.copies;
  change_id uuid;
begin
  caller := private.caller_user_id();
  checked := private.check_request(request, array['copy_id']);

  removed := private.lock_deck_card(caller, (checked ->> 'copy_id')::uuid);
  delete from public.deck_cards card where card.user_id = caller and card.copy_id = removed.copy_id;
  select * into chosen_copy from public.copies copy where copy.user_id = caller and copy.id = removed.copy_id;

  change_id := private.record_deck_change(caller, removed.deck_id, 'removed');
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (
      caller,
      change_id,
      chosen_copy.id,
      chosen_copy.card_printing_id,
      chosen_copy.finish,
      private.deck_role(removed.commander_at),
      null
    );

  return jsonb_build_object(
    'deck_id', removed.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = removed.deck_id)
  );
end;
$$;

revoke all on function public.remove_deck_card(jsonb) from public, anon, service_role;
grant execute on function public.remove_deck_card(jsonb) to authenticated;
