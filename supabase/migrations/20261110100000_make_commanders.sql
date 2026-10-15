create or replace function private.check_request(request jsonb, fields text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  field text;
  value jsonb;
begin
  if jsonb_typeof(request) is distinct from 'object' then
    perform private.invalid_argument(null, 'The request must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(request) as entry order by entry.key loop
    if not field = any(fields) then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, case field
      when 'name' then private.checked_name(value)
      when 'tagged' then private.checked_boolean(field, value)
      when 'unprotect' then private.checked_boolean(field, value)
      when 'commander' then private.checked_boolean(field, value)
      when 'priority' then private.checked_choice(field, value, enum_range(null::public.deck_priority)::text[])
      else private.checked_uuid(field, value)
    end);
  end loop;

  foreach field in array fields loop
    if not checked ? field then
      perform private.invalid_argument(field, format('%s is required.', field));
    end if;
  end loop;
  return checked;
end;
$$;

create or replace function public.get_copy(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  prices_stale boolean;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_copy_query(query);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select private.copy_row(a, p, c, price, prices_stale) || jsonb_build_object(
    'free', a.is_free,
    'added_at', addition.added_at,
    'purchase_day_price', private.price_json(line.purchase_day_usd_cents, a.finish),
    'type_line', c.type_line,
    'faces', coalesce((
      select jsonb_agg(jsonb_build_object('name', f.name, 'oracle_text', f.oracle_text) order by f.face_index)
      from public.card_faces f
      where f.oracle_id = c.oracle_id
    ), '[]'::jsonb),
    'commander_legality', c.commander_legality,
    'art_crop_uri', p.art_crop_uri,
    'user_tags', coalesce((
      select jsonb_agg(jsonb_build_object('user_tag_id', user_tag.id, 'name', user_tag.name) order by lower(user_tag.name), user_tag.name, user_tag.id)
      from public.copy_user_tags link
      join public.user_tags user_tag on user_tag.user_id = link.user_id and user_tag.id = link.user_tag_id
      where link.user_id = a.user_id and link.copy_id = a.copy_id
    ), '[]'::jsonb),
    'deck', (
      select jsonb_build_object(
        'deck_id', deck.id,
        'name', deck.name,
        'role', private.deck_role(deck_card.commander_at),
        'commander_art_crop_uri', deck_commanders.commanders -> 0 -> 'art_crop_uri',
        'commander_count', jsonb_array_length(deck_commanders.commanders)
      )
      from public.deck_cards deck_card
      join public.decks deck on deck.user_id = deck_card.user_id and deck.id = deck_card.deck_id
      cross join lateral (select private.deck_row(deck) -> 'commanders' as commanders) deck_commanders
      where deck_card.user_id = a.user_id and deck_card.copy_id = a.copy_id
    )
  )
  into result
  from private.collection_availability a
  join public.copies copy on copy.user_id = a.user_id and copy.id = a.copy_id
  join public.collection_additions addition on addition.id = copy.addition_id
  join public.collection_addition_lines line
    on (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
      = (copy.addition_id, copy.card_printing_id, copy.finish, copy.condition, copy.language)
  join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = p.oracle_id
  left join public.card_prices price on price.printing_id = p.id
  where a.copy_id = (checked ->> 'copy_id')::uuid;

  if result is null then
    perform private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
  end if;
  return result;
end;
$$;

create function public.set_deck_commander(request jsonb)
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

  select * into chosen_copy
    from public.copies copy
    where copy.user_id = caller and copy.id = (checked ->> 'copy_id')::uuid;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  select card.deck_id into chosen_deck_id
    from public.deck_cards card
    where card.user_id = caller and card.copy_id = chosen_copy.id;
  if chosen_deck_id is not null then
    perform private.lock_deck(caller, chosen_deck_id);
    select * into deck_card
      from public.deck_cards card
      where card.user_id = caller and card.copy_id = chosen_copy.id and card.deck_id = chosen_deck_id;
  end if;
  if deck_card.copy_id is null then
    perform private.raise_search_error('copy_not_in_deck', 'copy_id is not in a deck.', 'copy_id');
  end if;

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

revoke all on function public.set_deck_commander(jsonb) from public, anon, service_role;
grant execute on function public.set_deck_commander(jsonb) to authenticated;
