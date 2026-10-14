create function private.checked_user_tag_names(field text, value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  lowered jsonb;
  item_index bigint;
  item text;
begin
  perform private.checked_text_list(field, value);
  lowered := (select jsonb_agg(lower(element)) from jsonb_array_elements_text(value) as element);
  perform private.checked_list(field, lowered, 1, 10);
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements_text(lowered) with ordinality as e(element, ordinality)
  loop
    if not exists (select 1 from public.user_tags user_tag where lower(user_tag.name) = item) then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format('%s[%s] is not one of your user tags.', field, item_index)
      );
    end if;
  end loop;
  return lowered;
end;
$$;

grant execute on function private.checked_user_tag_names(text, jsonb) to authenticated;

create or replace function private.check_search_query(query jsonb, api public.search_api)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  checked_value jsonb;
  field text;
  value jsonb;
  bound text;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field = 'text' then
        private.checked_text(field, value, 200)
      when field in ('names', 'names_exclude', 'types', 'types_exclude') then
        private.checked_text_list(field, value)
      when field in ('colors', 'colors_exclude') then
        private.checked_choice_list(field, value, array['W', 'U', 'B', 'R', 'G', 'C'], 1)
      when field = 'identity_subset_of' then
        private.checked_choice_list(field, value, array['W', 'U', 'B', 'R', 'G'], 0)
      when field in ('mana_value_min', 'mana_value_max') then
        private.checked_integer(field, value, 0, 20)
      when field in ('power_min', 'power_max', 'toughness_min', 'toughness_max') then
        private.checked_number(field, value, -99, 99)
      when field in ('keywords', 'keywords_exclude') then
        private.checked_catalog_values(field, value, 'keyword')
      when field in ('sets', 'sets_exclude') then
        private.checked_catalog_values(field, value, 'set')
      when field in ('price_min', 'price_max') then
        private.checked_price(field, value)
      when field = 'price_currency' then
        private.checked_choice(field, value, enum_range(null::public.price_currency)::text[])
      when field in ('tags', 'tags_exclude') then
        private.checked_tag_slugs(field, value)
      when field in ('rarities', 'rarities_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_rarity)::text[], 1)
      when field in ('is_commander', 'is_game_changer', 'include_oracle_text') then
        private.checked_boolean(field, value)
      when api = 'collection' and field in ('finishes', 'finishes_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_finish)::text[], 1)
      when api = 'collection' and field in ('conditions', 'conditions_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_condition)::text[], 1)
      when api = 'collection' and field in ('languages', 'languages_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_language)::text[], 1)
      when api = 'collection' and field in ('deck_ids', 'deck_ids_exclude') then
        private.checked_deck_ids(field, value)
      when api = 'collection' and field in ('is_free', 'is_protected') then
        private.checked_boolean(field, value)
      when api = 'collection' and field in ('user_tags', 'user_tags_exclude') then
        private.checked_user_tag_names(field, value)
      when api = 'collection' and field = 'rows' then
        private.checked_choice(field, value, array['entries', 'copies'])
      when field = 'sort' then
        private.checked_choice(
          field,
          value,
          array['relevance', 'name', 'mana_value', 'edhrec_rank', 'price', 'release_date']
            || case when api = 'collection' then array['added'] else '{}'::text[] end
        )
      when field = 'sort_order' then
        private.checked_choice(field, value, array['asc', 'desc'])
      when field = 'limit' then
        private.checked_integer(field, value, 1, case when query ->> 'rows' = 'copies' then 120 else 50 end)
      when field = 'cursor' then
        case when jsonb_typeof(value) in ('string', 'null') then value end
    end;
    if checked_value is null then
      if field = 'cursor' then
        perform private.invalid_argument(field, 'cursor must be a string or null.');
      else
        perform private.invalid_argument(field, format('%s is not a known field.', field));
      end if;
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  foreach bound in array array['mana_value', 'power', 'toughness', 'price'] loop
    if (checked ->> (bound || '_min'))::numeric > (checked ->> (bound || '_max'))::numeric then
      perform private.invalid_argument(
        bound || '_max',
        format('%s_max must not be less than %s_min.', bound, bound)
      );
    end if;
  end loop;

  checked := jsonb_build_object(
    'sort', case when api = 'collection' or checked ? 'text' then 'relevance' else 'name' end,
    'limit', case when checked ->> 'rows' = 'copies' then 60 else 20 end,
    'price_currency', 'USD'
  ) || case when api = 'collection' then jsonb_build_object('rows', 'entries') else '{}' end || checked;
  if api = 'catalog' and checked ->> 'sort' = 'relevance' and not checked ? 'text' then
    perform private.invalid_argument('sort', 'sort can be relevance only when text is set.');
  end if;

  return jsonb_build_object(
    'sort_order', case when checked ->> 'sort' in ('relevance', 'added') then 'desc' else 'asc' end
  ) || checked;
end;
$$;

create or replace function private.collection_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := private.card_filter_conditions(checked)
    || private.printing_filter_conditions(checked, '(%s)');
  user_tags_of_copy constant text :=
    'select 1 from public.copy_user_tags link '
    'join public.user_tags user_tag on user_tag.user_id = link.user_id and user_tag.id = link.user_tag_id '
    'where link.user_id = a.user_id and link.copy_id = a.copy_id';
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
      format('private.finish_price_cents(price, a.finish, %L)', checked ->> 'price_currency'),
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
$$;
