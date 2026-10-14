create function private.check_copy_query(query jsonb)
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
      when field = 'copy_id' then
        private.checked_uuid(field, value)
      when field = 'price_currency' then
        private.checked_choice(field, value, enum_range(null::public.price_currency)::text[])
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'copy_id' then
    perform private.invalid_argument('copy_id', 'copy_id is required.');
  end if;
  return jsonb_build_object('price_currency', 'USD') || checked;
end;
$$;

grant execute on function private.check_copy_query(jsonb) to authenticated;

create function public.get_copy(query jsonb)
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
    'free', a.is_free,
    'added_at', addition.added_at,
    'purchase_day_price', case when purchase_day.cents is not null then jsonb_build_object(
      'amount', (purchase_day.cents / 100.0)::numeric(10, 2)::text,
      'currency', chosen_currency,
      'finish', a.finish
    ) end,
    'price', case when current_price.cents is not null then jsonb_build_object(
      'amount', (current_price.cents / 100.0)::numeric(10, 2)::text,
      'currency', chosen_currency,
      'finish', a.finish,
      'stale', prices_stale
    ) end,
    'type_line', c.type_line,
    'faces', (
      select jsonb_agg(jsonb_build_object('name', f.name, 'oracle_text', f.oracle_text) order by f.face_index)
      from public.card_faces f
      where f.oracle_id = c.oracle_id
    ),
    'commander_legality', c.commander_legality
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
  cross join lateral (
    select private.finish_price_cents(price, a.finish, chosen_currency) as cents
  ) current_price
  cross join lateral (
    select case chosen_currency
      when 'USD' then line.purchase_day_usd_cents
      when 'EUR' then line.purchase_day_eur_cents
    end as cents
  ) purchase_day
  where a.copy_id = (checked ->> 'copy_id')::uuid;

  if result is null then
    perform private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
  end if;
  return result;
end;
$$;

revoke all on function public.get_copy(jsonb) from public, anon, service_role;
grant execute on function public.get_copy(jsonb) to authenticated;
