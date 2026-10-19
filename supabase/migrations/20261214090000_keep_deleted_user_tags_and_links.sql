alter table public.user_tags add column deleted_at timestamptz;
alter table public.copy_user_tags add column deleted_at timestamptz;

drop index public.user_tags_name;
create unique index user_tags_name on public.user_tags (user_id, lower(name)) where deleted_at is null;

create function private.create_user_tag(owner_id uuid, chosen_name text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  user_tag public.user_tags;
begin
  insert into public.user_tags (user_id, name)
    values (owner_id, chosen_name)
    on conflict (user_id, lower(name)) where deleted_at is null do nothing
    returning * into user_tag;
  if user_tag.id is not null then
    return jsonb_build_object('user_tag_id', user_tag.id, 'name', user_tag.name, 'created', true);
  end if;

  select * into user_tag
    from public.user_tags existing
    where existing.user_id = owner_id and lower(existing.name) = lower(chosen_name) and existing.deleted_at is null;
  return jsonb_build_object('user_tag_id', user_tag.id, 'name', user_tag.name, 'created', false);
end;
$$;

create function private.rename_user_tag(owner_id uuid, chosen_user_tag_id uuid, chosen_name text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  renamed public.user_tags;
begin
  begin
    update public.user_tags user_tag
      set name = chosen_name
      where user_tag.user_id = owner_id and user_tag.id = chosen_user_tag_id and user_tag.deleted_at is null
      returning * into renamed;
  exception when unique_violation then
    perform private.raise_user_tag_exists();
  end;
  if renamed.id is null then
    perform private.raise_user_tag_not_found();
  end if;

  return jsonb_build_object('user_tag_id', renamed.id, 'name', renamed.name);
end;
$$;

create function private.delete_user_tag(owner_id uuid, chosen_user_tag_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.user_tags user_tag
    set deleted_at = now()
    where user_tag.user_id = owner_id and user_tag.id = chosen_user_tag_id and user_tag.deleted_at is null;
  if found then
    return true;
  end if;

  if not exists (
    select 1 from public.user_tags user_tag where user_tag.user_id = owner_id and user_tag.id = chosen_user_tag_id
  ) then
    perform private.raise_user_tag_not_found();
  end if;
  return false;
end;
$$;

create function private.set_copies_user_tag(owner_id uuid, chosen_user_tag_id uuid, chosen_copy_ids uuid[], tagged boolean)
returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  found_copy_ids uuid[];
begin
  perform 1
    from public.user_tags user_tag
    where user_tag.user_id = owner_id and user_tag.id = chosen_user_tag_id and user_tag.deleted_at is null
    for share;
  if not found then
    perform private.raise_user_tag_not_found();
  end if;

  found_copy_ids := array(
    select copy.id
    from public.copies copy
    where copy.user_id = owner_id and copy.id = any (chosen_copy_ids)
    order by copy.id
    for key share
  );

  if tagged then
    insert into public.copy_user_tags (user_id, copy_id, user_tag_id)
      select owner_id, found.copy_id, chosen_user_tag_id from unnest(found_copy_ids) found(copy_id)
      on conflict (user_id, copy_id, user_tag_id) do update
        set deleted_at = null
        where public.copy_user_tags.deleted_at is not null;
  else
    update public.copy_user_tags link
      set deleted_at = now()
      where link.user_id = owner_id
        and link.user_tag_id = chosen_user_tag_id
        and link.copy_id = any (found_copy_ids)
        and link.deleted_at is null;
  end if;
  return found_copy_ids;
end;
$$;

create or replace function public.create_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  created jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['name']);

  created := private.create_user_tag(caller, checked ->> 'name');
  if not (created ->> 'created')::boolean then
    perform private.raise_user_tag_exists();
  end if;
  return created - 'created';
end;
$$;

create or replace function public.set_copy_user_tag(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  chosen_copy_id := private.checked_copy_id(request, array['user_tag_id', 'tagged']);
  checked := private.check_request(request - 'copy_id', array['user_tag_id', 'tagged']);

  if cardinality(private.set_copies_user_tag(
    caller,
    (checked ->> 'user_tag_id')::uuid,
    array[chosen_copy_id],
    (checked ->> 'tagged')::boolean
  )) = 0 then
    perform private.raise_copy_not_found();
  end if;
end;
$$;

create or replace function public.rename_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['user_tag_id', 'name']);

  return private.rename_user_tag(caller, (checked ->> 'user_tag_id')::uuid, checked ->> 'name');
end;
$$;

create or replace function public.delete_user_tag(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['user_tag_id']);

  if not private.delete_user_tag(caller, (checked ->> 'user_tag_id')::uuid) then
    perform private.raise_user_tag_not_found();
  end if;
end;
$$;

create or replace function public.list_user_tags(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  perform private.check_request(query, array[]::text[]);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_tag_id', user_tag.id,
        'name', user_tag.name,
        'copy_count', (
          select count(*)
          from public.copy_user_tags link
          where link.user_id = user_tag.user_id and link.user_tag_id = user_tag.id and link.deleted_at is null
        )
      )
      order by lower(user_tag.name), user_tag.name, user_tag.id
    )
    from public.user_tags user_tag
    where user_tag.deleted_at is null
  ), '[]'::jsonb));
