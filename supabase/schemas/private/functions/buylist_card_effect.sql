CREATE OR REPLACE FUNCTION private.buylist_card_effect (
  owner_id           uuid,
  chosen_deck_id     uuid,
  card_oracle_id     uuid,
  as_commander       boolean,
  outgoing_copy_id   uuid,
  outgoing_oracle_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.swap_effect(
    owner_id,
    chosen_deck_id,
    jsonb_build_object('card_printing_id', private.default_printing_id(card_oracle_id), 'as_commander', buylist_card_effect.as_commander),
    outgoing_copy_id,
    outgoing_oracle_id
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."buylist_card_effect"(uuid, uuid, uuid, boolean, uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."buylist_card_effect"(uuid, uuid, uuid, boolean, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."buylist_card_effect"(uuid, uuid, uuid, boolean, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."buylist_card_effect"(uuid, uuid, uuid, boolean, uuid, uuid) TO "postgres";
