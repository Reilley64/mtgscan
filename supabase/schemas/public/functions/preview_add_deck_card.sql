CREATE OR REPLACE FUNCTION public.preview_add_deck_card (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
  chosen_copy public.copies;
  basic_land jsonb;
begin
  caller := private.caller_user_id();
  checked := private.checked_object(null, query, '{}', array['copy_id', 'basic_land_oracle_id', 'count']);
  if checked ? 'copy_id' and checked ? 'basic_land_oracle_id' then
    perform private.invalid_argument('basic_land_oracle_id', 'basic_land_oracle_id must be left out with copy_id.');
  end if;
  if not checked ? 'copy_id' and not checked ? 'basic_land_oracle_id' then
    perform private.invalid_argument('copy_id', 'copy_id or basic_land_oracle_id is required.');
  end if;
  if checked ? 'count' and not checked ? 'basic_land_oracle_id' then
    perform private.invalid_argument('count', 'count is only for a basic land.');
  end if;

  if checked ? 'basic_land_oracle_id' then
    if not private.is_basic_land_card((checked ->> 'basic_land_oracle_id')::uuid) then
      perform private.invalid_argument('basic_land_oracle_id', 'basic_land_oracle_id is not a basic land card.');
    end if;
    basic_land := jsonb_build_object(
      'basic_land_oracle_id', checked -> 'basic_land_oracle_id',
      'count', coalesce(checked -> 'count', '1')
    );
    return jsonb_build_object('items', coalesce((
      select jsonb_agg(
        jsonb_build_object('deck_id', deck.id, 'effect', private.swap_effect(caller, deck.id, basic_land, null, null))
        order by deck.id
      )
      from public.decks deck
    ), '[]'::jsonb));
  end if;

  select * into chosen_copy from public.copies copy where copy.id = (checked ->> 'copy_id')::uuid;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'deck_id', deck.id,
        'effect', private.deck_change_effect(
          evaluation,
          private.judge_deck(jsonb_set(
            contents,
            '{copies}',
            contents -> 'copies' || jsonb_build_array(jsonb_build_object(
              'copy_id', chosen_copy.id,
              'card_printing_id', chosen_copy.card_printing_id,
              'role', 'main'
            ))
          ))
        )
      )
      order by deck.id
    )
    from public.decks deck
    left join public.deck_evaluations evaluation on evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
    cross join lateral private.deck_contents(caller, deck.id) contents
  ), '[]'::jsonb));
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."preview_add_deck_card"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."preview_add_deck_card"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_add_deck_card"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."preview_add_deck_card"(jsonb) FROM PUBLIC, "anon", "service_role";
