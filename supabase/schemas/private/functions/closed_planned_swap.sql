CREATE OR REPLACE FUNCTION private.closed_planned_swap (
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
  swap public.planned_swaps;
begin
  checked := private.check_request(request, array['planned_swap_id']);
  swap := private.locked_planned_swap(
    owner_id,
    (checked ->> 'planned_swap_id')::uuid,
    array['open', 'closed']::public.planned_swap_status[]
  );
  if swap.status = 'open' then
    update public.planned_swaps planned
      set status = 'closed', close_note = note, status_changed_at = now()
      where planned.user_id = owner_id and planned.id = swap.id;
  end if;
  return jsonb_build_object('id', swap.id, 'changed', swap.status = 'open');
end;
$function$;

REVOKE ALL ON FUNCTION "private"."closed_planned_swap"(uuid, jsonb, public.close_note) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."closed_planned_swap"(uuid, jsonb, public.close_note) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."closed_planned_swap"(uuid, jsonb, public.close_note) TO "postgres";
