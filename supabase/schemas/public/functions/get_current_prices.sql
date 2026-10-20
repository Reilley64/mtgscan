CREATE OR REPLACE FUNCTION public.get_current_prices (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  prices_stale boolean;
  items jsonb;
begin
  checked := private.check_current_prices_query(query);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select jsonb_agg(
    jsonb_build_object(
      'printing_id', item.printing_id,
      'finish', item.finish,
      'price', private.current_price(price, item.finish, prices_stale)
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_current_prices"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_current_prices"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_current_prices"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_current_prices"(jsonb) FROM PUBLIC, "anon", "service_role";
