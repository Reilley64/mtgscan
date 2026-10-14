delete from public.card_prices
  where num_nonnulls(usd_nonfoil_cents, usd_foil_cents, usd_etched_cents) = 0;

alter table public.card_prices
  drop column eur_nonfoil_cents,
  drop column eur_foil_cents,
  add check (num_nonnulls(usd_nonfoil_cents, usd_foil_cents, usd_etched_cents) > 0);

alter table catalog_import.card_prices
  drop column eur_nonfoil_cents,
  drop column eur_foil_cents;

alter table public.collection_addition_lines drop column purchase_day_eur_cents;

delete from public.card_lowest_prices where currency <> 'USD';

alter table public.card_lowest_prices
  drop constraint card_lowest_prices_pkey,
  drop column currency,
  add primary key (oracle_id);

alter table public.card_lowest_prices rename column amount_cents to usd_cents;

drop view private.collection_totals;
drop function catalog_import.current_lowest_prices();
drop function private.price_from(uuid, public.price_currency);
drop function private.finish_price_cents(public.card_prices, public.card_finish, public.price_currency);
drop function private.copy_row(
  private.collection_availability,
  public.card_printings,
  public.cards,
  public.card_prices,
  public.price_currency,
  boolean
);
drop function private.price_json(integer, public.price_currency, public.card_finish);
drop type public.price_currency;

create type public.price_currency as enum ('USD');

create function catalog_import.current_lowest_prices()
returns table (
  oracle_id uuid,
  usd_cents integer,
  finish public.card_finish
)
language sql
stable
set search_path = ''
as $$
  select distinct on (printing.oracle_id)
    printing.oracle_id, offer.usd_cents, offer.finish
  from public.card_prices price
  join public.card_printings printing on printing.id = price.printing_id and printing.absent_since is null
  cross join lateral (
    values
      ('nonfoil'::public.card_finish, price.usd_nonfoil_cents),
      ('foil', price.usd_foil_cents),
      ('etched', price.usd_etched_cents)
  ) as offer(finish, usd_cents)
  where offer.usd_cents is not null
  order by printing.oracle_id, offer.usd_cents, offer.finish;
$$;

create function private.finish_price_cents(price public.card_prices, finish public.card_finish)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case finish
    when 'nonfoil' then price.usd_nonfoil_cents
    when 'foil' then price.usd_foil_cents
    when 'etched' then price.usd_etched_cents
  end;
$$;

create function private.price_json(cents integer, currency public.price_currency, finish public.card_finish)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when cents is not null then jsonb_build_object(
    'amount', (cents / 100.0)::numeric(10, 2)::text,
    'currency', currency,
    'finish', finish
  ) end;
$$;

create function private.copy_row(
  a private.collection_availability,
  p public.card_printings,
  c public.cards,
  price public.card_prices,
  currency public.price_currency,
  prices_stale boolean
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'copy_id', a.copy_id,
    'printing_id', p.id,
    'name', c.name,
    'set', p.set_code,
    'collector_number', p.collector_number,
    'rarity', p.rarity,
    'image_uris', to_jsonb(p.image_uris),
    'finish', a.finish,
    'condition', a.condition,
    'language', a.language,
    'protected', a.is_protected,
    'price', private.price_json(private.finish_price_cents(price, a.finish), currency, a.finish)
      || jsonb_build_object('stale', prices_stale)
  );
$$;

create function private.price_from(oracle_id uuid, currency public.price_currency)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'currency', price_from.currency,
    'amount', (lowest.usd_cents / 100.0)::numeric(10, 2)::text,
    'finish', lowest.finish,
    'basis', 'lowest current price over printings and finishes'
  )
  from public.card_lowest_prices lowest
  where lowest.oracle_id = price_from.oracle_id;
$$;

create view private.collection_totals with (security_invoker = true) as
select
  copy.user_id,
  coalesce(sum(copy_price.cents), 0)::bigint as total_cents,
  count(copy_price.cents)::integer as priced_copies,
  count(*)::integer as copies
from public.copies copy
left join public.card_prices price on price.printing_id = copy.card_printing_id
cross join lateral (select private.finish_price_cents(price, copy.finish) as cents) copy_price
group by copy.user_id;

grant select on table private.collection_totals to authenticated;

grant execute on function private.finish_price_cents(public.card_prices, public.card_finish) to authenticated;

