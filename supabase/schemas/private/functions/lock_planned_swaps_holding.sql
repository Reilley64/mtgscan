CREATE OR REPLACE FUNCTION private.lock_planned_swaps_holding (
  owner_id uuid,
  copy_ids uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  perform 1
    from public.planned_swaps swap
    where swap.user_id = owner_id and swap.incoming_copy_id = any (copy_ids) and swap.status = 'open'
    order by swap.id
    for update;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."lock_planned_swaps_holding"(uuid, uuid[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."lock_planned_swaps_holding"(uuid, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."lock_planned_swaps_holding"(uuid, uuid[]) TO "postgres";
