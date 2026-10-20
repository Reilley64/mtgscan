CREATE OR REPLACE FUNCTION private.move_planned_swaps_to_buylist (
  owner_id      uuid,
  held_copy_ids uuid[],
  note          public.close_note
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  with moved as (
    update public.planned_swaps swap
      set status = 'moved_to_buylist', close_note = note, status_changed_at = now()
      where swap.user_id = owner_id and swap.incoming_copy_id = any (held_copy_ids) and swap.status = 'open'
      returning swap.*
  )
  insert into public.buylist_cards (
    user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason, created_at
  )
  select
    moved.user_id,
    moved.deck_id,
    moved.incoming_oracle_id,
    moved.as_commander,
    moved.outgoing_copy_id,
    moved.outgoing_oracle_id,
    moved.reason,
    moved.created_at
  from moved
  where not exists (
    select
    from public.buylist_cards saved
    where saved.user_id = moved.user_id
      and saved.deck_id = moved.deck_id
      and saved.status = 'open'
      and private.planned_swap_identity(to_jsonb(saved)) = private.planned_swap_identity(to_jsonb(moved))
  );
$function$;

REVOKE ALL ON FUNCTION "private"."move_planned_swaps_to_buylist"(uuid, uuid[], public.close_note) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."move_planned_swaps_to_buylist"(uuid, uuid[], public.close_note) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."move_planned_swaps_to_buylist"(uuid, uuid[], public.close_note) TO "postgres";
