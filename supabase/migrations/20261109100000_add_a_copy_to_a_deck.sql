create type public.deck_change_kind as enum (
  'added',
  'removed',
  'made_commander',
  'made_partner',
  'moved_to_main_deck',
  'basic_lands',
  'removed_from_collection',
  'revert'
);

create type public.deck_role as enum ('commander', 'main');

create table public.deck_cards (
  user_id uuid not null,
  deck_id uuid not null,
  copy_id uuid not null,
  commander_at timestamptz,
  added_at timestamptz not null default now(),
  primary key (user_id, copy_id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade,
  foreign key (user_id, copy_id) references public.copies (user_id, id) on delete cascade
);

create index deck_cards_deck on public.deck_cards (user_id, deck_id);

create table public.deck_changes (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  deck_id uuid not null,
  revision integer not null check (revision > 0),
  kind public.deck_change_kind not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, deck_id, revision),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);

create table public.deck_change_lines (
  user_id uuid not null,
  deck_change_id uuid not null,
  copy_id uuid not null,
  card_printing_id uuid not null references public.card_printings (id),
  finish public.card_finish not null,
  place_before public.deck_role,
  place_after public.deck_role,
  primary key (user_id, deck_change_id, copy_id),
  foreign key (user_id, deck_change_id) references public.deck_changes (user_id, id) on delete cascade
);

alter table public.deck_cards enable row level security;
alter table public.deck_changes enable row level security;
alter table public.deck_change_lines enable row level security;

revoke all on table public.deck_cards, public.deck_changes, public.deck_change_lines from anon, authenticated;
grant select on table public.deck_cards, public.deck_changes, public.deck_change_lines to authenticated;

create policy "Users read their own deck cards"
  on public.deck_cards
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own deck changes"
  on public.deck_changes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own deck change lines"
  on public.deck_change_lines
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
    false as is_held
) deck_use;

create or replace function private.check_request(request jsonb, fields text[])
returns jsonb
language plpgsql
immutable
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

create function private.deck_role(commander_at timestamptz)
returns public.deck_role
language sql
immutable
set search_path = ''
as $$
  select case when commander_at is null then 'main' else 'commander' end::public.deck_role;
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

create function private.basic_land_kinds()
returns table (kind_order integer, name text)
language sql
immutable
set search_path = ''
as $$
  select kind.kind_order::integer, kind.name
  from unnest(array[
    'Plains',
    'Island',
    'Swamp',
    'Mountain',
    'Forest',
    'Wastes',
    'Snow-Covered Plains',
    'Snow-Covered Island',
    'Snow-Covered Swamp',
    'Snow-Covered Mountain',
    'Snow-Covered Forest',
    'Snow-Covered Wastes'
  ]) with ordinality as kind(name, kind_order);
$$;

grant execute on function
  private.deck_role(timestamptz),
  private.basic_land_kinds()
to authenticated;

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
          'count', 0
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
        'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri'
      )
      from public.deck_cards deck_card
      join public.decks deck on deck.user_id = deck_card.user_id and deck.id = deck_card.deck_id
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

create function private.lock_deck(caller uuid, chosen_deck_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id for update;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

create function private.record_deck_change(caller uuid, chosen_deck_id uuid, change_kind public.deck_change_kind)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_revision integer;
  change_id uuid;
begin
  update public.decks deck
    set revision = deck.revision + 1, last_used_at = now()
    where deck.user_id = caller and deck.id = chosen_deck_id
    returning deck.revision into new_revision;

  insert into public.deck_changes (user_id, deck_id, revision, kind)
    values (caller, chosen_deck_id, new_revision, change_kind)
    returning id into change_id;
  return change_id;
end;
$$;

create function public.add_deck_card(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  chosen_copy public.copies;
  copy_is_free boolean;
  change_id uuid;
begin
  caller := private.caller_user_id();
  checked := private.check_request(request, array['deck_id', 'copy_id', 'unprotect']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;

  perform private.lock_deck(caller, chosen_deck_id);
  select * into chosen_copy
    from public.copies copy
    where copy.user_id = caller and copy.id = (checked ->> 'copy_id')::uuid
    for update;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  select a.is_free into copy_is_free
    from private.collection_availability a
    where a.user_id = caller and a.copy_id = chosen_copy.id;
  if not copy_is_free then
    perform private.raise_search_error('copy_not_free', 'Only a free copy can go into a deck.', 'copy_id');
  end if;
  if chosen_copy.is_protected then
    if not (checked ->> 'unprotect')::boolean then
      perform private.raise_search_error(
        'copy_protected',
        'copy_id is a protected copy. Send unprotect: true to unprotect it and add it.',
        'copy_id'
      );
    end if;
    update public.copies copy set is_protected = false where copy.user_id = caller and copy.id = chosen_copy.id;
  end if;

  insert into public.deck_cards (user_id, deck_id, copy_id) values (caller, chosen_deck_id, chosen_copy.id);
  change_id := private.record_deck_change(caller, chosen_deck_id, 'added');
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (caller, change_id, chosen_copy.id, chosen_copy.card_printing_id, chosen_copy.finish, null, 'main');

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

revoke all on function public.add_deck_card(jsonb) from public, anon, service_role;
grant execute on function public.add_deck_card(jsonb) to authenticated;
