CREATE OR REPLACE FUNCTION private.planned_swap_identity (
  swap jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'deck_id', swap -> 'deck_id',
    'incoming_oracle_id', swap -> 'incoming_oracle_id',
    'as_commander', swap -> 'as_commander',
    'outgoing_copy_id', swap -> 'outgoing_copy_id',
    'outgoing_oracle_id', swap -> 'outgoing_oracle_id'
  );
$function$;

REVOKE ALL ON FUNCTION "private"."planned_swap_identity"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."planned_swap_identity"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."planned_swap_identity"(jsonb) TO "postgres";
