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
      when api = 'collection' and field in ('is_free', 'is_protected', 'is_allocated') then
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
        private.checked_integer(
          field,
          value,
          1,
          case when query ->> 'rows' = 'copies' then 120 when api = 'collection' then 100 else 50 end
        )
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
    'limit', case when checked ->> 'rows' = 'copies' then 60 else 20 end
  ) || case when api = 'collection' then jsonb_build_object('rows', 'entries') else '{}' end || checked;
  if api = 'catalog' and checked ->> 'sort' = 'relevance' and not checked ? 'text' then
    perform private.invalid_argument('sort', 'sort can be relevance only when text is set.');
  end if;

  return jsonb_build_object(
    'sort_order', case when checked ->> 'sort' in ('relevance', 'added') then 'desc' else 'asc' end
  ) || checked;
end;
$$;
