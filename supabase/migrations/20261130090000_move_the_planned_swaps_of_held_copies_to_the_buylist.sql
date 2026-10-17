create function private.lock_planned_swaps_holding(owner_id uuid, copy_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1
    from public.planned_swaps swap
    where swap.user_id = owner_id and swap.incoming_copy_id = any (copy_ids) and swap.status = 'open'
    order by swap.id
    for update;
end;
$$;

create function private.move_planned_swaps_to_buylist(owner_id uuid, held_copy_ids uuid[], note public.close_note)
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
    user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason, client_id, client_name
  )
  select
    moved.user_id,
    moved.deck_id,
    moved.incoming_oracle_id,
    moved.as_commander,
    moved.outgoing_copy_id,
    moved.outgoing_oracle_id,
    moved.reason,
    moved.client_id,
    moved.client_name
  from moved;
$$;

create or replace function public.delete_copy(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy_id uuid;
  removed public.deck_cards;
  held record;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.checked_object(null, request, array['copy_id'], array['held_copy_id']);
  chosen_copy_id := (checked ->> 'copy_id')::uuid;
  if checked ? 'held_copy_id' and (checked ->> 'held_copy_id')::uuid <> chosen_copy_id then
    perform private.invalid_argument('held_copy_id', 'held_copy_id must be the copy_id.');
  end if;

  perform private.lock_planned_swaps_holding(caller, array[chosen_copy_id]);
  removed := private.lock_deck_of_copy(caller, chosen_copy_id);
  select card.name, deck.name as deck_name into held
    from public.planned_swaps swap
    join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id
    join public.cards card on card.oracle_id = swap.incoming_oracle_id
    where swap.user_id = caller and swap.incoming_copy_id = chosen_copy_id and swap.status = 'open';
  if held.name is not null then
    if not checked ? 'held_copy_id' then
      perform private.raise_search_error(
        'copy_held',
        format(
          '%s is held by the planned swap for %s. Send held_copy_id to move that planned swap to the buylist and delete the copy.',
          held.name,
          held.deck_name
        ),
        'held_copy_id'
      );
    end if;
    perform private.move_planned_swaps_to_buylist(caller, array[chosen_copy_id], 'held_copy_deleted');
  end if;
  if removed.copy_id is not null then
    perform private.remove_from_deck(caller, removed, 'removed_from_collection');
  end if;

  delete from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;
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

create or replace function private.run_search(api public.search_api, query jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  telemetry_ids constant integer := 20;
  rules_freshness record;
  prices_freshness record;
  checked jsonb;
  searched boolean;
  row_kind text;
  query_hash text;
  page_size integer;
  sort text;
  descending boolean;
  sign text;
  search_id uuid;
  after_key jsonb;
  conditions text[];
  matched_text record;
  price_cents text;
  released_at text;
  sort_columns text;
  direction text;
  collection_rows text;
  matches text;
  page_keys jsonb;
  page_quantities jsonb;
  total_count bigint;
  result_ids uuid[];
  page_ids uuid[];
  items jsonb;
  next_cursor text;
begin
  select * into rules_freshness from public.catalog_freshness() f where f.source = 'catalog';
  select * into prices_freshness from public.catalog_freshness() f where f.source = 'prices';
  if rules_freshness.snapshot_at is null then
    perform private.raise_search_error(
      'data_unavailable',
      'No card catalog import has succeeded yet. Try again later.'
    );
  end if;

  checked := private.check_search_query(coalesce(query, '{}'), api);
  searched := exists (
    select 1
    from jsonb_object_keys(checked) as field
    where field not in ('rows', 'sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor')
  );
  if api = 'catalog' and not searched then
    perform private.raise_search_error(
      'invalid_argument',
      'Catalog search needs text or at least one filter.'
    );
  end if;

  row_kind := checked ->> 'rows';
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5(api || ' ' || (checked - array['cursor', 'limit', 'include_oracle_text'])::text);
  if jsonb_typeof(checked -> 'cursor') = 'string' then
    select c.search_id, c.after_key into search_id, after_key
      from private.read_search_cursor(checked ->> 'cursor', query_hash) c;
  else
    search_id := gen_random_uuid();
  end if;

  if api = 'catalog' then
    conditions := private.catalog_filter_conditions(checked);
    price_cents := '(select lp.usd_cents from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id)';
    released_at := 'c.released_at';
  else
    conditions := private.collection_filter_conditions(checked);
    price_cents := 'private.finish_price_cents(price, a.finish)';
    released_at := 'p.released_at';
  end if;
  select * into matched_text from private.text_search(checked);
  if matched_text.condition is not null then
    conditions := conditions || matched_text.condition;
  end if;

  sort := checked ->> 'sort';
  if sort = 'relevance' and not checked ? 'text' then
    sort := 'added';
  end if;
  descending := checked ->> 'sort_order' = 'desc';
  sign := case when descending then '-' else '' end;
  sort_columns := case sort
    when 'relevance' then format('false, %s, %s', matched_text.tier, matched_text.text_rank)
    when 'name' then 'false, 0, 0'
    when 'mana_value' then format('false, %sc.mana_value, 0', sign)
    when 'edhrec_rank' then format('c.edhrec_rank is null, coalesce(%sc.edhrec_rank, 0), 0', sign)
    when 'release_date' then format('false, %s(%s - date ''1970-01-01''), 0', sign, released_at)
    when 'price' then format('%1$s is null, coalesce(%2$s%1$s, 0), 0', price_cents, sign)
    when 'added' then format('false, %sextract(epoch from a.printing_added_at), 0', sign)
  end;
  direction := case
    when sort = 'relevance' and not descending then 'desc'
    when sort = 'name' and descending then 'desc'
    else 'asc'
  end;

  if api = 'catalog' then
    matches := format(
      'select c.oracle_id as row_id, c.oracle_id as group_id, null::jsonb as quantities, c.name_key, keys.* '
      'from public.cards c '
      'cross join lateral (select %s) as keys(sort_flag, sort_primary, sort_secondary) '
      'where %s',
      sort_columns,
      array_to_string(array['true'] || conditions, ' and ')
    );
  else
    collection_rows := format(
      'select %s '
      'from private.collection_availability a '
      'join public.copies copy on copy.user_id = a.user_id and copy.id = a.copy_id '
      'join public.collection_additions addition on addition.id = copy.addition_id '
      'join public.card_printings p on p.id = a.card_printing_id '
      'join public.cards c on c.oracle_id = p.oracle_id '
      'left join public.card_prices price on price.printing_id = p.id '
      'where %s',
      case row_kind
        when 'copies' then
          'a.copy_id as row_id, a.card_printing_id, a.finish, null::jsonb as quantities, '
          'max(addition.added_at) over (partition by a.card_printing_id) as printing_added_at'
        else
          'min(a.copy_id::text)::uuid as row_id, a.card_printing_id, a.finish, '
          'jsonb_build_object('
          '''quantity'', count(*), '
          '''free_quantity'', count(*) filter (where a.is_free), '
          '''allocated_quantity'', count(*) filter (where a.is_allocated), '
          '''held_quantity'', count(*) filter (where a.is_held)'
          ') as quantities, '
          'max(max(addition.added_at)) over (partition by a.card_printing_id) as printing_added_at'
      end,
      array_to_string(array['true'] || conditions, ' and ')
    ) || case
      when row_kind = 'entries' then ' group by a.card_printing_id, a.finish, a.condition, a.language, a.is_protected'
      else ''
    end;
    matches := format(
      'select a.row_id, a.card_printing_id as group_id, a.quantities, c.name_key, keys.* '
      'from (%s) a '
      'join public.card_printings p on p.id = a.card_printing_id '
      'join public.cards c on c.oracle_id = p.oracle_id '
      'left join public.card_prices price on price.printing_id = p.id '
      'cross join lateral (select %s) as keys(sort_flag, sort_primary, sort_secondary)',
      collection_rows,
      sort_columns
    );
  end if;

  execute format(
    $sql$
      with matches as (%1$s),
      page as (
        select m.*, count(*) over () as total_count
        from matches m
        where $1 is null
          or (m.sort_flag, m.sort_primary, m.sort_secondary, m.name_key, m.group_id, m.row_id) %2$s (
            ($1 ->> 0)::boolean,
            ($1 ->> 1)::numeric,
            ($1 ->> 2)::numeric,
            $1 ->> 3,
            ($1 ->> 4)::uuid,
            ($1 ->> 5)::uuid
          )
        order by %3$s
        limit %4$s
      )
      select
        coalesce(jsonb_agg(
          jsonb_build_array(p.sort_flag, p.sort_primary, p.sort_secondary, p.name_key, p.group_id, p.row_id)
          order by %3$s
        ), '[]'::jsonb),
        coalesce(jsonb_agg(p.quantities order by %3$s), '[]'::jsonb),
        coalesce(max(p.total_count), 0)
      from page p
    $sql$,
    matches,
    case direction when 'asc' then '>' else '<' end,
    format(
      'sort_flag %1$s, sort_primary %1$s, sort_secondary %1$s, name_key %1$s, group_id %1$s, row_id %1$s',
      direction
    ),
    case when after_key is null then greatest(page_size, telemetry_ids) else page_size end + 1
  )
  into page_keys, page_quantities, total_count
  using after_key;

  result_ids := array(
    select (k.key ->> 5)::uuid
    from jsonb_array_elements(page_keys) with ordinality as k(key, ordinality)
    order by k.ordinality
  );
  page_ids := result_ids[1:page_size];
  if jsonb_array_length(page_keys) > page_size then
    next_cursor := private.search_cursor(search_id, query_hash, page_keys -> (page_size - 1));
  end if;

  select coalesce(jsonb_agg(
    case
      when api = 'catalog' then jsonb_build_object(
        'oracle_id', c.oracle_id,
        'name', c.name,
        'mana_cost', c.mana_cost,
        'mana_value', c.mana_value,
        'type_line', c.type_line,
        'color_identity', to_jsonb(c.color_identity),
        'is_game_changer', coalesce(c.is_game_changer, false),
        'can_be_commander', c.can_be_commander,
        'edhrec_rank', c.edhrec_rank,
        'price_from', private.price_from(c.oracle_id),
        'owned', private.owned_copies(c.oracle_id)
      )
      when row_kind = 'copies' then
        private.copy_row(a, p, c, price, prices_freshness.is_stale) || jsonb_build_object(
          'deck', (
            select jsonb_build_object('deck_id', deck.id, 'name', deck.name)
            from public.deck_cards deck_card
            join public.decks deck on deck.user_id = deck_card.user_id and deck.id = deck_card.deck_id
            where deck_card.user_id = a.user_id and deck_card.copy_id = a.copy_id
          ),
          'held_for', (
            select jsonb_build_object('deck_id', deck.id, 'name', deck.name)
            from public.planned_swaps swap
            join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id
            where swap.user_id = a.user_id and swap.incoming_copy_id = a.copy_id and swap.status = 'open'
          )
        )
      else jsonb_build_object(
        'oracle_id', c.oracle_id,
        'printing_id', p.id,
        'name', c.name,
        'set', p.set_code,
        'collector_number', p.collector_number,
        'finish', a.finish,
        'language', a.language,
        'condition', a.condition,
        'protected', a.is_protected,
        'commander_legal', c.commander_legality = 'legal'
      ) || entry.quantities || private.collection_entry_price_and_total(price, a.finish, (entry.quantities ->> 'quantity')::integer, prices_freshness.is_stale)
    end || case
      when (checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(page_ids) with ordinality as page(row_id, ordinality)
  cross join lateral (select page_quantities -> (page.ordinality::integer - 1)) as entry(quantities)
  left join private.collection_availability a on api = 'collection' and a.copy_id = page.row_id
  left join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = case api when 'catalog' then page.row_id else p.oracle_id end
  left join public.card_prices price on price.printing_id = p.id;

  if after_key is null and searched then
    perform private.record_search(
      search_id,
      api,
      checked - 'cursor',
      total_count,
      extract(epoch from clock_timestamp() - started_at) * 1000,
      result_ids[1:telemetry_ids]
    );
  end if;

  return jsonb_build_object(
    'items', items,
    'next_cursor', next_cursor,
    'search_id', search_id,
    'rules_data_as_of', rules_freshness.snapshot_at,
    'rules_stale', rules_freshness.is_stale,
    'prices_observed_at', prices_freshness.snapshot_at,
    'prices_stale', prices_freshness.is_stale
  ) || case
    when api = 'collection' then jsonb_build_object('total_count', case when after_key is null then total_count end)
    else '{}'::jsonb
  end;
end;
$$;

create or replace function private.revert_effect(owner_id uuid, change_id uuid)
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
      held_deck.id as held_deck_id,
      held_deck.name as held_deck_name,
      card.name
    from copy_targets target
    cross join reverted_change
    left join public.copies copy on copy.user_id = owner_id and copy.id = target.copy_id
    left join public.deck_cards deck_card on deck_card.user_id = owner_id and deck_card.copy_id = target.copy_id
    left join public.decks other_deck
      on other_deck.user_id = owner_id and other_deck.id = deck_card.deck_id and other_deck.id <> reverted_change.deck_id
    left join public.planned_swaps swap
      on swap.user_id = owner_id and swap.incoming_copy_id = copy.id and swap.status = 'open'
    left join public.decks held_deck on held_deck.user_id = owner_id and held_deck.id = swap.deck_id
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
    ), '[]'::jsonb),
    'held_copies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'copy_id', effect.copy_id,
        'name', effect.name,
        'deck', jsonb_build_object('deck_id', effect.held_deck_id, 'name', effect.held_deck_name)
      ) order by effect.name, effect.copy_id)
      from returning_copies effect
      where effect.held_deck_id is not null
    ), '[]'::jsonb)
  );
