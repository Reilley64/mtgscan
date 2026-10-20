CREATE OR REPLACE FUNCTION private.plan_warnings (
  owner_id              uuid,
  chosen_deck_id        uuid,
  effect                jsonb,
  outgoing_is_commander boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  evaluation public.deck_evaluations;
  warnings jsonb := '[]';
begin
  select * into evaluation
    from public.deck_evaluations stored
    where stored.user_id = owner_id and stored.deck_id = chosen_deck_id;

  if effect is not null then
    warnings := warnings || jsonb_build_object('code', 'would_break_validity', 'effect', effect);
  end if;
  if outgoing_is_commander then
    warnings := warnings || jsonb_build_object('code', 'replaces_commander');
  end if;
  if (private.deck_evaluation_staleness(evaluation) ->> 'bracket_stale')::boolean then
    warnings := warnings || jsonb_build_object('code', 'rules_stale');
  end if;
  return warnings;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."plan_warnings"(uuid, uuid, jsonb, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."plan_warnings"(uuid, uuid, jsonb, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."plan_warnings"(uuid, uuid, jsonb, boolean) TO "postgres";
