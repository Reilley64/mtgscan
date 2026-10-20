CREATE OR REPLACE FUNCTION public.list_buylist (
  query jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  oldest_first boolean;
  after_created_at timestamptz;
  after_id uuid;
  page_rows jsonb;
begin
  perform private.caller_user_id();
  checked := private.checked_plan_query(query, 'buylist', enum_range(null::public.buylist_card_status)::text[]);
  oldest_first := checked ->> 'order' = 'oldest_first';
  after_created_at := (checked ->> 'after_created_at')::timestamptz;
  after_id := (checked ->> 'after_id')::uuid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'buylist_card_id', card.id,
      'deck_id', card.deck_id,
      'deck_name', deck.name,
      'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri',
      'incoming', private.planned_card_line(card.incoming_oracle_id),
      'outgoing', private.planned_line(card.user_id, card.outgoing_copy_id, card.outgoing_oracle_id),
      'as_commander', card.as_commander,
      'reason', card.reason,
      'status', card.status,
      'close_note', card.close_note,
      'created_at', card.created_at,
      'status_changed_at', card.status_changed_at,
      'effect', case when card.status = 'open' then private.buylist_card_effect(
        card.user_id, card.deck_id, card.incoming_oracle_id, card.as_commander, card.outgoing_copy_id, card.outgoing_oracle_id
      ) end
    )
    order by
      case when oldest_first then card.created_at end,
      case when oldest_first then card.id end,
      card.created_at desc,
      card.id desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.buylist_cards listed
      where (not checked ? 'deck_id' or listed.deck_id = (checked ->> 'deck_id')::uuid)
        and (not checked ? 'status' or listed.status = (checked ->> 'status')::public.buylist_card_status)
        and (
          after_id is null
          or (oldest_first and (listed.created_at, listed.id) > (after_created_at, after_id))
          or (not oldest_first and (listed.created_at, listed.id) < (after_created_at, after_id))
        )
      order by
        case when oldest_first then listed.created_at end,
        case when oldest_first then listed.id end,
        listed.created_at desc,
        listed.id desc
      limit (checked ->> 'limit')::integer + 1
    ) card
    join public.decks deck on deck.user_id = card.user_id and deck.id = card.deck_id;

  return private.plan_page(page_rows, (checked ->> 'limit')::integer, checked ->> 'query_hash', 'buylist_card_id');
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_buylist"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_buylist"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_buylist"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_buylist"(jsonb) FROM PUBLIC, "anon", "service_role";
