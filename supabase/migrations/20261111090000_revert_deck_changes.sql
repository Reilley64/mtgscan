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
      when 'expected_revision' then private.checked_integer(field, value, 0, 2147483647)
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

create function private.format_deck_change_lines(copy_lines jsonb, basic_land_lines jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'kind', 'copy',
        'copy_id', line.copy_id,
        'name', card.name,
        'image_uris', to_jsonb(printing.image_uris),
        'type_line', card.type_line,
        'place_before', line.place_before,
        'place_after', line.place_after
      )
      order by card.name, line.copy_id
    )
    from jsonb_to_recordset(copy_lines) as line(
      copy_id uuid,
      card_printing_id uuid,
      place_before public.deck_role,
      place_after public.deck_role
    )
    join public.card_printings printing on printing.id = line.card_printing_id
    join public.cards card on card.oracle_id = printing.oracle_id
  ), '[]'::jsonb) || coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'kind', 'basic_land',
        'oracle_id', line.oracle_id,
        'name', land.name,
        'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb),
        'count_before', line.count_before,
        'count_after', line.count_after
      )
      order by land.kind_order
    )
    from jsonb_to_recordset(basic_land_lines) as line(oracle_id uuid, count_before integer, count_after integer)
    join private.basic_land_cards() land on land.oracle_id = line.oracle_id
  ), '[]'::jsonb);
$$;

create or replace function private.deck_change_lines(owner_id uuid, change_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.format_deck_change_lines(
    (
      select coalesce(jsonb_agg(to_jsonb(line)), '[]'::jsonb)
      from public.deck_change_lines line
      where line.user_id = owner_id and line.deck_change_id = change_id
    ),
    (
      select coalesce(jsonb_agg(to_jsonb(line)), '[]'::jsonb)
      from public.deck_change_basic_lands line
      where line.user_id = owner_id and line.deck_change_id = change_id
    )
  );
$$;

create function private.revert_effect(owner_id uuid, change_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with reverted_change as (
    select change.deck_id, change.revision
    from public.deck_changes change
    where change.user_id = owner_id and change.id = change_id
  ),
  reverted_range as (
    select change.id, change.revision
    from public.deck_changes change
    join reverted_change on reverted_change.deck_id = change.deck_id and change.revision >= reverted_change.revision
    where change.user_id = owner_id
  ),
  copy_targets as (
    select distinct on (line.copy_id) line.copy_id, line.card_printing_id, line.finish, line.place_before as place_target
    from public.deck_change_lines line
    join reverted_range change on change.id = line.deck_change_id
    where line.user_id = owner_id
    order by line.copy_id, change.revision
  ),
  copy_effects as (
    select
      target.copy_id,
      coalesce(copy.card_printing_id, target.card_printing_id) as card_printing_id,
      coalesce(copy.finish, target.finish) as finish,
      case when deck_card.deck_id = reverted_change.deck_id then private.deck_role(deck_card.commander_at) end as place_before,
      target.place_target as place_after,
      copy.id is null as deleted,
      coalesce(copy.is_protected, false) as is_protected,
      other_deck.id as other_deck_id,
      other_deck.name as other_deck_name,
      card.name
    from copy_targets target
    cross join reverted_change
    left join public.copies copy on copy.user_id = owner_id and copy.id = target.copy_id
    left join public.deck_cards deck_card on deck_card.user_id = owner_id and deck_card.copy_id = target.copy_id
    left join public.decks other_deck
      on other_deck.user_id = owner_id and other_deck.id = deck_card.deck_id and other_deck.id <> reverted_change.deck_id
    join public.card_printings printing on printing.id = coalesce(copy.card_printing_id, target.card_printing_id)
    join public.cards card on card.oracle_id = printing.oracle_id
  ),
  moved_copies as (
    select * from copy_effects effect where effect.place_before is distinct from effect.place_after
  ),
  returning_copies as (
    select * from moved_copies effect where effect.place_before is null
  ),
  land_targets as (
    select distinct on (line.oracle_id) line.oracle_id, line.count_before as count_target
    from public.deck_change_basic_lands line
    join reverted_range change on change.id = line.deck_change_id
    where line.user_id = owner_id
    order by line.oracle_id, change.revision
  ),
  land_effects as (
    select target.oracle_id, coalesce(basic_land.count, 0) as count_before, target.count_target as count_after
    from land_targets target
    cross join reverted_change
    left join public.deck_basic_lands basic_land
      on basic_land.user_id = owner_id and basic_land.deck_id = reverted_change.deck_id and basic_land.oracle_id = target.oracle_id
    where coalesce(basic_land.count, 0) <> target.count_target
  )
  select jsonb_build_object(
    'copy_lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'copy_id', effect.copy_id,
        'card_printing_id', effect.card_printing_id,
        'finish', effect.finish,
        'place_before', effect.place_before,
        'place_after', effect.place_after
      ) order by effect.name, effect.copy_id)
      from moved_copies effect
    ), '[]'::jsonb),
    'basic_land_lines', coalesce((
      select jsonb_agg(to_jsonb(effect) order by effect.oracle_id) from land_effects effect
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'copy_id', effect.copy_id,
        'name', effect.name,
        'deck', case when effect.other_deck_id is not null then
          jsonb_build_object('deck_id', effect.other_deck_id, 'name', effect.other_deck_name)
        end
      ) order by effect.name, effect.copy_id)
      from returning_copies effect
      where effect.deleted or effect.other_deck_id is not null
    ), '[]'::jsonb),
    'protected_copies', coalesce((
      select jsonb_agg(jsonb_build_object('copy_id', effect.copy_id, 'name', effect.name) order by effect.name, effect.copy_id)
      from returning_copies effect
      where effect.is_protected
    ), '[]'::jsonb)
  );