end;
$$;

create or replace function private.checked_user_tag_names(field text, value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  lowered jsonb;
  item_index bigint;
  item text;
begin
  perform private.checked_text_list(field, value);
  lowered := (select jsonb_agg(lower(element)) from jsonb_array_elements_text(value) as element);
  perform private.checked_list(field, lowered, 1, 10);
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements_text(lowered) with ordinality as e(element, ordinality)
  loop
    if not exists (select 1 from public.user_tags user_tag where lower(user_tag.name) = item and user_tag.deleted_at is null) then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format('%s[%s] is not one of your user tags.', field, item_index)
      );
    end if;
  end loop;
  return lowered;
end;
$$;

create or replace function private.collection_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := private.card_filter_conditions(checked)
    || private.printing_filter_conditions(checked, '(%s)');
  user_tags_of_copy constant text :=
    'select 1 from public.copy_user_tags link '
    'join public.user_tags user_tag on user_tag.user_id = link.user_id and user_tag.id = link.user_tag_id '
    'where link.user_id = a.user_id and link.copy_id = a.copy_id '
    'and link.deleted_at is null and user_tag.deleted_at is null';
  deck_of_copy constant text :=
    'select 1 from public.deck_cards deck_card '
    'where deck_card.user_id = a.user_id and deck_card.copy_id = a.copy_id';
  entry_chip text[];
  value text;
begin
  foreach entry_chip slice 1 in array array[
    ['finishes', 'finish'],
    ['conditions', 'condition'],
    ['languages', 'language']
  ] loop
    for value in select jsonb_array_elements_text(checked -> entry_chip[1]) loop
      conditions := conditions || format('a.%I = %L', entry_chip[2], value);
    end loop;
    if checked ? (entry_chip[1] || '_exclude') then
      conditions := conditions || format(
        'a.%I::text <> all (%L::text[])',
        entry_chip[2],
        array(select jsonb_array_elements_text(checked -> (entry_chip[1] || '_exclude')))
      );
    end if;
  end loop;

  if checked ? 'price_min' or checked ? 'price_max' then
    conditions := conditions || private.price_condition(
      'private.finish_price_cents(price, a.finish)',
      checked
    );
  end if;

  if checked ? 'is_free' then
    conditions := conditions || case when (checked ->> 'is_free')::boolean
      then 'a.is_free'
      else 'not a.is_free'
    end;
  end if;
  if checked ? 'is_protected' then
    conditions := conditions || format('a.is_protected = %L', (checked ->> 'is_protected')::boolean);
  end if;
  if checked ? 'is_allocated' then
    conditions := conditions || format('a.is_allocated = %L', (checked ->> 'is_allocated')::boolean);
  end if;
  if checked ? 'deck_ids' then
    conditions := conditions || format(
      'exists (%s and deck_card.deck_id = any (%L::uuid[]))',
      deck_of_copy,
      array(select jsonb_array_elements_text(checked -> 'deck_ids'))
    );
  end if;
  if checked ? 'deck_ids_exclude' then
    conditions := conditions || format(
      'not exists (%s and deck_card.deck_id = any (%L::uuid[]))',
      deck_of_copy,
      array(select jsonb_array_elements_text(checked -> 'deck_ids_exclude'))
    );
  end if;

  for value in select jsonb_array_elements_text(checked -> 'user_tags') loop
    conditions := conditions || format('exists (%s and lower(user_tag.name) = %L)', user_tags_of_copy, value);
  end loop;
  if checked ? 'user_tags_exclude' then
    conditions := conditions || format(
      'not exists (%s and lower(user_tag.name) = any (%L::text[]))',
      user_tags_of_copy,
      array(select jsonb_array_elements_text(checked -> 'user_tags_exclude'))
    );
  end if;

  return conditions;
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
      where link.user_id = a.user_id and link.copy_id = a.copy_id and link.deleted_at is null and user_tag.deleted_at is null
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
    ),
    'held_for', (
      select jsonb_build_object(
        'deck_id', deck.id,
        'name', deck.name,
        'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri'
      )
      from public.planned_swaps swap
      join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id
      where swap.user_id = a.user_id and swap.incoming_copy_id = a.copy_id and swap.status = 'open'
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
