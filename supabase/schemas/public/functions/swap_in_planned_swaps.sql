CREATE OR REPLACE FUNCTION public.swap_in_planned_swaps (
  request jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  requested_ids uuid[];
  item_index bigint;
  found_id uuid;
  found_status public.planned_swap_status;
  swap public.planned_swaps;
  swapped_in uuid[] := '{}';
  closed uuid[] := '{}';
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'planned_swap_ids']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  requested_ids := array(select jsonb_array_elements_text(checked -> 'planned_swap_ids')::uuid);

  perform private.lock_deck(caller, chosen_deck_id);
  perform 1
    from public.planned_swaps planned
    where planned.user_id = caller and planned.deck_id = chosen_deck_id and planned.id = any(requested_ids)
    order by planned.id
    for update;
  for item_index, found_id, found_status in
    select listed.ordinality - 1, planned.id, planned.status
    from unnest(requested_ids) with ordinality listed(id, ordinality)
    left join public.planned_swaps planned
      on planned.user_id = caller and planned.deck_id = chosen_deck_id and planned.id = listed.id
    order by listed.ordinality
  loop
    if found_id is null then
      perform private.raise_search_error(
        'not_found',
        format('planned_swap_ids[%s] is not one of your planned swaps in this deck.', item_index),
        format('planned_swap_ids[%s]', item_index)
      );
    end if;
    if found_status <> 'open' then
      perform private.raise_search_error(
        'not_open',
        format('The planned swap is %s. Only an open planned swap can change.', found_status),
        format('planned_swap_ids[%s]', item_index)
      );
    end if;
  end loop;
  perform 1
    from public.copies copy
    join public.planned_swaps planned on planned.user_id = copy.user_id and planned.incoming_copy_id = copy.id
    where copy.user_id = caller and planned.id = any(requested_ids)
    order by copy.id
    for update of copy;

  for swap in
    select * from public.planned_swaps planned
    where planned.user_id = caller and planned.id = any(requested_ids)
    order by planned.created_at, planned.id
  loop
    if (select planned.status from public.planned_swaps planned where planned.user_id = caller and planned.id = swap.id) = 'closed' then
      closed := closed || swap.id;
    else
      perform private.swap_in(caller, swap, format('planned_swap_ids[%s]', array_position(requested_ids, swap.id) - 1));
      swapped_in := swapped_in || swap.id;
    end if;
  end loop;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id),
    'swapped_in', to_jsonb(swapped_in),
    'closed', to_jsonb(closed)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."swap_in_planned_swaps"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."swap_in_planned_swaps"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."swap_in_planned_swaps"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."swap_in_planned_swaps"(jsonb) FROM PUBLIC, "anon", "service_role";
