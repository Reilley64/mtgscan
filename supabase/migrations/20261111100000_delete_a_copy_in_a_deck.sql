create function private.lock_deck_of_copy(caller uuid, chosen_copy_id uuid)
returns public.deck_cards
language plpgsql
set search_path = ''
as $$
declare
  locked_deck_id uuid;
  found_card public.deck_cards;
begin
  loop
    select card.deck_id into locked_deck_id
      from public.deck_cards card
      where card.user_id = caller and card.copy_id = chosen_copy_id;
    perform 1 from public.decks deck where deck.user_id = caller and deck.id = locked_deck_id for update;
    perform 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id for update;
    select * into found_card
      from public.deck_cards card
      where card.user_id = caller and card.copy_id = chosen_copy_id;
    exit when found_card.deck_id is not distinct from locked_deck_id;
  end loop;
  return found_card;
end;
$$;

create or replace function private.lock_deck_card(caller uuid, chosen_copy_id uuid)
returns public.deck_cards
language plpgsql
set search_path = ''
as $$
declare
  found_card public.deck_cards;
begin
  perform 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;

  found_card := private.lock_deck_of_copy(caller, chosen_copy_id);
  if found_card.copy_id is null then
    perform private.raise_search_error('copy_not_in_deck', 'copy_id is not in a deck.', 'copy_id');
  end if;
  return found_card;
end;
$$;

create function private.remove_from_deck(caller uuid, deck_card public.deck_cards, change_kind public.deck_change_kind)
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
end;
$$;

create or replace function public.remove_deck_card(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  removed public.deck_cards;
begin
  caller := private.caller_user_id();
  checked := private.check_request(request, array['copy_id']);

  removed := private.lock_deck_card(caller, (checked ->> 'copy_id')::uuid);
  perform private.remove_from_deck(caller, removed, 'removed');

  return jsonb_build_object(
    'deck_id', removed.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = removed.deck_id)
  );
end;
$$;

create or replace function public.delete_copy(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  chosen_copy_id uuid;
  removed public.deck_cards;
begin
  caller := private.caller_user_id();
  chosen_copy_id := private.checked_copy_id(request);

  removed := private.lock_deck_of_copy(caller, chosen_copy_id);
  if removed.copy_id is not null then
    perform private.remove_from_deck(caller, removed, 'removed_from_collection');
  end if;

  delete from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;
end;
$$;
