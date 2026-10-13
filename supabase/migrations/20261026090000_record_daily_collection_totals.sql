create table public.daily_collection_totals (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  currency public.price_currency not null,
  total_cents bigint not null check (total_cents >= 0),
  priced_copies integer not null check (priced_copies >= 0),
  copies integer not null check (copies >= priced_copies),
  price_snapshot_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, currency, day)
);

alter table public.daily_collection_totals enable row level security;

revoke all on table public.daily_collection_totals from anon, authenticated;
grant select on table public.daily_collection_totals to authenticated;

create policy "Users read their own daily collection totals"
  on public.daily_collection_totals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create view private.collection_totals with (security_invoker = true) as
select
  entry.user_id,
  currency.currency,
  coalesce(sum(entry.quantity::bigint * copy_price.cents), 0)::bigint as total_cents,
  coalesce(sum(entry.quantity) filter (where copy_price.cents is not null), 0)::integer as priced_copies,
  sum(entry.quantity)::integer as copies
from public.collection_entries entry
cross join unnest(enum_range(null::public.price_currency)) as currency(currency)
left join public.card_prices price on price.printing_id = entry.card_printing_id
cross join lateral (select private.finish_price_cents(price, entry.finish, currency.currency) as cents) copy_price
group by entry.user_id, currency.currency;

grant select on table private.collection_totals to authenticated;

create function private.price_day(snapshot_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (snapshot_at at time zone 'UTC')::date;
$$;

grant execute on function private.price_day(timestamptz) to authenticated;

create function public.record_daily_collection_totals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_at timestamptz;
  recorded integer;
begin
  select s.snapshot_at into snapshot_at from public.import_snapshots s where s.source = 'prices';
  if snapshot_at is null then
    raise exception 'No price import has succeeded yet'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.daily_collection_totals (
    user_id, day, currency, total_cents, priced_copies, copies, price_snapshot_at
  )
  select t.user_id, private.price_day(snapshot_at), t.currency, t.total_cents, t.priced_copies, t.copies, snapshot_at
  from private.collection_totals t
  on conflict (user_id, currency, day) do nothing;
  get diagnostics recorded = row_count;
  return recorded;
end;
$$;

revoke all on function public.record_daily_collection_totals() from public, anon, authenticated;
grant execute on function public.record_daily_collection_totals() to service_role;

create function private.check_collection_total_query(query jsonb)
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
      when field = 'price_currency' then
        private.checked_choice(field, value, enum_range(null::public.price_currency)::text[])
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  return jsonb_build_object('price_currency', 'USD') || checked;
end;
$$;

grant execute on function private.check_collection_total_query(jsonb) to authenticated;

create function public.get_collection_total(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  chosen_currency public.price_currency;
  current_total private.collection_totals;
  current_day date;
  yesterdays_total public.daily_collection_totals;
  total_cents bigint;
begin
  perform private.caller_user_id();
  chosen_currency := (private.check_collection_total_query(query) ->> 'price_currency')::public.price_currency;

  select * into current_total from private.collection_totals t where t.currency = chosen_currency;
  total_cents := coalesce(current_total.total_cents, 0);

  select private.price_day(f.snapshot_at) into current_day from public.catalog_freshness() f where f.source = 'prices';
  select * into yesterdays_total
    from public.daily_collection_totals d
    where d.currency = chosen_currency and d.day = current_day - 1;

  return jsonb_build_object(
    'total', (total_cents / 100.0)::numeric(14, 2)::text,
    'currency', chosen_currency,
    'priced_copies', coalesce(current_total.priced_copies, 0),
    'copies', coalesce(current_total.copies, 0),
    'change', ((total_cents - yesterdays_total.total_cents) / 100.0)::numeric(14, 2)::text
  );
end;
$$;

revoke all on function public.get_collection_total(jsonb) from public, anon, service_role;
grant execute on function public.get_collection_total(jsonb) to authenticated;
