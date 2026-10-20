CREATE OR REPLACE FUNCTION private.open_plan_like (
  owner_id uuid,
  plan     jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select coalesce(
    (
      select jsonb_build_object('planned_swap_id', saved.id)
      from public.planned_swaps saved
      where saved.user_id = owner_id
        and saved.deck_id = (plan ->> 'deck_id')::uuid
        and saved.status = 'open'
        and private.planned_swap_identity(to_jsonb(saved)) = private.planned_swap_identity(plan)
      limit 1
    ),
    (
      select jsonb_build_object('buylist_card_id', saved.id)
      from public.buylist_cards saved
      where saved.user_id = owner_id
        and saved.deck_id = (plan ->> 'deck_id')::uuid
        and saved.status = 'open'
        and private.planned_swap_identity(to_jsonb(saved)) = private.planned_swap_identity(plan)
      limit 1
    )
  );
$function$;

REVOKE ALL ON FUNCTION "private"."open_plan_like"(uuid, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."open_plan_like"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."open_plan_like"(uuid, jsonb) TO "postgres";
