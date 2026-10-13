create or replace function private.check_collection_copies_query(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  checked_value jsonb;
  field text;
  value jsonb;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field = 'limit' then
        private.checked_integer(field, value, 1, 120)
      when field = 'cursor' then
        case when jsonb_typeof(value) in ('string', 'null') then value end
      when field = 'price_currency' then
        private.checked_choice(field, value, enum_range(null::public.price_currency)::text[])
    end;
    if checked_value is null then
      if field = 'cursor' then
        perform private.invalid_argument(field, 'cursor must be a string or null.');
      else
        perform private.invalid_argument(field, format('%s is not a known field.', field));
      end if;
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  return jsonb_build_object('limit', 60, 'price_currency', 'USD') || checked;
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
  after_entry_id uuid;
  after_copy_number integer;
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
    after_key := private.read_page_cursor(checked ->> 'cursor', query_hash, 5);
    begin
      after_added_at := (after_key ->> 0)::timestamptz;
      after_name := after_key ->> 1;
      after_printing_id := (after_key ->> 2)::uuid;
      after_entry_id := (after_key ->> 3)::uuid;
      after_copy_number := (after_key ->> 4)::integer;
    exception when others then
      after_copy_number := null;
    end;
    if num_nulls(after_added_at, after_name, after_printing_id, after_entry_id, after_copy_number) > 0 then
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
      order by page.printing_added_at desc, page.name, page.printing_id, page.collection_entry_id, page.copy_number
    ),
    '[]'::jsonb
  )
  into page_rows
  from (
    select
      owned.id as collection_entry_id,
      copy.copy_number,
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
        e.*,
        max(e.latest_addition_at) over (partition by e.card_printing_id) as printing_added_at
      from public.collection_entries e
    ) owned
    cross join lateral generate_series(1, owned.quantity) as copy(copy_number)
    join public.card_printings p on p.id = owned.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
    left join public.card_prices price on price.printing_id = p.id
    cross join lateral (select private.finish_price_cents(price, owned.finish, chosen_currency) as cents) copy_price
    where after_key is null
      or owned.printing_added_at < after_added_at
      or (
        owned.printing_added_at = after_added_at
        and (c.name, p.id, owned.id, copy.copy_number)
          > (after_name, after_printing_id, after_entry_id, after_copy_number)
      )
    order by owned.printing_added_at desc, c.name, p.id, owned.id, copy.copy_number
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
        last_row -> 'collection_entry_id',
        last_row -> 'copy_number'
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
