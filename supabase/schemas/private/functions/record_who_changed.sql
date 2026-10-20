CREATE OR REPLACE FUNCTION private.record_who_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  changer uuid := coalesce((auth.jwt() ->> 'client_id')::uuid, auth.uid(), new.user_id);
begin
  if tg_op = 'INSERT' then
    new.created_by := changer;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := changer;
  new.updated_at := now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."record_who_changed"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."record_who_changed"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."record_who_changed"() TO "postgres";
