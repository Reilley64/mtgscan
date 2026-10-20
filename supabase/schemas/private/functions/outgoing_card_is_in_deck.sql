CREATE OR REPLACE FUNCTION private.outgoing_card_is_in_deck (
  owner_id           uuid,
  chosen_deck_id     uuid,
  outgoing_copy_id   uuid,
  outgoing_oracle_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select case
    when outgoing_copy_id is not null then exists (
      select 1
      from public.deck_cards deck_card
      where deck_card.user_id = owner_id and deck_card.deck_id = chosen_deck_id and deck_card.copy_id = outgoing_copy_id
    )
    when outgoing_oracle_id is not null then exists (
      select 1
      from public.deck_basic_lands basic_land
      where basic_land.user_id = owner_id and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = outgoing_oracle_id
    )
    else true
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."outgoing_card_is_in_deck"(uuid, uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."outgoing_card_is_in_deck"(uuid, uuid, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."outgoing_card_is_in_deck"(uuid, uuid, uuid, uuid) TO "postgres";