$$;

create or replace function public.preview_revert(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  deck public.decks;
  evaluation public.deck_evaluations;
  changes jsonb;
  reverted_contents jsonb;
begin
  caller := private.caller_user_id();
  checked := private.check_request(query, array['deck_id', 'deck_change_id']);

  select * into deck from public.decks found_deck where found_deck.id = (checked ->> 'deck_id')::uuid;
  if deck.id is null then
    perform private.raise_deck_not_found();
  end if;
  perform private.reverted_revision(caller, deck.id, (checked ->> 'deck_change_id')::uuid);
  changes := private.revert_effect(caller, (checked ->> 'deck_change_id')::uuid);
  select * into evaluation from public.deck_evaluations stored where stored.user_id = caller and stored.deck_id = deck.id;
  reverted_contents := private.reverted_deck_contents(private.deck_contents(caller, deck.id), changes);

  return jsonb_build_object(
    'revision', deck.revision,
    'lines', private.format_deck_change_lines(changes -> 'copy_lines', changes -> 'basic_land_lines'),
    'blocks', changes -> 'blocks',
    'protected_copies', changes -> 'protected_copies',
    'held_copies', changes -> 'held_copies',
    'effect', case
      when reverted_contents -> 'copies' <> '[]'::jsonb or reverted_contents -> 'basic_lands' <> '[]'::jsonb
        then private.deck_change_effect(evaluation, private.judge_deck(reverted_contents))
    end
  );
end;
$$;

create or replace function public.revert_deck_changes(request jsonb)
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
  range_copy_ids uuid[];
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
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

  range_copy_ids := array(
    select line.copy_id
    from public.deck_change_lines line
    join public.deck_changes change on change.user_id = line.user_id and change.id = line.deck_change_id
    where change.user_id = caller and change.deck_id = chosen_deck_id and change.revision >= from_revision
  );
  perform private.lock_planned_swaps_holding(caller, range_copy_ids);
  perform 1
    from public.copies copy
    where copy.user_id = caller and copy.id = any (range_copy_ids)
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

  perform private.move_planned_swaps_to_buylist(
    caller,
    array(select (item ->> 'copy_id')::uuid from jsonb_array_elements(effect -> 'held_copies') item),
    'held_copy_reverted'
  );

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
  perform private.finish_deck_change(caller, chosen_deck_id);

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;
