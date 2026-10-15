create table public.deck_basic_lands (
  user_id uuid not null,
  deck_id uuid not null,
  oracle_id uuid not null references public.cards (oracle_id),
  count integer not null check (count between 1 and 99),
  primary key (user_id, deck_id, oracle_id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);

create table public.deck_change_basic_lands (
  user_id uuid not null,
  deck_change_id uuid not null,
  oracle_id uuid not null references public.cards (oracle_id),
  count_before integer not null check (count_before between 0 and 99),
  count_after integer not null check (count_after between 0 and 99),
  primary key (user_id, deck_change_id, oracle_id),
  foreign key (user_id, deck_change_id) references public.deck_changes (user_id, id) on delete cascade
);

alter table public.deck_basic_lands enable row level security;
alter table public.deck_change_basic_lands enable row level security;

revoke all on table public.deck_basic_lands, public.deck_change_basic_lands from anon, authenticated;
grant select on table public.deck_basic_lands, public.deck_change_basic_lands to authenticated;

create policy "Users read their own deck basic lands"
  on public.deck_basic_lands
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own deck change basic lands"
  on public.deck_change_basic_lands
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function private.checked_basic_land_count(field text, item jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  key text;
  value jsonb;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    perform private.invalid_argument(field, format('%s must be a JSON object.', field));
  end if;

  foreach key in array array['oracle_id', 'count'] loop
    value := item -> key;
    if value is null then
      perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is required.', field, key));
    end if;
    checked := checked || jsonb_build_object(key, case key
      when 'oracle_id' then private.checked_uuid(format('%s.%s', field, key), value)
      when 'count' then private.checked_integer(format('%s.%s', field, key), value, 0, 99)
    end);
  end loop;

  select entry.key into key
    from jsonb_object_keys(item) as entry(key)
    where not checked ? entry.key
    order by entry.key
    limit 1;
  if found then
    perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is not a known field.', field, key));
  end if;

  if not exists (
    select 1
    from public.cards card
    join private.basic_land_kinds() kind on kind.name = card.name
    where card.oracle_id = (checked ->> 'oracle_id')::uuid
  ) then
    perform private.invalid_argument(
      format('%s.oracle_id', field),
      format('%s.oracle_id is not a basic land card.', field)
    );
  end if;
  return checked;
end;
$$;

create function private.checked_basic_land_counts(field text, value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '[]';
  item jsonb;
  item_index bigint;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) > 12 then
    perform private.invalid_argument(field, format('%s must be a list of 0 to 12 basic land counts.', field));
  end if;
  for item, item_index in
    select e.element, e.ordinality - 1 from jsonb_array_elements(value) with ordinality as e(element, ordinality)
  loop
    item := private.checked_basic_land_count(format('%s[%s]', field, item_index), item);
    if exists (select 1 from jsonb_array_elements(checked) earlier where earlier -> 'oracle_id' = item -> 'oracle_id') then
      perform private.invalid_argument(
        format('%s[%s].oracle_id', field, item_index),
        format('%s[%s].oracle_id repeats another basic land card in %s.', field, item_index, field)
      );
    end if;
    checked := checked || jsonb_build_array(item);
  end loop;
  return checked;
end;
$$;

grant execute on function
  private.checked_basic_land_count(text, jsonb),
  private.checked_basic_land_counts(text, jsonb)
to authenticated;

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
      when 'counts' then private.checked_basic_land_counts(field, value)
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

create or replace function private.deck_row(deck public.decks)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'deck_id', deck.id,
    'name', deck.name,
    'priority', deck.priority,
    'card_count', (
      select count(*)
      from public.deck_cards deck_card
      where deck_card.user_id = deck.user_id and deck_card.deck_id = deck.id
    ) + (
      select coalesce(sum(basic_land.count), 0)
      from public.deck_basic_lands basic_land
      where basic_land.user_id = deck.user_id and basic_land.deck_id = deck.id
    ),
    'commanders', (
      select coalesce(jsonb_agg(
        jsonb_build_object('copy_id', copy.id, 'name', card.name, 'art_crop_uri', printing.art_crop_uri)
        order by deck_card.commander_at, copy.id
      ), '[]'::jsonb)
      from public.deck_cards deck_card
      join public.copies copy on copy.user_id = deck_card.user_id and copy.id = deck_card.copy_id
      join public.card_printings printing on printing.id = copy.card_printing_id
      join public.cards card on card.oracle_id = printing.oracle_id
      where deck_card.user_id = deck.user_id and deck_card.deck_id = deck.id and deck_card.commander_at is not null
    ),
    'last_used_at', deck.last_used_at
  );
$$;

create or replace function public.get_deck(query jsonb)
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
  checked := private.check_request(query, array['deck_id']);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select private.deck_row(deck) || jsonb_build_object(
    'revision', deck.revision,
    'created_at', deck.created_at,
    'cards', (
      select coalesce(jsonb_agg(
        private.copy_row(a, p, c, price, prices_stale) || jsonb_build_object(
          'role', private.deck_role(deck_card.commander_at),
          'commander_at', deck_card.commander_at,
          'added_at', deck_card.added_at,
          'type_line', c.type_line,
          'mana_value', c.mana_value,
          'colors', to_jsonb(c.colors)
        )
        order by c.name, a.copy_id
      ), '[]'::jsonb)
      from public.deck_cards deck_card
      join private.collection_availability a on a.user_id = deck_card.user_id and a.copy_id = deck_card.copy_id
      join public.card_printings p on p.id = a.card_printing_id
      join public.cards c on c.oracle_id = p.oracle_id
      left join public.card_prices price on price.printing_id = p.id
      where deck_card.user_id = deck.user_id and deck_card.deck_id = deck.id
    ),
    'basic_lands', (
      select jsonb_agg(
        jsonb_build_object(
          'oracle_id', land.oracle_id,
          'name', kind.name,
          'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb),
          'count', coalesce(basic_land.count, 0)
        )
        order by kind.kind_order
      )
      from private.basic_land_kinds() kind
      left join lateral (
        select card.oracle_id, printing.image_uris
        from public.cards card
        join public.card_printings printing on printing.oracle_id = card.oracle_id
        where card.name = kind.name and card.absent_since is null and printing.absent_since is null
        order by printing.lang = 'en' desc, printing.released_at desc, printing.set_code, printing.collector_number
        limit 1
      ) land on true
      left join public.deck_basic_lands basic_land
        on basic_land.user_id = deck.user_id and basic_land.deck_id = deck.id and basic_land.oracle_id = land.oracle_id
    )
  )
    into result
    from public.decks deck
    where deck.id = (checked ->> 'deck_id')::uuid;
  if result is null then
    perform private.raise_deck_not_found();
  end if;
  return result;
end;
$$;

create function public.set_basic_lands(request jsonb)
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
  end if;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

revoke all on function public.set_basic_lands(jsonb) from public, anon, service_role;
grant execute on function public.set_basic_lands(jsonb) to authenticated;
