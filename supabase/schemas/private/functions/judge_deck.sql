CREATE OR REPLACE FUNCTION private.judge_deck (
  contents jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  commander_count integer;
  card_count integer;
  violations jsonb := '[]';
  undetermined jsonb := '[]';
  singleton jsonb;
  color_identity jsonb;
  legality jsonb;
  eligibility jsonb;
  partner jsonb;
begin
  select count(*) filter (where copy.role = 'commander'), count(*)
    into commander_count, card_count
    from jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, card_printing_id uuid, role public.deck_role);
  card_count := card_count + (
    select coalesce(sum(land.count), 0)
    from jsonb_to_recordset(contents -> 'basic_lands') as land(oracle_id uuid, count integer)
  );

  if commander_count = 0 then
    violations := violations || private.violation('no_commander', 'CR 903.3', 'This deck has no commander.', null);
  end if;
  eligibility := private.judge_commander_eligibility(contents);
  violations := violations || (eligibility -> 'violations');
  undetermined := undetermined || (eligibility -> 'undetermined');
  partner := private.judge_partner(contents);
  violations := violations || (partner -> 'violations');
  undetermined := undetermined || (partner -> 'undetermined');
  if card_count <> 100 then
    violations := violations || private.violation(
      'deck_size',
      'CR 903.5a',
      format('%s of 100 cards.', card_count),
      case
        when card_count < 100 then format('Add %s.', private.card_count_label(100 - card_count))
        else format('Remove %s.', private.card_count_label(card_count - 100))
      end
    );
  end if;
  singleton := private.judge_singleton(contents);
  violations := violations || (singleton -> 'violations');
  undetermined := undetermined || (singleton -> 'undetermined');
  color_identity := private.judge_color_identity(contents);
  violations := violations || (color_identity -> 'violations');
  undetermined := undetermined || (color_identity -> 'undetermined');
  legality := private.judge_legality(contents);
  violations := violations || (legality -> 'violations');
  undetermined := undetermined || (legality -> 'undetermined');

  return jsonb_build_object(
    'validity', case
      when jsonb_array_length(violations) > 0 then 'invalid'
      when jsonb_array_length(undetermined) > 0 then 'cannot_be_determined'
      else 'valid'
    end,
    'violations', violations,
    'undetermined', undetermined,
    'chosen_color', color_identity -> 'chosen_color',
    'catalog_at', (select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'catalog')
  ) || private.judge_estimated_bracket(contents);
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."judge_deck"(jsonb) TO "authenticated", "deck_evaluator";

REVOKE ALL ON FUNCTION "private"."judge_deck"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."judge_deck"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."judge_deck"(jsonb) TO "postgres";
