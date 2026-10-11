create function private.check_collection_printings_query(query jsonb)
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

  return jsonb_build_object('limit', 60) || checked;
end;
$$;

create function public.list_collection_printings(query jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  page_size integer;
  query_hash text;
  after_key jsonb;
  after_latest_addition_at timestamptz;
  after_name text;
  after_id uuid;
  page_rows jsonb;
  last_row jsonb;
  next_cursor text;
begin
  caller := private.caller_user_id();
  checked := private.check_collection_printings_query(query);
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('collection printings ' || caller::text);

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', query_hash, 3);
    begin
      after_latest_addition_at := (after_key ->> 0)::timestamptz;
      after_name := after_key ->> 1;
      after_id := (after_key ->> 2)::uuid;
    exception when others then
      after_id := null;
    end;
    if num_nulls(after_latest_addition_at, after_name, after_id) > 0 then
      perform private.raise_search_error(
        'invalid_cursor',
        'The cursor is not valid. Start again without a cursor.',
        'cursor'
      );
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(page) order by page.latest_addition_at desc, page.name, page.printing_id), '[]'::jsonb)
  into page_rows
  from (
    select
      p.id as printing_id,
      c.name,
      p.set_code as set,
      p.collector_number,
      p.image_uris,
      owned.owned_quantity,
      owned.latest_addition_at
    from (
      select
        e.card_printing_id,
        sum(e.quantity)::integer as owned_quantity,
        max(e.latest_addition_at) as latest_addition_at
      from public.collection_entries e
      where e.user_id = caller
      group by e.card_printing_id
    ) owned
    join public.card_printings p on p.id = owned.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
    where after_key is null
      or owned.latest_addition_at < after_latest_addition_at
      or (
        owned.latest_addition_at = after_latest_addition_at
        and (c.name, p.id) > (after_name, after_id)
      )
    order by owned.latest_addition_at desc, c.name, p.id
    limit page_size + 1
  ) page;

  if jsonb_array_length(page_rows) > page_size then
    page_rows := page_rows - page_size;
    last_row := page_rows -> (page_size - 1);
    next_cursor := private.page_cursor(
      query_hash,
      jsonb_build_array(last_row -> 'latest_addition_at', last_row -> 'name', last_row -> 'printing_id')
    );
  end if;

  return jsonb_build_object('items', page_rows, 'next_cursor', next_cursor);
end;
$$;

revoke all on function public.list_collection_printings(jsonb) from public, anon, service_role;
grant execute on function public.list_collection_printings(jsonb) to authenticated;
