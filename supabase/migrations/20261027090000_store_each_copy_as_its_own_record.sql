create table public.copies (
  id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  addition_id uuid not null,
  card_printing_id uuid not null,
  finish public.card_finish not null,
  condition public.card_condition not null,
  language public.card_language not null,
  is_protected boolean not null default false,
  primary key (user_id, id),
  foreign key (user_id, id) references public.collection_addition_copies (user_id, copy_id) on delete cascade,
  foreign key (addition_id, card_printing_id, finish, condition, language)
    references public.collection_addition_lines (addition_id, card_printing_id, finish, condition, language)
    on delete cascade
);

create index copies_card_printing on public.copies (user_id, card_printing_id);
create index copies_addition_line on public.copies (addition_id, card_printing_id, finish, condition, language);

alter table public.copies enable row level security;

revoke all on table public.copies from anon, authenticated;
grant select on table public.copies to authenticated;

create policy "Users read their own copies"
  on public.copies
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

do $$
declare
  overfull_line record;
  mismatch record;
begin
  select line.addition_id, line.card_printing_id, line.quantity, count(done.copy_id) as recorded
    into overfull_line
    from public.collection_addition_lines line
    join public.collection_addition_copies done
      on (done.addition_id, done.card_printing_id, done.finish, done.condition, done.language)
        = (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
    group by line.addition_id, line.card_printing_id, line.finish, line.condition, line.language, line.quantity
    having count(done.copy_id) > line.quantity
    limit 1;
  if found then
    raise exception 'Addition line % of card printing % records % copy IDs for % copies.',
      overfull_line.addition_id, overfull_line.card_printing_id, overfull_line.recorded, overfull_line.quantity;
  end if;

  select entry.id, entry.user_id, entry.card_printing_id, entry.quantity, coalesce(lines.quantity, 0) as line_quantity
    into mismatch
    from public.collection_entries entry
    left join (
      select line.collection_entry_id, sum(line.quantity) as quantity
      from public.collection_addition_lines line
      group by line.collection_entry_id
    ) lines on lines.collection_entry_id = entry.id
    where entry.quantity is distinct from lines.quantity
    limit 1;
  if found then
    raise exception 'Collection entry % of user % has % copies of card printing %, and its addition lines have %.',
      mismatch.id, mismatch.user_id, mismatch.quantity, mismatch.card_printing_id, mismatch.line_quantity;
  end if;

  if exists (select 1 from public.collection_addition_lines line where line.collection_entry_id is null) then
    raise exception 'An addition line points at no collection entry.';
  end if;
end;
$$;

insert into public.collection_addition_copies (
  user_id, copy_id, addition_id, card_printing_id, finish, condition, language
)
select line.user_id, gen_random_uuid(), line.addition_id, line.card_printing_id, line.finish, line.condition, line.language
from public.collection_addition_lines line
cross join lateral generate_series(
  1,
  line.quantity - (
    select count(*)
    from public.collection_addition_copies done
    where (done.addition_id, done.card_printing_id, done.finish, done.condition, done.language)
      = (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
  )
);

insert into public.copies (id, user_id, addition_id, card_printing_id, finish, condition, language, is_protected)
select
  done.copy_id,
  done.user_id,
  done.addition_id,
  done.card_printing_id,
  done.finish,
  done.condition,
  done.language,
  entry.is_protected
from public.collection_addition_copies done
join public.collection_addition_lines line
  on (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
    = (done.addition_id, done.card_printing_id, done.finish, done.condition, done.language)
join public.collection_entries entry on entry.id = line.collection_entry_id;

drop view private.collection_availability;
drop view private.collection_totals;

alter table public.collection_addition_lines
  drop column collection_entry_id,
  drop column entry_quantity;

drop table public.collection_entries;
drop function private.is_sorted_set(uuid[]);

create view private.collection_availability with (security_invoker = true) as
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
  select false as is_allocated, false as is_held
) deck_use;

create view private.collection_entries with (security_invoker = true) as
select
  min(a.copy_id::text)::uuid as lowest_copy_id,
  a.user_id,
  a.card_printing_id,
  a.oracle_id,
  a.finish,
  a.condition,
  a.language,
  a.is_protected,
  count(*)::integer as quantity,
  count(*) filter (where a.is_allocated)::integer as allocated_quantity,
  count(*) filter (where a.is_held)::integer as held_quantity,
  count(*) filter (where a.is_free)::integer as free_quantity
from private.collection_availability a
group by a.user_id, a.card_printing_id, a.oracle_id, a.finish, a.condition, a.language, a.is_protected;

create view private.collection_totals with (security_invoker = true) as
select
  copy.user_id,
  currency.currency,
  coalesce(sum(copy_price.cents), 0)::bigint as total_cents,
  count(copy_price.cents)::integer as priced_copies,
  count(*)::integer as copies
from public.copies copy
cross join unnest(enum_range(null::public.price_currency)) as currency(currency)
left join public.card_prices price on price.printing_id = copy.card_printing_id
cross join lateral (select private.finish_price_cents(price, copy.finish, currency.currency) as cents) copy_price
group by copy.user_id, currency.currency;

grant select on table private.collection_availability, private.collection_entries to authenticated, service_role;
grant select on table private.collection_totals to authenticated;

create or replace function private.owned_copies(oracle_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'quantity', count(*),
    'free_quantity', count(*) filter (where a.is_free),
    'protected_free_quantity', count(*) filter (where a.is_free and a.is_protected)
  )
  from private.collection_availability a
  where a.oracle_id = owned_copies.oracle_id and not private.caller_uses_secret_key();
$$;

create or replace function private.owned_printing_quantity(printing_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select count(*)
  from private.collection_availability a
  where a.card_printing_id = owned_printing_quantity.printing_id;
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
  currency text;
  query_hash text;
  page_size integer;
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
  page_keys jsonb;
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
  if api = 'catalog' and not exists (
    select 1
    from jsonb_object_keys(checked) as field
    where field not in ('sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor', 'price_currency')
  ) then
    perform private.raise_search_error(
      'invalid_argument',
      'Catalog search needs text or at least one filter.'
    );
  end if;

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
    price_cents := format(
      '(select lp.amount_cents from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id and lp.currency = %L)',
      currency
    );
    released_at := 'c.released_at';
  else
    conditions := private.collection_filter_conditions(checked);
    price_cents := format('private.finish_price_cents(price, a.finish, %L)', currency);
    released_at := 'p.released_at';
  end if;
  select * into matched_text from private.text_search(checked);
  if matched_text.condition is not null then
    conditions := conditions || matched_text.condition;
  end if;

  descending := checked ->> 'sort_order' = 'desc';
  sign := case when descending then '-' else '' end;
  sort_columns := case checked ->> 'sort'
    when 'relevance' then format('false, %s, %s', matched_text.tier, matched_text.text_rank)
    when 'name' then 'false, 0, 0'
    when 'mana_value' then format('false, %sc.mana_value, 0', sign)
    when 'edhrec_rank' then format('c.edhrec_rank is null, coalesce(%sc.edhrec_rank, 0), 0', sign)
    when 'release_date' then format('false, %s(%s - date ''1970-01-01''), 0', sign, released_at)
    when 'price' then format('%1$s is null, coalesce(%2$s%1$s, 0), 0', price_cents, sign)
  end;
  direction := case
    when checked ->> 'sort' = 'relevance' and not descending then 'desc'
    when checked ->> 'sort' = 'name' and descending then 'desc'
    else 'asc'
  end;

  execute format(
    $sql$
      with matches as (
        select %6$s as row_id, c.name_key, keys.sort_flag, keys.sort_primary, keys.sort_secondary
        from %7$s
        cross join lateral (select %1$s) as keys(sort_flag, sort_primary, sort_secondary)
        where %2$s
      ),
      page as (
        select m.*, count(*) over () as total_count
        from matches m
        where $1 is null
          or (m.sort_flag, m.sort_primary, m.sort_secondary, m.name_key, m.row_id) %3$s (
            ($1 ->> 0)::boolean, ($1 ->> 1)::numeric, ($1 ->> 2)::numeric, $1 ->> 3, ($1 ->> 4)::uuid
          )
        order by %4$s
        limit %5$s
      )
      select
        coalesce(jsonb_agg(
          jsonb_build_array(p.sort_flag, p.sort_primary, p.sort_secondary, p.name_key, p.row_id)
          order by %4$s
        ), '[]'::jsonb),
        coalesce(max(p.total_count), 0)
      from page p
    $sql$,
    sort_columns,
    array_to_string(array['true'] || conditions, ' and '),
    case direction when 'asc' then '>' else '<' end,
    format(
      'sort_flag %1$s, sort_primary %1$s, sort_secondary %1$s, name_key %1$s, row_id %1$s',
      direction
    ),
    case when after_key is null then greatest(page_size, telemetry_ids) else page_size end + 1,
    case api when 'catalog' then 'c.oracle_id' else 'a.lowest_copy_id' end,
    case api
      when 'catalog' then 'public.cards c'
      else 'private.collection_entries a '
        'join public.card_printings p on p.id = a.card_printing_id '
        'join public.cards c on c.oracle_id = p.oracle_id '
        'left join public.card_prices price on price.printing_id = p.id'
    end
  )
  into page_keys, total_count
  using after_key;

  result_ids := array(
    select (k.key ->> 4)::uuid
    from jsonb_array_elements(page_keys) with ordinality as k(key, ordinality)
    order by k.ordinality
  );
  page_ids := result_ids[1:page_size];
  if jsonb_array_length(page_keys) > page_size then
    next_cursor := private.search_cursor(search_id, query_hash, page_keys -> (page_size - 1));
  end if;

  select coalesce(jsonb_agg(
    case api
      when 'catalog' then jsonb_build_object(
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
        'quantity', a.quantity,
        'free_quantity', a.free_quantity,
        'allocated_quantity', a.allocated_quantity,
        'held_quantity', a.held_quantity,
        'commander_legal', c.commander_legality = 'legal'
      )
    end || case
      when (checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(page_ids) with ordinality as page(row_id, ordinality)
  left join private.collection_entries a on api = 'collection' and a.lowest_copy_id = page.row_id
  left join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = case api when 'catalog' then page.row_id else p.oracle_id end;

  if after_key is null then
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
  );
end;
$$;

create or replace function private.scan_batch_result(caller uuid, addition public.collection_additions, copies jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'addition_id', addition.id,
    'added_at', addition.added_at,
    'copy_count', coalesce(addition.copy_count, 0),
    'items', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'card_printing_id', line.card_printing_id,
          'finish', line.finish,
          'condition', line.condition,
          'language', line.language,
          'quantity_added', line.quantity
        )
        order by line.card_printing_id, line.finish, line.condition, line.language
      ), '[]'::jsonb)
      from public.collection_addition_lines line
      where line.addition_id = addition.id
    ),
    'copies', (
      select jsonb_agg(
        jsonb_build_object(
          'copy_id', done.copy_id,
          'addition_id', done.addition_id,
          'replayed', done.addition_id is distinct from addition.id
        )
        order by requested.ordinality
      )
      from jsonb_array_elements(copies) with ordinality as requested(element, ordinality)
      join public.collection_addition_copies done
        on done.user_id = caller and done.copy_id = (requested.element ->> 'copy_id')::uuid
    )
  );
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
    purchase_day_usd_cents, purchase_day_eur_cents, price_snapshot_at
  )
  select
    addition.id,
    caller,
    s.card_printing_id,
    s.finish,
    s.condition,
    s.language,
    s.quantity,
    private.finish_price_cents(price, s.finish, 'USD'),
    private.finish_price_cents(price, s.finish, 'EUR'),
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

