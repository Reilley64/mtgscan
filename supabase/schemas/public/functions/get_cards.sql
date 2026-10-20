CREATE OR REPLACE FUNCTION public.get_cards (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  data_as_of jsonb;
  prices_as_of jsonb;
  checked jsonb;
  by_printing boolean;
  id_field text;
  items jsonb;
  not_found jsonb;
begin
  data_as_of := private.rules_freshness();
  checked := private.check_card_details_query(query);
  select jsonb_build_object(
    'prices_observed_at', f.snapshot_at,
    'prices_stale', f.is_stale
  )
    into prices_as_of
    from public.catalog_freshness() f
    where f.source = 'prices';
  by_printing := checked ? 'printing_ids';
  id_field := case when by_printing then 'printing_ids' else 'oracle_ids' end;

  select
    coalesce(jsonb_agg(private.card_details_row(c, p) order by r.ordinality) filter (where c.oracle_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(given.id order by r.ordinality) filter (where c.oracle_id is null), '[]'::jsonb)
  into items, not_found
  from jsonb_array_elements_text(checked -> id_field) with ordinality as r(id, ordinality)
  join jsonb_array_elements_text(query -> id_field) with ordinality as given(id, ordinality)
    on given.ordinality = r.ordinality
  left join public.card_printings p on by_printing and p.id = r.id::uuid
  left join public.cards c on c.oracle_id = case when by_printing then p.oracle_id else r.id::uuid end;

  return jsonb_build_object('items', items, 'not_found', not_found) || data_as_of || prices_as_of;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_cards"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_cards"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_cards"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_cards"(jsonb) FROM PUBLIC, "anon", "service_role";
