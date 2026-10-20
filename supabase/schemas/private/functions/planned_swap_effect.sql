CREATE OR REPLACE FUNCTION private.planned_swap_effect (
  owner_id           uuid,
  chosen_deck_id     uuid,
  held_copy_id       uuid,
  incoming_oracle_id uuid,
  as_commander       boolean,
  outgoing_copy_id   uuid,
  outgoing_oracle_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select case
    when held_copy_id is null then private.swap_effect(
      owner_id,
      chosen_deck_id,
      jsonb_build_object('basic_land_oracle_id', incoming_oracle_id),
      outgoing_copy_id,
      outgoing_oracle_id
    )
    else (
      select private.swap_effect(
        owner_id,
        chosen_deck_id,
        jsonb_build_object('copy_id', held.id, 'card_printing_id', held.card_printing_id, 'as_commander', planned_swap_effect.as_commander),
        outgoing_copy_id,
        outgoing_oracle_id
      )
      from public.copies held
      where held.user_id = owner_id and held.id = held_copy_id
    )
  end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."planned_swap_effect"(uuid, uuid, uuid, uuid, boolean, uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."planned_swap_effect"(uuid, uuid, uuid, uuid, boolean, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."planned_swap_effect"(uuid, uuid, uuid, uuid, boolean, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."planned_swap_effect"(uuid, uuid, uuid, uuid, boolean, uuid, uuid) TO "postgres";
