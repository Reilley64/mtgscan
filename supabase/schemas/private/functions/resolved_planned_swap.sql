CREATE OR REPLACE FUNCTION private.resolved_planned_swap (
  owner_id   uuid,
  item_index integer,
  checked    jsonb
)
  RETURNS private.new_planned_swap
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  field text := format('planned_swaps[%s]', item_index);
  resolved private.new_planned_swap;
  deck public.decks := private.resolved_plan_deck(owner_id, 'planned_swaps', item_index, checked);
  incoming private.collection_availability;
begin
  if checked -> 'incoming' ? 'basic_land_oracle_id' then
    resolved.incoming_oracle_id := (checked -> 'incoming' ->> 'basic_land_oracle_id')::uuid;
    if not private.is_basic_land_card(resolved.incoming_oracle_id) then
      perform private.invalid_argument(
        field || '.incoming.basic_land_oracle_id',
        format('%s.incoming.basic_land_oracle_id is not a basic land card.', field)
      );
    end if;
  else
    select * into incoming
      from private.collection_availability a
      where a.user_id = owner_id and a.copy_id = (checked -> 'incoming' ->> 'copy_id')::uuid;
    if incoming.copy_id is null then
      perform private.raise_search_error(
        'not_found',
        format('%s.incoming.copy_id is not a copy in your collection.', field),
        field || '.incoming.copy_id'
      );
    end if;
    if not incoming.is_free then
      perform private.raise_search_error(
        'copy_not_free',
        format('%s.incoming.copy_id is in a deck or held by another planned swap. Choose a free copy.', field),
        field || '.incoming.copy_id'
      );
    end if;
    if incoming.is_protected then
      perform private.raise_search_error(
        'protected_copy',
        format('%s.incoming.copy_id is a protected copy. Choose another copy, or ask the user to unprotect it.', field),
        field || '.incoming.copy_id'
      );
    end if;
    resolved.incoming_copy_id := incoming.copy_id;
    resolved.incoming_oracle_id := incoming.oracle_id;
  end if;

  resolved.index := item_index;
  resolved.planned_swap_id := gen_random_uuid();
  resolved.ref := checked ->> 'ref';
  resolved.deck_id := deck.id;
  resolved.reason := checked ->> 'reason';
  select outgoing.outgoing_copy_id, outgoing.outgoing_oracle_id, outgoing.outgoing_is_commander
    into resolved.outgoing_copy_id, resolved.outgoing_oracle_id, resolved.outgoing_is_commander
    from private.resolved_outgoing(owner_id, field, deck.id, checked -> 'outgoing') outgoing;
  resolved.as_commander := resolved.incoming_copy_id is not null
    and coalesce((checked -> 'incoming' ->> 'as_commander')::boolean, resolved.outgoing_is_commander);
  return resolved;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."resolved_planned_swap"(uuid, integer, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."resolved_planned_swap"(uuid, integer, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."resolved_planned_swap"(uuid, integer, jsonb) TO "postgres";
