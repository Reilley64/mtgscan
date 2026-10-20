CREATE OR REPLACE FUNCTION private.card_filter_conditions (
  checked jsonb
)
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  conditions text[] := '{}';
  value text;
  mask smallint;
  stat text;
begin
  for value in select jsonb_array_elements_text(checked -> 'names') loop
    conditions := conditions || format('c.name_key like %L', '%' || private.name_key(value) || '%');
  end loop;
  for value in select jsonb_array_elements_text(checked -> 'names_exclude') loop
    conditions := conditions || format('c.name_key not like %L', '%' || private.name_key(value) || '%');
  end loop;
  for value in select jsonb_array_elements_text(checked -> 'types') loop
    conditions := conditions || private.type_line_condition(value);
  end loop;
  for value in select jsonb_array_elements_text(checked -> 'types_exclude') loop
    conditions := conditions || ('not ' || private.type_line_condition(value));
  end loop;

  if checked ? 'colors' then
    mask := private.color_bits(array(select jsonb_array_elements_text(checked -> 'colors')));
    if checked -> 'colors' ? 'C' then
      conditions := conditions || 'c.color_bits = 0'::text;
    end if;
    if mask > 0 then
      conditions := conditions || format('c.color_bits & %s = %s', mask, mask);
    end if;
  end if;
  if checked ? 'colors_exclude' then
    mask := private.color_bits(array(select jsonb_array_elements_text(checked -> 'colors_exclude')));
    if checked -> 'colors_exclude' ? 'C' then
      conditions := conditions || 'c.color_bits <> 0'::text;
    end if;
    if mask > 0 then
      conditions := conditions || format('c.color_bits & %s = 0', mask);
    end if;
  end if;
  if checked ? 'identity_subset_of' then
    mask := private.color_bits(array(select jsonb_array_elements_text(checked -> 'identity_subset_of')));
    conditions := conditions || format('c.identity_bits & %s = 0', 31 # mask);
  end if;

  if checked ? 'mana_value_min' then
    conditions := conditions || format('c.mana_value >= %s', (checked ->> 'mana_value_min')::integer);
  end if;
  if checked ? 'mana_value_max' then
    conditions := conditions || format('c.mana_value <= %s', (checked ->> 'mana_value_max')::integer);
  end if;
  foreach stat in array array['power', 'toughness'] loop
    if checked ? (stat || '_min') or checked ? (stat || '_max') then
      conditions := conditions || format(
        'exists (select 1 from public.card_faces f where f.oracle_id = c.oracle_id '
        'and case when f.%1$I ~ ''^-?[0-9]+(\.[0-9]+)?$'' then f.%1$I::numeric end between %2$L and %3$L)',
        stat,
        coalesce(checked ->> (stat || '_min'), '-Infinity'),
        coalesce(checked ->> (stat || '_max'), 'Infinity')
      );
    end if;
  end loop;

  if checked ? 'keywords' then
    conditions := conditions || format(
      'private.keyword_keys(c.keywords) @> %L::text[]',
      array(select jsonb_array_elements_text(checked -> 'keywords'))
    );
  end if;
  if checked ? 'keywords_exclude' then
    conditions := conditions || format(
      'not private.keyword_keys(c.keywords) && %L::text[]',
      array(select jsonb_array_elements_text(checked -> 'keywords_exclude'))
    );
  end if;

  for value in select jsonb_array_elements_text(checked -> 'tags') loop
    conditions := conditions || private.tagged_cards_condition(
      format('select t.id from public.oracle_tags t where t.slug = %L', value)
    );
  end loop;
  if checked ? 'tags_exclude' then
    conditions := conditions || ('not ' || private.tagged_cards_condition(
      format(
        'select t.id from public.oracle_tags t where t.slug = any (%L::text[])',
        array(select jsonb_array_elements_text(checked -> 'tags_exclude'))
      )
    ));
  end if;

  if checked ? 'is_commander' then
    conditions := conditions || format('c.can_be_commander = %L', (checked ->> 'is_commander')::boolean);
  end if;
  if checked ? 'is_game_changer' then
    conditions := conditions || case when (checked ->> 'is_game_changer')::boolean
      then 'c.is_game_changer is true'
      else 'c.is_game_changer is not true'
    end;
  end if;

  return conditions;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."card_filter_conditions"(jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."card_filter_conditions"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."card_filter_conditions"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."card_filter_conditions"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."card_filter_conditions"(jsonb) TO "postgres";
