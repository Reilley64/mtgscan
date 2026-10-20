CREATE OR REPLACE FUNCTION private.locked_buylist_card (
  owner_id               uuid,
  chosen_buylist_card_id uuid,
  changeable_statuses    public.buylist_card_status[]
)
  RETURNS public.buylist_cards
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  card public.buylist_cards;
begin
  select * into card from public.buylist_cards found where found.user_id = owner_id and found.id = chosen_buylist_card_id;
  if card.id is null then
    perform private.raise_search_error('not_found', 'buylist_card_id is not one of your buylist cards.', 'buylist_card_id');
  end if;
  perform private.lock_deck(owner_id, card.deck_id);
  select * into card from public.buylist_cards found where found.user_id = owner_id and found.id = chosen_buylist_card_id for update;
  if not card.status = any(changeable_statuses) then
    perform private.raise_search_error(
      'not_open',
      format('The buylist card is %s. Only an open buylist card can change.', card.status),
      'buylist_card_id'
    );
  end if;
  return card;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."locked_buylist_card"(uuid, uuid, public.buylist_card_status[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."locked_buylist_card"(uuid, uuid, public.buylist_card_status[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."locked_buylist_card"(uuid, uuid, public.buylist_card_status[]) TO "postgres";
