create or replace function public.get_collection_total(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  rate public.exchange_rates;
  prices_freshness record;
  current_total private.collection_totals;
begin
  perform private.caller_user_id();
  rate := private.exchange_rate(private.check_collection_total_query(query) ->> 'price_currency');

  select * into prices_freshness from public.catalog_freshness() f where f.source = 'prices';
  select * into current_total from private.collection_totals;

  return jsonb_build_object(
    'total', private.converted_amount(coalesce(current_total.total_cents, 0), rate),
    'currency', rate.currency,
    'priced_copies', coalesce(current_total.priced_copies, 0),
    'copies', coalesce(current_total.copies, 0),
    'stale', prices_freshness.is_stale or private.exchange_rate_is_stale(rate),
    'prices_observed_at', prices_freshness.snapshot_at
  ) || private.exchange_rate_fields(rate);
end;
$$;
