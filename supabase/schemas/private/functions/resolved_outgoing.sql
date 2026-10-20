CREATE OR REPLACE FUNCTION private.resolved_outgoing (
  owner_id       uuid,
  field          text,
  chosen_deck_id uuid,
  outgoing       jsonb,
  OUT            outgoing_copy_id uuid,
  OUT            outgoing_oracle_id uuid,
  OUT            outgoing_is_commander boolean
)
  RETURNS record
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  outgoing_is_commander := false;
  if outgoing is null then
    return;
  end if;
  if outgoing ? 'basic_land_oracle_id' then
    outgoing_oracle_id := (outgoing ->> 'basic_land_oracle_id')::uuid;
    if not private.is_basic_land_card(outgoing_oracle_id) then
      perform private.invalid_argument(
        field || '.outgoing.basic_land_oracle_id',
        format('%s.outgoing.basic_land_oracle_id is not a basic land card.', field)
      );
    end if;
    if not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, null, outgoing_oracle_id) then
      perform private.raise_search_error(
        'outgoing_not_in_deck',
        format('%s.outgoing.basic_land_oracle_id is not in the deck. Read the deck again.', field),
        field || '.outgoing.basic_land_oracle_id'
      );
    end if;
    return;
  end if;

  outgoing_copy_id := (outgoing ->> 'copy_id')::uuid;
  select printing.oracle_id, deck_card.commander_at is not null
    into outgoing_oracle_id, outgoing_is_commander
    from public.copies copy
    join public.card_printings printing on printing.id = copy.card_printing_id
    left join public.deck_cards deck_card
      on deck_card.user_id = copy.user_id and deck_card.copy_id = copy.id and deck_card.deck_id = chosen_deck_id
    where copy.user_id = owner_id and copy.id = resolved_outgoing.outgoing_copy_id;
  if outgoing_oracle_id is null then
    perform private.raise_search_error(
      'not_found',
      format('%s.outgoing.copy_id is not a copy in your collection.', field),
      field || '.outgoing.copy_id'
    );
  end if;
  if not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, outgoing_copy_id, outgoing_oracle_id) then
    perform private.raise_search_error(
      'outgoing_not_in_deck',
      format('%s.outgoing.copy_id is not in the deck. Read the deck again.', field),
      field || '.outgoing.copy_id'
    );
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."resolved_outgoing"(uuid, text, uuid, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."resolved_outgoing"(uuid, text, uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."resolved_outgoing"(uuid, text, uuid, jsonb) TO "postgres";
