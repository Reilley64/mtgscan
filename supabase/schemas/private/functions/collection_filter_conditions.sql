CREATE OR REPLACE FUNCTION private.collection_filter_conditions (
  checked jsonb
)
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  conditions text[] := private.card_filter_conditions(checked)
    || private.printing_filter_conditions(checked, '(%s)');
  user_tags_of_copy constant text :=
    'select 1 from public.copy_user_tags link '
    'join public.user_tags user_tag on user_tag.user_id = link.user_id and user_tag.id = link.user_tag_id '
    'where link.user_id = a.user_id and link.copy_id = a.copy_id '
    'and link.deleted_at is null and user_tag.deleted_at is null';
  deck_of_copy constant text :=
    'select 1 from public.deck_cards deck_card '
    'where deck_card.user_id = a.user_id and deck_card.copy_id = a.copy_id';
  entry_chip text[];
  value text;
begin
  foreach entry_chip slice 1 in array array[
    ['finishes', 'finish'],
    ['conditions', 'condition'],
    ['languages', 'language']
  ] loop
    for value in select jsonb_array_elements_text(checked -> entry_chip[1]) loop
      conditions := conditions || format('a.%I = %L', entry_chip[2], value);
    end loop;
    if checked ? (entry_chip[1] || '_exclude') then
      conditions := conditions || format(
        'a.%I::text <> all (%L::text[])',
        entry_chip[2],
        array(select jsonb_array_elements_text(checked -> (entry_chip[1] || '_exclude')))
      );
    end if;
  end loop;

  if checked ? 'price_min' or checked ? 'price_max' then
    conditions := conditions || private.price_condition(
      'private.finish_price_cents(price, a.finish)',
      checked
    );
  end if;

  if checked ? 'is_free' then
    conditions := conditions || case when (checked ->> 'is_free')::boolean
      then 'a.is_free'
      else 'not a.is_free'
    end;
  end if;
  if checked ? 'is_protected' then
    conditions := conditions || format('a.is_protected = %L', (checked ->> 'is_protected')::boolean);
  end if;
  if checked ? 'is_allocated' then
    conditions := conditions || format('a.is_allocated = %L', (checked ->> 'is_allocated')::boolean);
  end if;
  if checked ? 'deck_ids' then
    conditions := conditions || format(
      'exists (%s and deck_card.deck_id = any (%L::uuid[]))',
      deck_of_copy,
      array(select jsonb_array_elements_text(checked -> 'deck_ids'))
    );
  end if;
  if checked ? 'deck_ids_exclude' then
    conditions := conditions || format(
      'not exists (%s and deck_card.deck_id = any (%L::uuid[]))',
      deck_of_copy,
      array(select jsonb_array_elements_text(checked -> 'deck_ids_exclude'))
    );
  end if;

  for value in select jsonb_array_elements_text(checked -> 'user_tags') loop
    conditions := conditions || format('exists (%s and lower(user_tag.name) = %L)', user_tags_of_copy, value);
  end loop;
  if checked ? 'user_tags_exclude' then
    conditions := conditions || format(
      'not exists (%s and lower(user_tag.name) = any (%L::text[]))',
      user_tags_of_copy,
      array(select jsonb_array_elements_text(checked -> 'user_tags_exclude'))
    );
  end if;

  return conditions;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."collection_filter_conditions"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."collection_filter_conditions"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."collection_filter_conditions"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."collection_filter_conditions"(jsonb) TO "postgres";
