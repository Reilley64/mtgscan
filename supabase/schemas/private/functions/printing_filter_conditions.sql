CREATE OR REPLACE FUNCTION private.printing_filter_conditions (
  checked            jsonb,
  printing_condition text
)
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  conditions text[] := '{}';
  value text;
begin
  for value in select jsonb_array_elements_text(checked -> 'sets') loop
    conditions := conditions || format(printing_condition, format('p.set_code = %L', value));
  end loop;
  if checked ? 'sets_exclude' then
    conditions := conditions || format(
      'not ' || printing_condition,
      format('p.set_code = any (%L::text[])', array(select jsonb_array_elements_text(checked -> 'sets_exclude')))
    );
  end if;
  for value in select jsonb_array_elements_text(checked -> 'rarities') loop
    conditions := conditions || format(printing_condition, format('p.rarity = %L', value));
  end loop;
  if checked ? 'rarities_exclude' then
    conditions := conditions || format(
      'not ' || printing_condition,
      format(
        'p.rarity = any (%L::public.card_rarity[])',
        array(select jsonb_array_elements_text(checked -> 'rarities_exclude'))
      )
    );
  end if;
  return conditions;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."printing_filter_conditions"(jsonb, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."printing_filter_conditions"(jsonb, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."printing_filter_conditions"(jsonb, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."printing_filter_conditions"(jsonb, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."printing_filter_conditions"(jsonb, text) TO "postgres";