$$;

create function private.raise_deck_change_not_found()
returns void
language sql
set search_path = ''
as $$
  select private.raise_search_error('not_found', 'deck_change_id is not a deck change of this deck.', 'deck_change_id');
$$;

create function private.reverted_revision(owner_id uuid, chosen_deck_id uuid, change_id uuid)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  found_revision integer;
begin
  select change.revision into found_revision
    from public.deck_changes change
    where change.user_id = owner_id and change.deck_id = chosen_deck_id and change.id = change_id;
  if found_revision is null then
    perform private.raise_deck_change_not_found();
  end if;
  return found_revision;
end;
$$;

grant execute on function
  private.format_deck_change_lines(jsonb, jsonb),
  private.revert_effect(uuid, uuid),
  private.raise_deck_change_not_found(),
  private.reverted_revision(uuid, uuid, uuid)
to authenticated;

create function public.preview_revert(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  deck public.decks;
  effect jsonb;
begin
  caller := private.caller_user_id();
  checked := private.check_request(query, array['deck_id', 'deck_change_id']);

  select * into deck from public.decks found_deck where found_deck.id = (checked ->> 'deck_id')::uuid;
  if deck.id is null then
    perform private.raise_deck_not_found();
  end if;
  perform private.reverted_revision(caller, deck.id, (checked ->> 'deck_change_id')::uuid);
  effect := private.revert_effect(caller, (checked ->> 'deck_change_id')::uuid);

  return jsonb_build_object(
    'revision', deck.revision,
    'lines', private.format_deck_change_lines(effect -> 'copy_lines', effect -> 'basic_land_lines'),
    'blocks', effect -> 'blocks',
    'protected_copies', effect -> 'protected_copies'
  );
end;
$$;

create function public.revert_deck_changes(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  chosen_change_id uuid;
  from_revision integer;
  effect jsonb;
  block jsonb;
  change_id uuid;
begin
  caller := private.caller_user_id();
  checked := private.check_request(request, array['deck_id', 'deck_change_id', 'expected_revision', 'unprotect']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  chosen_change_id := (checked ->> 'deck_change_id')::uuid;

  perform private.lock_deck(caller, chosen_deck_id);
  from_revision := private.reverted_revision(caller, chosen_deck_id, chosen_change_id);
  if (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
    <> (checked ->> 'expected_revision')::integer then
    perform private.raise_search_error(
      'stale_revision',
      'expected_revision is not the deck revision. Read the revert preview again.',
      'expected_revision'
    );
  end if;

  perform 1
    from public.copies copy
    where copy.user_id = caller and copy.id in (
      select line.copy_id
      from public.deck_change_lines line
      join public.deck_changes change on change.user_id = line.user_id and change.id = line.deck_change_id
      where change.user_id = caller and change.deck_id = chosen_deck_id and change.revision >= from_revision
    )
    order by copy.id
    for update of copy;
  effect := private.revert_effect(caller, chosen_change_id);

  block := effect -> 'blocks' -> 0;
  if block is not null then
    perform private.raise_search_error(
      'revert_blocked',
      case when jsonb_typeof(block -> 'deck') = 'object'
        then format('%s is in %s.', block ->> 'name', block -> 'deck' ->> 'name')
        else format('%s is no longer in your collection.', block ->> 'name')
      end,
      'deck_change_id'
    );
  end if;
  if jsonb_array_length(effect -> 'protected_copies') > 0 then
    if not (checked ->> 'unprotect')::boolean then
      perform private.raise_search_error(
        'copy_protected',
        format(
          '%s is a protected copy. Send unprotect: true to unprotect it and revert.',
          effect -> 'protected_copies' -> 0 ->> 'name'
        ),
        'unprotect'
      );
    end if;
    update public.copies copy
      set is_protected = false
      where copy.user_id = caller
        and copy.id in (select (item ->> 'copy_id')::uuid from jsonb_array_elements(effect -> 'protected_copies') item);
  end if;

  change_id := private.record_deck_change(caller, chosen_deck_id, 'revert');
  update public.deck_changes change
    set reverted_by = change_id
    where change.user_id = caller
      and change.deck_id = chosen_deck_id
      and change.revision >= from_revision
      and change.id <> change_id
      and change.reverted_by is null;

  delete from public.deck_cards card
    using jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_after public.deck_role)
    where card.user_id = caller and card.copy_id = line.copy_id and line.place_after is null;
  update public.deck_cards card
    set commander_at = case when line.place_after = 'commander' then now() end
    from jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_before public.deck_role, place_after public.deck_role)
    where card.user_id = caller and card.copy_id = line.copy_id and line.place_before is not null and line.place_after is not null;
  insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
    select caller, chosen_deck_id, line.copy_id, case when line.place_after = 'commander' then now() end
    from jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_before public.deck_role, place_after public.deck_role)
    where line.place_before is null;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select caller, change_id, line.copy_id, line.card_printing_id, line.finish, line.place_before, line.place_after
    from jsonb_to_recordset(effect -> 'copy_lines') as line(
      copy_id uuid,
      card_printing_id uuid,
      finish public.card_finish,
      place_before public.deck_role,
      place_after public.deck_role
    );

  insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
    select caller, change_id, line.oracle_id, line.count_before, line.count_after
    from jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid, count_before integer, count_after integer);
  delete from public.deck_basic_lands basic_land
    using jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid)
    where basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = line.oracle_id;
  insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
    select caller, chosen_deck_id, line.oracle_id, line.count_after
    from jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid, count_after integer)
    where line.count_after > 0;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

revoke all on function public.preview_revert(jsonb), public.revert_deck_changes(jsonb) from public, anon, service_role;
grant execute on function public.preview_revert(jsonb), public.revert_deck_changes(jsonb) to authenticated;
