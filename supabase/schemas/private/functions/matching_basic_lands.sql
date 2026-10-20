CREATE OR REPLACE FUNCTION private.matching_basic_lands (
  checked jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  conditions text[] := private.card_filter_conditions(checked);
  matched_text record;
  lands jsonb;
begin
  if cardinality(private.printing_filter_conditions(checked, '(%s)')) > 0
    or cardinality(private.copy_filter_conditions(checked)) > 0 then
    return '[]';
  end if;

  select * into matched_text from private.text_search(checked);
  if matched_text.condition is not null then
    conditions := conditions || matched_text.condition;
  end if;

  execute format(
    'select coalesce(jsonb_agg('
    'jsonb_build_object(''oracle_id'', land.oracle_id, ''name'', land.name, ''image_uris'', coalesce(to_jsonb(land.image_uris), ''[]''::jsonb)) '
    'order by land.kind_order'
    '), ''[]''::jsonb) '
    'from private.basic_land_cards() land '
    'join public.cards c on c.oracle_id = land.oracle_id '
    'where %s',
    array_to_string(array['true'] || conditions, ' and ')
  )
  into lands;
  return lands;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."matching_basic_lands"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."matching_basic_lands"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."matching_basic_lands"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."matching_basic_lands"(jsonb) TO "postgres";
