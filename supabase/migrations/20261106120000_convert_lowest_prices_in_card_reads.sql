drop function private.card_details_row(public.cards, public.card_printings);

create function private.card_details_row(card public.cards, printing public.card_printings, currency text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'oracle_id', card.oracle_id,
    'name', card.name,
    'mana_cost', card.mana_cost,
    'mana_value', card.mana_value,
    'type_line', card.type_line,
    'oracle_text', card.oracle_text,
    'colors', to_jsonb(card.colors),
    'color_identity', to_jsonb(card.color_identity),
    'keywords', to_jsonb(card.keywords),
    'faces', (
      select coalesce(jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'name', f.name,
          'mana_cost', f.mana_cost,
          'type_line', f.type_line,
          'oracle_text', f.oracle_text,
          'colors', to_jsonb(f.colors),
          'power', f.power,
          'toughness', f.toughness,
          'loyalty', f.loyalty
        ))
        order by f.face_index
      ), '[]'::jsonb)
      from public.card_faces f
      where f.oracle_id = card.oracle_id
    ),
    'commander_legality', card.commander_legality,
    'can_be_commander', card.can_be_commander,
    'is_game_changer', card.is_game_changer,
    'edhrec_rank', card.edhrec_rank,
    'released_at', card.released_at,
    'printing_count', (
      select count(*)
      from public.card_printings p
      where p.oracle_id = card.oracle_id and p.absent_since is null
    ),
    'price_from', private.price_from(card.oracle_id, card_details_row.currency),
    'owned', private.owned_copies(card.oracle_id),
    'tags', (
      select coalesce(jsonb_agg(
        jsonb_build_object('slug', t.slug, 'label', t.label)
        order by t.label collate "C", t.slug
      ), '[]'::jsonb)
      from public.card_taggings ct
      join public.oracle_tags t on t.id = ct.tag_id
      where ct.oracle_id = card.oracle_id
        and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
    ),
    'combos', (
      select coalesce(jsonb_agg(combo.details order by combo.position), '[]'::jsonb)
      from (
        select
          jsonb_build_object(
            'spellbook_id', c.id,
            'other_card', jsonb_build_object('oracle_id', other.oracle_id, 'name', other.name),
            'produced_features', to_jsonb(c.produced_features),
            'bracket_tag', c.bracket_tag
          ) as details,
          row_number() over (
            order by other.edhrec_rank nulls last, other.name collate "C", c.id collate "C"
          ) as position
        from public.combos c
        join public.cards other on other.oracle_id = case
          when c.first_oracle_id = card.oracle_id then c.second_oracle_id
          else c.first_oracle_id
        end
        where card.oracle_id in (c.first_oracle_id, c.second_oracle_id)
        order by position
        limit 5
      ) combo
    )
  ) || case
    when printing.id is null then '{}'::jsonb
    else jsonb_build_object('printing', private.card_printing_fields(printing))
  end;
$$;

create or replace function private.check_card_details_query(query jsonb)
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
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field in ('oracle_ids', 'printing_ids') then
        private.checked_uuid_list(field, value, 20)
      when field = 'price_currency' then
        private.checked_price_currency(field, value)
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if checked ? 'oracle_ids' and checked ? 'printing_ids' then
    perform private.invalid_argument('printing_ids', 'printing_ids cannot be used together with oracle_ids.');
  end if;
  if not (checked ? 'oracle_ids' or checked ? 'printing_ids') then
    perform private.invalid_argument('oracle_ids', 'Give oracle_ids or printing_ids.');
  end if;
  return jsonb_build_object('price_currency', 'USD') || checked;
end;
$$;

create or replace function public.get_cards(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  data_as_of jsonb;
  prices_as_of jsonb;
  checked jsonb;
  rate public.exchange_rates;
  by_printing boolean;
  id_field text;
  items jsonb;
  not_found jsonb;
begin
  data_as_of := private.rules_freshness();
  checked := private.check_card_details_query(query);
  rate := private.exchange_rate(checked ->> 'price_currency');
  select jsonb_build_object(
    'prices_observed_at', f.snapshot_at,
    'prices_stale', f.is_stale or private.exchange_rate_is_stale(rate)
  ) || jsonb_strip_nulls(jsonb_build_object('rate_date', rate.rate_date))
    into prices_as_of
    from public.catalog_freshness() f
    where f.source = 'prices';
  by_printing := checked ? 'printing_ids';
  id_field := case when by_printing then 'printing_ids' else 'oracle_ids' end;

  select
    coalesce(jsonb_agg(private.card_details_row(c, p, rate.currency) order by r.ordinality) filter (where c.oracle_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(given.id order by r.ordinality) filter (where c.oracle_id is null), '[]'::jsonb)
  into items, not_found
  from jsonb_array_elements_text(checked -> id_field) with ordinality as r(id, ordinality)
  join jsonb_array_elements_text(query -> id_field) with ordinality as given(id, ordinality)
    on given.ordinality = r.ordinality
  left join public.card_printings p on by_printing and p.id = r.id::uuid
  left join public.cards c on c.oracle_id = case when by_printing then p.oracle_id else r.id::uuid end;

  return jsonb_build_object('items', items, 'not_found', not_found) || data_as_of || prices_as_of;
end;
$$;

grant execute on function private.card_details_row(public.cards, public.card_printings, text) to authenticated;
