CREATE OR REPLACE FUNCTION public.list_free_copies (
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
begin
  perform private.caller_user_id();
  checked := private.checked_object(null, query, array['oracle_id'], '{}');
  select f.is_stale into prices_stale from public.catalog_freshness() f where f.source = 'prices';

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      private.copy_row(a, p, c, price, prices_stale)
      order by p.released_at desc, p.set_code, p.collector_number, a.finish, a.condition, a.copy_id
    )
    from private.collection_availability a
    join public.card_printings p on p.id = a.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
    left join public.card_prices price on price.printing_id = p.id
    where a.oracle_id = (checked ->> 'oracle_id')::uuid and a.is_free
  ), '[]'::jsonb));
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_free_copies"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_free_copies"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_free_copies"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_free_copies"(jsonb) FROM PUBLIC, "anon", "service_role";
