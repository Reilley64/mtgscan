drop function public.set_basic_lands(jsonb);

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
      when 'move_planned_swap' then private.checked_boolean(field, member)
      when 'priority' then private.checked_choice(field, member, enum_range(null::public.deck_priority)::text[])
      when 'order' then private.checked_choice(field, member, array['newest_first', 'oldest_first'])
      when 'status' then member
      when 'limit' then private.checked_integer(field, member, 1, 50)
      when 'cursor' then private.checked_cursor(field, member)
      when 'by' then private.checked_integer(field, member, -99, 99)
      when 'count' then private.checked_integer(field, member, 1, 99)
      when 'expected_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'expected_deck_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'idempotency_key' then private.checked_key(field, member, 8)
      when 'ref' then private.checked_key(field, member, 1)
      when 'reason' then private.checked_reason(field, member)
      when 'planned_swaps' then private.checked_planned_swaps(field, member)
      when 'planned_swap_ids' then private.checked_uuid_list(field, member, 100)
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

drop function private.checked_basic_land_counts(text, jsonb);
drop function private.checked_basic_land_count(text, jsonb);

create function public.change_basic_land(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  chosen_oracle_id uuid;
  change integer;
  count_before integer;
  count_after integer;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'oracle_id', 'by']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  chosen_oracle_id := (checked ->> 'oracle_id')::uuid;
  change := (checked ->> 'by')::integer;
  if change = 0 then
    perform private.invalid_argument('by', 'by must not be 0.');
  end if;
  if not private.is_basic_land_card(chosen_oracle_id) then
    perform private.invalid_argument('oracle_id', 'oracle_id is not a basic land card.');
  end if;
  perform private.lock_deck(caller, chosen_deck_id);

  count_before := coalesce((
    select basic_land.count
    from public.deck_basic_lands basic_land
    where basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = chosen_oracle_id
  ), 0);
  count_after := count_before + change;
  if count_after not between 0 and 99 then
    perform private.invalid_argument(
      'by',
      format('by would make %s of this basic land card. A deck has 0 to 99 of each basic land card.', count_after)
    );
  end if;

  change_id := private.record_deck_change(caller, chosen_deck_id, 'basic_lands');
  insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
    values (caller, change_id, chosen_oracle_id, count_before, count_after);
  if count_after = 0 then
    delete from public.deck_basic_lands basic_land
      where basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = chosen_oracle_id;
  else
    insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
      values (caller, chosen_deck_id, chosen_oracle_id, count_after)
      on conflict (user_id, deck_id, oracle_id) do update set count = excluded.count;
  end if;
  perform private.finish_deck_change(caller, chosen_deck_id);

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

grant execute on function private.is_basic_land_card(uuid) to authenticated;

revoke all on function public.change_basic_land(jsonb) from public, anon, service_role;
grant execute on function public.change_basic_land(jsonb) to authenticated;

create or replace function private.swap_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  incoming jsonb,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.deck_change_effect(
    evaluation,
    private.judge_deck(jsonb_build_object(
      'copies',
      coalesce((
        select jsonb_agg(deck_copy)
        from jsonb_array_elements(deck.contents -> 'copies') deck_copy
        where (deck_copy ->> 'copy_id')::uuid is distinct from swap_effect.outgoing_copy_id
      ), '[]'::jsonb) || case when incoming ? 'card_printing_id' then jsonb_build_array(jsonb_build_object(
        'copy_id', coalesce(incoming -> 'copy_id', to_jsonb(gen_random_uuid())),
        'card_printing_id', incoming -> 'card_printing_id',
        'role', case when (incoming ->> 'as_commander')::boolean then 'commander' else 'main' end
      )) else '[]'::jsonb end,
      'basic_lands',
      coalesce((
        select jsonb_agg(jsonb_build_object('oracle_id', land.oracle_id, 'count', land.count) order by land.oracle_id)
        from (
          select counted.oracle_id, sum(counted.count) as count
          from (
            select (stored_land ->> 'oracle_id')::uuid as oracle_id, (stored_land ->> 'count')::integer as count
            from jsonb_array_elements(deck.contents -> 'basic_lands') stored_land
            union all
            select (incoming ->> 'basic_land_oracle_id')::uuid, coalesce((incoming ->> 'count')::integer, 1)
            where incoming ? 'basic_land_oracle_id'
            union all
            select swap_effect.outgoing_oracle_id, -1
            where swap_effect.outgoing_copy_id is null and swap_effect.outgoing_oracle_id is not null
          ) counted
          group by counted.oracle_id
          having sum(counted.count) > 0
        ) land
      ), '[]'::jsonb)
    ))
  )
  from (select private.deck_contents(owner_id, chosen_deck_id) as contents) deck
  left join public.deck_evaluations evaluation on evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
$$;

create or replace function public.preview_add_deck_card(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy public.copies;
  basic_land jsonb;
begin
  caller := private.caller_user_id();
  checked := private.checked_object(null, query, '{}', array['copy_id', 'basic_land_oracle_id', 'count']);
  if checked ? 'copy_id' and checked ? 'basic_land_oracle_id' then
    perform private.invalid_argument('basic_land_oracle_id', 'basic_land_oracle_id must be left out with copy_id.');
  end if;
  if not checked ? 'copy_id' and not checked ? 'basic_land_oracle_id' then
    perform private.invalid_argument('copy_id', 'copy_id or basic_land_oracle_id is required.');
  end if;
  if checked ? 'count' and not checked ? 'basic_land_oracle_id' then
    perform private.invalid_argument('count', 'count is only for a basic land.');
  end if;

  if checked ? 'basic_land_oracle_id' then
    if not private.is_basic_land_card((checked ->> 'basic_land_oracle_id')::uuid) then
      perform private.invalid_argument('basic_land_oracle_id', 'basic_land_oracle_id is not a basic land card.');
    end if;
    basic_land := jsonb_build_object(
      'basic_land_oracle_id', checked -> 'basic_land_oracle_id',
      'count', coalesce(checked -> 'count', '1')
    );
    return jsonb_build_object('items', coalesce((
      select jsonb_agg(
        jsonb_build_object('deck_id', deck.id, 'effect', private.swap_effect(caller, deck.id, basic_land, null, null))
        order by deck.id
      )
      from public.decks deck
    ), '[]'::jsonb));
  end if;

  select * into chosen_copy from public.copies copy where copy.id = (checked ->> 'copy_id')::uuid;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'deck_id', deck.id,
        'effect', private.deck_change_effect(
          evaluation,
          private.judge_deck(jsonb_set(
            contents,
            '{copies}',
            contents -> 'copies' || jsonb_build_array(jsonb_build_object(
              'copy_id', chosen_copy.id,
              'card_printing_id', chosen_copy.card_printing_id,
              'role', 'main'
            ))
          ))
        )
      )
      order by deck.id
    )
    from public.decks deck
    left join public.deck_evaluations evaluation on evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
    cross join lateral private.deck_contents(caller, deck.id) contents
  ), '[]'::jsonb));
end;
$$;

create function public.list_basic_land_cards()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(
    jsonb_build_object(
      'oracle_id', land.oracle_id,
      'name', land.name,
      'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb)
    )
    order by land.kind_order
  ), '[]'::jsonb))
  from private.basic_land_cards() land
  where land.oracle_id is not null;
$$;

revoke all on function public.list_basic_land_cards() from public, anon, service_role;
grant execute on function public.list_basic_land_cards() to authenticated;
