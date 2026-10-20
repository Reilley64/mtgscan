CREATE OR REPLACE FUNCTION private.locked_planned_swap (
  owner_id               uuid,
  chosen_planned_swap_id uuid,
  changeable_statuses    public.planned_swap_status[]
)
  RETURNS public.planned_swaps
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  swap public.planned_swaps;
begin
  select * into swap from public.planned_swaps found where found.user_id = owner_id and found.id = chosen_planned_swap_id;
  if swap.id is null then
    perform private.raise_search_error('not_found', 'planned_swap_id is not one of your planned swaps.', 'planned_swap_id');
  end if;
  perform private.lock_deck(owner_id, swap.deck_id);
  select * into swap from public.planned_swaps found where found.user_id = owner_id and found.id = chosen_planned_swap_id for update;
  if not swap.status = any(changeable_statuses) then
    perform private.raise_search_error(
      'not_open',
      format('The planned swap is %s. Only an open planned swap can change.', swap.status),
      'planned_swap_id'
    );
  end if;
  return swap;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."locked_planned_swap"(uuid, uuid, public.planned_swap_status[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."locked_planned_swap"(uuid, uuid, public.planned_swap_status[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."locked_planned_swap"(uuid, uuid, public.planned_swap_status[]) TO "postgres";