create or replace function public.list_collection_copies(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  page_size integer;
  query_hash text;
  after_key jsonb;
  after_added_at timestamptz;
  after_name text;
  after_printing_id uuid;
  after_copy_id uuid;
  page_rows jsonb;
  last_row jsonb;
  next_cursor text;
  chosen_currency public.price_currency;
  prices_stale boolean;
begin
  caller := private.caller_user_id();
  checked := private.check_collection_copies_query(query);
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('collection copies ' || caller::text);
  chosen_currency := (checked ->> 'price_currency')::public.price_currency;
  select f.is_stale into prices_stale from public.catalog_freshness() f where f.source = 'prices';

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', query_hash, 4);
    begin
      after_added_at := (after_key ->> 0)::timestamptz;
      after_name := after_key ->> 1;
      after_printing_id := (after_key ->> 2)::uuid;
      after_copy_id := (after_key ->> 3)::uuid;
    exception when others then
      after_copy_id := null;
    end;
    if num_nulls(after_added_at, after_name, after_printing_id, after_copy_id) > 0 then
      perform private.raise_search_error(
        'invalid_cursor',
        'The cursor is not valid. Start again without a cursor.',
        'cursor'
      );
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(page)
      order by page.printing_added_at desc, page.name, page.printing_id, page.copy_id
    ),
    '[]'::jsonb
  )
  into page_rows
  from (
    select
      owned.id as copy_id,
      p.id as printing_id,
      c.name,
      p.set_code as set,
      p.collector_number,
      p.rarity,
      p.image_uris,
      owned.finish,
      owned.condition,
      owned.language,
      owned.is_protected as protected,
      case when copy_price.cents is not null then
        jsonb_build_object(
          'amount', (copy_price.cents / 100.0)::numeric(10, 2)::text,
          'currency', chosen_currency,
          'finish', owned.finish,
          'stale', prices_stale
        )
      end as price,
      owned.printing_added_at
    from (
      select
        copy.*,
        max(addition.added_at) over (partition by copy.card_printing_id) as printing_added_at
      from public.copies copy
      join public.collection_additions addition on addition.id = copy.addition_id
    ) owned
    join public.card_printings p on p.id = owned.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
    left join public.card_prices price on price.printing_id = p.id
    cross join lateral (select private.finish_price_cents(price, owned.finish, chosen_currency) as cents) copy_price
    where after_key is null
      or owned.printing_added_at < after_added_at
      or (
        owned.printing_added_at = after_added_at
        and (c.name, p.id, owned.id) > (after_name, after_printing_id, after_copy_id)
      )
    order by owned.printing_added_at desc, c.name, p.id, owned.id
    limit page_size + 1
  ) page;

  if jsonb_array_length(page_rows) > page_size then
    page_rows := page_rows - page_size;
    last_row := page_rows -> (page_size - 1);
    next_cursor := private.page_cursor(
      query_hash,
      jsonb_build_array(
        last_row -> 'printing_added_at',
        last_row -> 'name',
        last_row -> 'printing_id',
        last_row -> 'copy_id'
      )
    );
  end if;

  page_rows := (
    select coalesce(jsonb_agg(copy_row.value - 'printing_added_at' order by copy_row.ordinality), '[]'::jsonb)
    from jsonb_array_elements(page_rows) with ordinality as copy_row(value, ordinality)
  );

  return jsonb_build_object('items', page_rows, 'next_cursor', next_cursor);
end;
$$;
