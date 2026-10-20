CREATE OR REPLACE FUNCTION private.save_deck_evaluation (
  owner_id       uuid,
  chosen_deck_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  contents jsonb;
  judged jsonb;
begin
  contents := private.deck_contents(owner_id, chosen_deck_id);
  if contents -> 'copies' = '[]'::jsonb and contents -> 'basic_lands' = '[]'::jsonb then
    delete from public.deck_evaluations evaluation
      where evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
    return;
  end if;

  judged := private.judge_deck(contents);
  insert into public.deck_evaluations (
    user_id, deck_id, validity, violations, undetermined, chosen_color, revision, catalog_at, judged_at,
    estimated_bracket, bracket_signals, missing_signal_count, oracle_tags_at, commander_spellbook_at
  )
    select owner_id, chosen_deck_id, (judged ->> 'validity')::public.deck_validity, judged -> 'violations',
      judged -> 'undetermined', judged ->> 'chosen_color', deck.revision, (judged ->> 'catalog_at')::timestamptz, now(),
      (judged ->> 'estimated_bracket')::smallint, judged -> 'bracket_signals', (judged ->> 'missing_signal_count')::integer,
      (judged ->> 'oracle_tags_at')::timestamptz, (judged ->> 'commander_spellbook_at')::timestamptz
    from public.decks deck
    where deck.user_id = owner_id and deck.id = chosen_deck_id
    on conflict (user_id, deck_id) do update
      set validity = excluded.validity,
        violations = excluded.violations,
        undetermined = excluded.undetermined,
        chosen_color = excluded.chosen_color,
        revision = excluded.revision,
        catalog_at = excluded.catalog_at,
        judged_at = excluded.judged_at,
        estimated_bracket = excluded.estimated_bracket,
        bracket_signals = excluded.bracket_signals,
        missing_signal_count = excluded.missing_signal_count,
        oracle_tags_at = excluded.oracle_tags_at,
        commander_spellbook_at = excluded.commander_spellbook_at;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."save_deck_evaluation"(uuid, uuid) TO "deck_evaluator";

REVOKE ALL ON FUNCTION "private"."save_deck_evaluation"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."save_deck_evaluation"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."save_deck_evaluation"(uuid, uuid) TO "postgres";
