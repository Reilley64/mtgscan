CREATE OR REPLACE FUNCTION private.swap_in (
  owner_id uuid,
  swap     public.planned_swaps,
  field    text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  held_copy public.copies;
begin
  select * into held_copy from public.copies copy where copy.user_id = owner_id and copy.id = swap.incoming_copy_id for update;

  perform private.swap_into_deck(
    owner_id,
    swap.deck_id,
    held_copy,
    swap.incoming_oracle_id,
    swap.as_commander,
    swap.outgoing_copy_id,
    swap.outgoing_oracle_id,
    'swapped_in',
    swap.reason,
    field
  );
  update public.planned_swaps planned
    set status = 'swapped_in', status_changed_at = now()
    where planned.user_id = owner_id and planned.id = swap.id;
  perform private.finish_deck_change(owner_id, swap.deck_id);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."swap_in"(uuid, public.planned_swaps, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."swap_in"(uuid, public.planned_swaps, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."swap_in"(uuid, public.planned_swaps, text) TO "postgres";
