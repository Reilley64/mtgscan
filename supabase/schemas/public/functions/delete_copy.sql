CREATE OR REPLACE FUNCTION public.delete_copy (
  request jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
  chosen_copy_id uuid;
  removed public.deck_cards;
  held record;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.checked_object(null, request, array['copy_id'], array['move_planned_swap']);
  chosen_copy_id := (checked ->> 'copy_id')::uuid;

  perform private.lock_planned_swaps_holding(caller, array[chosen_copy_id]);
  removed := private.lock_deck_of_copy(caller, chosen_copy_id);
  select card.name, deck.name as deck_name into held
    from public.planned_swaps swap
    join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id
    join public.cards card on card.oracle_id = swap.incoming_oracle_id
    where swap.user_id = caller and swap.incoming_copy_id = chosen_copy_id and swap.status = 'open';
  if held.name is not null then
    if not coalesce((checked ->> 'move_planned_swap')::boolean, false) then
      perform private.raise_search_error(
        'copy_held',
        format(
          '%s is held by the planned swap for %s. Send move_planned_swap: true to move that planned swap to the buylist and delete the copy.',
          held.name,
          held.deck_name
        ),
        'move_planned_swap'
      );
    end if;
    perform private.move_planned_swaps_to_buylist(caller, array[chosen_copy_id], 'held_copy_deleted');
  end if;
  if removed.copy_id is not null then
    perform private.remove_from_deck(caller, removed, 'removed_from_collection');
  end if;

  delete from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."delete_copy"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_copy"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_copy"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."delete_copy"(jsonb) FROM PUBLIC, "anon", "service_role";
