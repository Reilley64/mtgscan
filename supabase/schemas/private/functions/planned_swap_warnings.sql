CREATE OR REPLACE FUNCTION private.planned_swap_warnings (
  owner_id uuid,
  swap     private.new_planned_swap
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.plan_warnings(
    owner_id,
    swap.deck_id,
    private.planned_swap_effect(
      owner_id,
      swap.deck_id,
      swap.incoming_copy_id,
      swap.incoming_oracle_id,
      swap.as_commander,
      swap.outgoing_copy_id,
      swap.outgoing_oracle_id
    ),
    swap.outgoing_is_commander
  );
$function$;

REVOKE ALL ON FUNCTION "private"."planned_swap_warnings"(uuid, private.new_planned_swap) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."planned_swap_warnings"(uuid, private.new_planned_swap) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."planned_swap_warnings"(uuid, private.new_planned_swap) TO "postgres";