grant execute on function
  private.price_json(integer, public.price_currency, public.card_finish),
  private.copy_row(
    private.collection_availability,
    public.card_printings,
    public.cards,
    public.card_prices,
    public.price_currency,
    boolean
  )
to authenticated, service_role;

grant execute on function private.price_from(uuid, public.price_currency) to authenticated, service_role;

create or replace function catalog_import.merge_prices(run public.import_runs, staged_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  staged_prices bigint;
  missing bigint;
  dropped_prices bigint;
  accepted_prices bigint;
  prices_inserted bigint;
  prices_updated bigint;
  prices_deleted bigint;
  lowest_inserted bigint;
  lowest_updated bigint;
  lowest_deleted bigint;
begin
  select count(*), count(*) filter (
      where p.printing_id is null
        or num_nonnulls(p.usd_nonfoil_cents, p.usd_foil_cents, p.usd_etched_cents) = 0
    )
    into staged_prices, missing
    from catalog_import.card_prices p
    where p.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'card_prices', staged_rows -> 'card_prices', staged_prices, missing);

  delete from catalog_import.card_prices p
    where p.run_id = run.id
      and not exists (select 1 from public.card_printings printing where printing.id = p.printing_id);
  get diagnostics dropped_prices = row_count;
  accepted_prices := staged_prices - dropped_prices;

  perform catalog_import.check_shrink(
    'card_prices',
    (select count(*) from public.card_prices),
    accepted_prices,
    run.accept_shrink
  );

  with merged as (
    insert into public.card_prices as live (printing_id, usd_nonfoil_cents, usd_foil_cents, usd_etched_cents)
    select p.printing_id, p.usd_nonfoil_cents, p.usd_foil_cents, p.usd_etched_cents
    from catalog_import.card_prices p
    where p.run_id = run.id
    on conflict (printing_id) do update set
      usd_nonfoil_cents = excluded.usd_nonfoil_cents,
      usd_foil_cents = excluded.usd_foil_cents,
      usd_etched_cents = excluded.usd_etched_cents
    where (live.usd_nonfoil_cents, live.usd_foil_cents, live.usd_etched_cents)
      is distinct from (excluded.usd_nonfoil_cents, excluded.usd_foil_cents, excluded.usd_etched_cents)
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into prices_inserted, prices_updated
    from merged;

  delete from public.card_prices live
    where not exists (
      select 1 from catalog_import.card_prices p where p.run_id = run.id and p.printing_id = live.printing_id
    );
  get diagnostics prices_deleted = row_count;

  delete from public.card_lowest_prices live
    where not exists (
      select 1
      from catalog_import.current_lowest_prices() lowest
      where lowest.oracle_id = live.oracle_id
    );
  get diagnostics lowest_deleted = row_count;

  with merged as (
    insert into public.card_lowest_prices as live (oracle_id, usd_cents, finish)
    select lowest.oracle_id, lowest.usd_cents, lowest.finish
    from catalog_import.current_lowest_prices() lowest
    on conflict (oracle_id) do update set
      usd_cents = excluded.usd_cents,
      finish = excluded.finish
    where (live.usd_cents, live.finish) is distinct from (excluded.usd_cents, excluded.finish)
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into lowest_inserted, lowest_updated
    from merged;

  return jsonb_build_object(
    'card_prices', jsonb_build_object(
      'staged', staged_prices,
      'accepted', accepted_prices,
      'dropped', dropped_prices,
      'inserted', prices_inserted,
      'updated', prices_updated,
      'deleted', prices_deleted
    ),
    'card_lowest_prices', jsonb_build_object(
      'inserted', lowest_inserted,
      'updated', lowest_updated,
      'deleted', lowest_deleted
    )
  );
end;
$$;

create or replace function private.catalog_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := array['c.commander_legality = ''legal''', 'c.absent_since is null']
    || private.card_filter_conditions(checked)
    || private.printing_filter_conditions(
      checked,
      'exists (select 1 from public.card_printings p where p.oracle_id = c.oracle_id and p.absent_since is null and %s)'
    );
begin
  if checked ? 'price_min' or checked ? 'price_max' then
    conditions := conditions || format(
      'exists (select 1 from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id and %s)',
      private.price_condition('lp.usd_cents', checked)
    );
  end if;

  return conditions;
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
    'where link.user_id = a.user_id and link.copy_id = a.copy_id';
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
  currency text;
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
    where field not in ('rows', 'sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor', 'price_currency')
  );
  if api = 'catalog' and not searched then
    perform private.raise_search_error(
      'invalid_argument',
      'Catalog search needs text or at least one filter.'
    );
  end if;

  row_kind := checked ->> 'rows';
  currency := checked ->> 'price_currency';
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
        'price_from', private.price_from(c.oracle_id, currency::public.price_currency),
        'owned', private.owned_copies(c.oracle_id)
      )
      when row_kind = 'copies' then
        private.copy_row(a, p, c, price, currency::public.price_currency, prices_freshness.is_stale)
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
      ) || (page_quantities -> (page.ordinality::integer - 1))
    end || case
      when (checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(page_ids) with ordinality as page(row_id, ordinality)
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

create or replace function public.add_scan_batch(batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  copies jsonb;
  new_copy_count integer;
  addition public.collection_additions;
begin
  caller := private.caller_user_id();
  copies := private.check_scan_batch(batch);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('add_scan_batch ' || caller::text, 0));

  select count(*) into new_copy_count
    from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
    where not exists (
      select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
    );

  if new_copy_count = 0 then
    return private.scan_batch_result(caller, addition, copies);
  end if;

  insert into public.collection_additions (user_id, added_at, copy_count, source)
    values (caller, now(), new_copy_count, 'scan_batch')
    returning * into addition;

  with new_copies as (
    select c.*
    from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
    where not exists (
      select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
    )
  ),
  stacks as (
    select n.card_printing_id, n.finish, n.condition, n.language, count(*)::integer as quantity
    from new_copies n
    group by n.card_printing_id, n.finish, n.condition, n.language
  ),
  price_snapshot as (
    select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'prices'
  )
  insert into public.collection_addition_lines (
    addition_id, user_id, card_printing_id, finish, condition, language, quantity,
    purchase_day_usd_cents, price_snapshot_at
  )
  select
    addition.id,
    caller,
    s.card_printing_id,
    s.finish,
    s.condition,
    s.language,
    s.quantity,
    private.finish_price_cents(price, s.finish),
    (select price_snapshot.snapshot_at from price_snapshot)
  from stacks s
  left join public.card_prices price on price.printing_id = s.card_printing_id;

  insert into public.collection_addition_copies (
    user_id, copy_id, addition_id, card_printing_id, finish, condition, language
  )
  select caller, c.copy_id, addition.id, c.card_printing_id, c.finish, c.condition, c.language
  from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
  where not exists (
    select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
  );

  insert into public.copies (id, user_id, addition_id, card_printing_id, finish, condition, language)
  select done.copy_id, done.user_id, done.addition_id, done.card_printing_id, done.finish, done.condition, done.language
  from public.collection_addition_copies done
  where done.user_id = caller and done.addition_id = addition.id;

  return private.scan_batch_result(caller, addition, copies);
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
  chosen_currency public.price_currency;
  prices_stale boolean;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_copy_query(query);
  chosen_currency := (checked ->> 'price_currency')::public.price_currency;
  select f.is_stale into prices_stale from public.catalog_freshness() f where f.source = 'prices';

  select private.copy_row(a, p, c, price, chosen_currency, prices_stale) || jsonb_build_object(
    'free', a.is_free,
    'added_at', addition.added_at,
    'purchase_day_price', private.price_json(line.purchase_day_usd_cents, chosen_currency, a.finish),
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
    ), '[]'::jsonb)
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

create or replace function public.get_collection_total(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  chosen_currency public.price_currency;
  current_total private.collection_totals;
begin
  perform private.caller_user_id();
  chosen_currency := (private.check_collection_total_query(query) ->> 'price_currency')::public.price_currency;

  select * into current_total from private.collection_totals;

  return jsonb_build_object(
    'total', (coalesce(current_total.total_cents, 0) / 100.0)::numeric(14, 2)::text,
    'currency', chosen_currency,
    'priced_copies', coalesce(current_total.priced_copies, 0),
    'copies', coalesce(current_total.copies, 0)
  );
end;
$$;

grant create on schema public to catalog_importer;

alter function catalog_import.current_lowest_prices() owner to catalog_importer;

revoke create on schema public from catalog_importer;
