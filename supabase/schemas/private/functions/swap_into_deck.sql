CREATE OR REPLACE FUNCTION private.swap_into_deck (
  owner_id              uuid,
  chosen_deck_id        uuid,
  incoming              public.copies,
  incoming_oracle_id    uuid,
  incoming_as_commander boolean,
  outgoing_copy_id      uuid,
  outgoing_oracle_id    uuid,
  change_kind           public.deck_change_kind,
  change_reason         text,
  field                 text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  outgoing_card public.deck_cards;
  change_id uuid;
begin
  delete from public.deck_cards card
    where card.user_id = owner_id and card.deck_id = chosen_deck_id and card.copy_id = swap_into_deck.outgoing_copy_id
    returning * into outgoing_card;
  if incoming_as_commander then
    perform private.commander_count_under_limit(owner_id, chosen_deck_id, field);
  end if;
  if incoming.id is not null then
    insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
      values (owner_id, chosen_deck_id, incoming.id, case when incoming_as_commander then now() end);
  end if;

  change_id := private.record_deck_change(owner_id, chosen_deck_id, change_kind);
  update public.deck_changes change
    set reason = change_reason
    where change.user_id = owner_id and change.id = change_id;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select
      owner_id,
      change_id,
      incoming.id,
      incoming.card_printing_id,
      incoming.finish,
      null,
      case when incoming_as_commander then 'commander' else 'main' end::public.deck_role
    where incoming.id is not null;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select owner_id, change_id, copy.id, copy.card_printing_id, copy.finish, private.deck_role(outgoing_card.commander_at), null
    from public.copies copy
    where copy.user_id = owner_id and copy.id = outgoing_card.copy_id;

  insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
    select owner_id, change_id, land.oracle_id, coalesce(stored.count, 0), coalesce(stored.count, 0) + land.change
    from (
      values
        (case when incoming.id is null then incoming_oracle_id end, 1),
        (case when outgoing_copy_id is null then outgoing_oracle_id end, -1)
    ) land(oracle_id, change)
    left join public.deck_basic_lands stored
      on stored.user_id = owner_id and stored.deck_id = chosen_deck_id and stored.oracle_id = land.oracle_id
    where land.oracle_id is not null and coalesce(stored.count, 0) + land.change >= 0;
  delete from public.deck_basic_lands stored
    using public.deck_change_basic_lands line
    where stored.user_id = owner_id
      and stored.deck_id = chosen_deck_id
      and line.user_id = owner_id
      and line.deck_change_id = change_id
      and line.oracle_id = stored.oracle_id;
  insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
    select owner_id, chosen_deck_id, line.oracle_id, line.count_after
    from public.deck_change_basic_lands line
    where line.user_id = owner_id and line.deck_change_id = change_id and line.count_after > 0;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."swap_into_deck"(uuid, uuid, public.copies, uuid, boolean, uuid, uuid, public.deck_change_kind, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."swap_into_deck"(uuid, uuid, public.copies, uuid, boolean, uuid, uuid, public.deck_change_kind, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."swap_into_deck"(uuid, uuid, public.copies, uuid, boolean, uuid, uuid, public.deck_change_kind, text, text) TO "postgres";
