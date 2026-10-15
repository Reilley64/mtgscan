create function public.list_price_currencies()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('items', jsonb_agg(
    jsonb_build_object('currency', offered.currency, 'minor_unit_digits', private.minor_unit_digits(offered.currency))
    order by offered.currency
  ))
  from (
    select 'USD' as currency
    union
    select r.currency from public.exchange_rates r
  ) offered;
$$;

revoke all on function public.list_price_currencies() from public, anon, service_role;
grant execute on function public.list_price_currencies() to authenticated;
