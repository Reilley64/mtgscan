CREATE OR REPLACE FUNCTION private.resolved_buylist_card (
  owner_id   uuid,
  item_index integer,
  checked    jsonb
)
  RETURNS private.new_buylist_card
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  field text := format('buylist_cards[%s]', item_index);
  resolved private.new_buylist_card;
  deck public.decks := private.resolved_plan_deck(owner_id, 'buylist_cards', item_index, checked);
  free_copy_ids jsonb;
begin
  resolved.incoming_oracle_id := (checked -> 'incoming' ->> 'oracle_id')::uuid;
  if not exists (select 1 from public.cards card where card.oracle_id = resolved.incoming_oracle_id) then
    perform private.raise_search_error(
      'invalid_card',
      format('%s.incoming.oracle_id is not a card in the card catalog.', field),
      field || '.incoming.oracle_id'
    );
  end if;
  if private.is_basic_land_card(resolved.incoming_oracle_id) then
    perform private.raise_search_error(
      'invalid_card',
      format('%s.incoming.oracle_id is a basic land card. Basic lands are never bought.', field),
      field || '.incoming.oracle_id'
    );
  end if;
  select jsonb_agg(a.copy_id order by a.copy_id)
    into free_copy_ids
    from private.collection_availability a
    where a.user_id = owner_id and a.oracle_id = resolved.incoming_oracle_id and a.is_free and not a.is_protected;
  if free_copy_ids is not null then
    perform private.raise_search_error(
      'free_copy_exists',
      format('%s.incoming.oracle_id has a free copy that is not protected. Make a planned swap with it instead.', field),
      jsonb_build_object('pointer', format('/buylist_cards/%s/incoming/oracle_id', item_index), 'copy_ids', free_copy_ids)::text
    );
  end if;

  resolved.index := item_index;
  resolved.buylist_card_id := gen_random_uuid();
  resolved.ref := checked ->> 'ref';
  resolved.deck_id := deck.id;
  resolved.reason := checked ->> 'reason';
  select outgoing.outgoing_copy_id, outgoing.outgoing_oracle_id, outgoing.outgoing_is_commander
    into resolved.outgoing_copy_id, resolved.outgoing_oracle_id, resolved.outgoing_is_commander
    from private.resolved_outgoing(owner_id, field, deck.id, checked -> 'outgoing') outgoing;
  resolved.as_commander := coalesce((checked -> 'incoming' ->> 'as_commander')::boolean, resolved.outgoing_is_commander);
  return resolved;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."resolved_buylist_card"(uuid, integer, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."resolved_buylist_card"(uuid, integer, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."resolved_buylist_card"(uuid, integer, jsonb) TO "postgres";
