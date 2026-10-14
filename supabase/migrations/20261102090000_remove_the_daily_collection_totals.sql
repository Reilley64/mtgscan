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

  select * into current_total from private.collection_totals t where t.currency = chosen_currency;

  return jsonb_build_object(
    'total', (coalesce(current_total.total_cents, 0) / 100.0)::numeric(14, 2)::text,
    'currency', chosen_currency,
    'priced_copies', coalesce(current_total.priced_copies, 0),
    'copies', coalesce(current_total.copies, 0)
  );
end;
$$;

drop function public.record_daily_collection_totals();
drop function private.price_day(timestamptz);
drop table public.daily_collection_totals;
