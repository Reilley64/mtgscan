CREATE OR REPLACE FUNCTION public.get_deck (
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
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_request(query, array['deck_id']);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select private.deck_row(deck) || jsonb_build_object(
    'revision', deck.revision,
    'created_at', deck.created_at,
    'evaluation', (
      select (to_jsonb(evaluation) - 'user_id' - 'deck_id') || jsonb_build_object(
        'validity_rules_data_at', evaluation.catalog_at,
        'bracket_rules_data_at', least(evaluation.catalog_at, evaluation.oracle_tags_at, evaluation.commander_spellbook_at),
        'no_oracle_tag_data', evaluation.oracle_tags_at is null,
        'no_combo_data', evaluation.commander_spellbook_at is null
      ) || private.deck_evaluation_staleness(evaluation)
      from public.deck_evaluations evaluation
      where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
    ),
    'cards', (
      select coalesce(jsonb_agg(
        private.copy_row(a, p, c, price, prices_stale) || jsonb_build_object(
          'role', private.deck_role(deck_card.commander_at),
          'commander_at', deck_card.commander_at,
          'added_at', deck_card.added_at,
          'type_line', c.type_line,
          'mana_value', c.mana_value,
          'colors', to_jsonb(c.colors),
          'planned_out', exists (
            select 1
            from public.planned_swaps swap
            where swap.user_id = deck_card.user_id
              and swap.deck_id = deck_card.deck_id
              and swap.status = 'open'
              and swap.outgoing_copy_id = deck_card.copy_id
          )
        )
        order by c.name, a.copy_id
      ), '[]'::jsonb)
      from public.deck_cards deck_card
      join private.collection_availability a on a.user_id = deck_card.user_id and a.copy_id = deck_card.copy_id
      join public.card_printings p on p.id = a.card_printing_id
      join public.cards c on c.oracle_id = p.oracle_id
      left join public.card_prices price on price.printing_id = p.id
      where deck_card.user_id = deck.user_id and deck_card.deck_id = deck.id
    ),
    'basic_lands', (
      select jsonb_agg(
        jsonb_build_object(
          'oracle_id', land.oracle_id,
          'name', land.name,
          'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb),
          'count', coalesce(basic_land.count, 0)
        )
        order by land.kind_order
      )
      from private.basic_land_cards() land
      left join public.deck_basic_lands basic_land
        on basic_land.user_id = deck.user_id and basic_land.deck_id = deck.id and basic_land.oracle_id = land.oracle_id
    )
  )
    into result
    from public.decks deck
    where deck.id = (checked ->> 'deck_id')::uuid;
  if result is null then
    perform private.raise_deck_not_found();
  end if;
  return result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_deck"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_deck"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_deck"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_deck"(jsonb) FROM PUBLIC, "anon", "service_role";
