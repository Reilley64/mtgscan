CREATE OR REPLACE FUNCTION public.create_planned_swaps (
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
  replayed jsonb;
  swaps private.new_planned_swap[] := '{}';
  item_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['idempotency_key', 'planned_swaps']);
  replayed := private.replayed_ai_write(caller, request);
  if replayed is not null then
    return replayed;
  end if;

  perform 1
    from public.decks locked_deck
    where locked_deck.user_id = caller
      and locked_deck.id in (select (item ->> 'deck_id')::uuid from jsonb_array_elements(checked -> 'planned_swaps') item)
    order by locked_deck.id
    for update;
  perform 1
    from public.copies held
    where held.user_id = caller
      and held.id in (select (item -> 'incoming' ->> 'copy_id')::uuid from jsonb_array_elements(checked -> 'planned_swaps') item)
    order by held.id
    for update;

  for item_index in 0 .. jsonb_array_length(checked -> 'planned_swaps') - 1 loop
    swaps := swaps || private.resolved_planned_swap(caller, item_index, checked -> 'planned_swaps' -> item_index);
  end loop;
  perform private.check_duplicate_plans(caller, 'planned_swaps', (select jsonb_agg(to_jsonb(swap)) from unnest(swaps) swap));

  result := jsonb_build_object(
    'planned_swaps', (
      select jsonb_agg(
        jsonb_build_object(
          'ref', swap.ref,
          'planned_swap_id', swap.planned_swap_id,
          'warnings', private.planned_swap_warnings(caller, swap)
        )
        order by swap.index
      )
      from unnest(swaps) swap
    ),
    'replayed', false
  );

  insert into public.planned_swaps (
    id, user_id, deck_id, incoming_copy_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason
  )
  select
    swap.planned_swap_id, caller, swap.deck_id, swap.incoming_copy_id, swap.incoming_oracle_id, swap.as_commander,
    swap.outgoing_copy_id, swap.outgoing_oracle_id, swap.reason
  from unnest(swaps) swap;

  return private.save_ai_write(caller, request, result);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_planned_swaps"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_planned_swaps"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_planned_swaps"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_planned_swaps"(jsonb) FROM PUBLIC, "anon", "service_role";
