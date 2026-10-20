CREATE OR REPLACE FUNCTION private.judge_estimated_bracket (
  contents jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  game_changers jsonb;
  missing_signal_count integer;
  mass_land_denial jsonb;
  combos jsonb;
  extra_turns jsonb;
  signals jsonb;
begin
  select private.ordered_cards(coalesce(jsonb_agg(deck_card.card) filter (where card.is_game_changer), '[]'::jsonb)),
      count(*) filter (where card.is_game_changer is null)
    into game_changers, missing_signal_count
    from private.deck_evaluation_cards(contents) deck_card
    join public.cards card on card.oracle_id = deck_card.oracle_id;
  mass_land_denial := private.tagged_deck_cards(contents, 'mass-land-denial');
  combos := private.deck_combos(contents);
  extra_turns := private.tagged_deck_cards(contents, 'extra-turn');

  signals := jsonb_build_array(private.bracket_signal(
    'game_changers',
    'official',
    jsonb_array_length(game_changers),
    case when jsonb_array_length(game_changers) = 0 then 2 when jsonb_array_length(game_changers) <= 3 then 3 else 4 end,
    game_changers
  ));
  if jsonb_array_length(mass_land_denial) > 0 then
    signals := signals || private.bracket_signal('mass_land_denial', 'heuristic', jsonb_array_length(mass_land_denial), 4, mass_land_denial);
  end if;
  if jsonb_array_length(combos) > 0 then
    signals := signals || (
      private.bracket_signal(
        'two_card_combo',
        'heuristic',
        jsonb_array_length(combos),
        (select max(private.combo_lowest_bracket((combo ->> 'bracket_tag')::public.combo_bracket_tag))
          from jsonb_array_elements(combos) combo),
        (select private.ordered_cards(jsonb_agg(distinct card.value))
          from jsonb_array_elements(combos) combo, jsonb_array_elements(combo -> 'cards') card)
      ) || jsonb_build_object('combos', combos)
    );
  end if;
  if jsonb_array_length(extra_turns) > 0 then
    signals := signals || private.bracket_signal(
      'extra_turns',
      'heuristic',
      jsonb_array_length(extra_turns),
      case when jsonb_array_length(extra_turns) <= 3 then 2 else 4 end,
      extra_turns
    );
  end if;

  return jsonb_build_object(
    'estimated_bracket', (select max((signal ->> 'lowest_bracket')::integer) from jsonb_array_elements(signals) signal),
    'bracket_signals', signals,
    'missing_signal_count', missing_signal_count,
    'oracle_tags_at', (select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'oracle_tags'),
    'commander_spellbook_at', (
      select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'commander_spellbook'
    )
  );
end;
$function$;

REVOKE ALL ON FUNCTION "private"."judge_estimated_bracket"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."judge_estimated_bracket"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."judge_estimated_bracket"(jsonb) TO "postgres";
