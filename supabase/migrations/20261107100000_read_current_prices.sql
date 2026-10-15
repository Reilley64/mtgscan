create function private.checked_current_price_item(field text, item jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  key text;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    perform private.invalid_argument(field, format('%s must be a JSON object.', field));
  end if;

  foreach key in array array['printing_id', 'finish'] loop
    if not item ? key then
      perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is required.', field, key));
    end if;
    checked := checked || jsonb_build_object(key, case key
      when 'printing_id' then
        private.checked_uuid(format('%s.%s', field, key), item -> key)
      when 'finish' then
        private.checked_choice(format('%s.%s', field, key), item -> key, enum_range(null::public.card_finish)::text[])
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
  return checked;
end;
$$;

create function private.check_current_prices_query(query jsonb)
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
      when field = 'items' then
        (
          select jsonb_agg(private.checked_current_price_item(format('items[%s]', e.ordinality - 1), e.element) order by e.ordinality)
          from jsonb_array_elements(private.checked_list(field, value, 1, 100)) with ordinality as e(element, ordinality)
        )
      when field = 'price_currency' then
        private.checked_price_currency(field, value)
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'items' then
    perform private.invalid_argument('items', 'items is required.');
  end if;
  return jsonb_build_object('price_currency', 'USD') || checked;
end;
$$;

create function public.get_current_prices(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  rate public.exchange_rates;
  prices_stale boolean;
  items jsonb;
begin
  checked := private.check_current_prices_query(query);
  rate := private.exchange_rate(checked ->> 'price_currency');
  select f.is_stale or private.exchange_rate_is_stale(rate) into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select jsonb_agg(
    jsonb_build_object(
      'printing_id', item.printing_id,
      'finish', item.finish,
      'price', private.price_json(private.finish_price_cents(price, item.finish), rate, item.finish)
        || jsonb_build_object('stale', prices_stale)
    )
    order by item.ordinality
  )
  into items
  from (
    select (e.element ->> 'printing_id')::uuid as printing_id, (e.element ->> 'finish')::public.card_finish as finish, e.ordinality
    from jsonb_array_elements(checked -> 'items') with ordinality as e(element, ordinality)
  ) item
  left join public.card_prices price on price.printing_id = item.printing_id;

  return jsonb_build_object('items', items);
end;
$$;

grant execute on function
  private.checked_current_price_item(text, jsonb),
  private.check_current_prices_query(jsonb)
to authenticated;

revoke all on function public.get_current_prices(jsonb) from public, anon, service_role;
grant execute on function public.get_current_prices(jsonb) to authenticated;
