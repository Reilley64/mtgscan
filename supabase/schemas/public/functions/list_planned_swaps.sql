CREATE OR REPLACE FUNCTION public.list_planned_swaps (
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
  checked := private.checked_plan_query(query, 'planned swaps', enum_range(null::public.planned_swap_status)::text[]);
  oldest_first := checked ->> 'order' = 'oldest_first';
  after_created_at := (checked ->> 'after_created_at')::timestamptz;
  after_id := (checked ->> 'after_id')::uuid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'planned_swap_id', swap.id,
      'deck_id', swap.deck_id,
      'deck_name', deck.name,
      'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri',
      'incoming', private.planned_line(swap.user_id, swap.incoming_copy_id, swap.incoming_oracle_id),
      'outgoing', private.planned_line(swap.user_id, swap.outgoing_copy_id, swap.outgoing_oracle_id),
      'as_commander', swap.as_commander,
      'reason', swap.reason,
      'status', swap.status,
      'close_note', swap.close_note,
      'created_at', swap.created_at,
      'status_changed_at', swap.status_changed_at,
      'effect', case when swap.status = 'open' then private.planned_swap_effect(
        swap.user_id,
        swap.deck_id,
        swap.incoming_copy_id,
        swap.incoming_oracle_id,
        swap.as_commander,
        swap.outgoing_copy_id,
        swap.outgoing_oracle_id
      ) end
    )
    order by
      case when oldest_first then swap.created_at end,
      case when oldest_first then swap.id end,
      swap.created_at desc,
      swap.id desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.planned_swaps listed
      where (not checked ? 'deck_id' or listed.deck_id = (checked ->> 'deck_id')::uuid)
        and (not checked ? 'status' or listed.status = (checked ->> 'status')::public.planned_swap_status)
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
    ) swap
    join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id;

  return private.plan_page(page_rows, (checked ->> 'limit')::integer, checked ->> 'query_hash', 'planned_swap_id');
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_planned_swaps"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_planned_swaps"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_planned_swaps"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_planned_swaps"(jsonb) FROM PUBLIC, "anon", "service_role";
