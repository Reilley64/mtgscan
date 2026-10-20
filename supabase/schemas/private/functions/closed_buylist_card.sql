CREATE OR REPLACE FUNCTION private.closed_buylist_card (
  owner_id uuid,
  request  jsonb,
  note     public.close_note
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  card public.buylist_cards;
begin
  checked := private.check_request(request, array['buylist_card_id']);
  card := private.locked_buylist_card(
    owner_id,
    (checked ->> 'buylist_card_id')::uuid,
    array['open', 'closed']::public.buylist_card_status[]
  );
  if card.status = 'open' then
    update public.buylist_cards closed
      set status = 'closed', close_note = note, status_changed_at = now()
      where closed.user_id = owner_id and closed.id = card.id;
  end if;
  return jsonb_build_object('id', card.id, 'changed', card.status = 'open');
end;
$function$;

REVOKE ALL ON FUNCTION "private"."closed_buylist_card"(uuid, jsonb, public.close_note) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."closed_buylist_card"(uuid, jsonb, public.close_note) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."closed_buylist_card"(uuid, jsonb, public.close_note) TO "postgres";
