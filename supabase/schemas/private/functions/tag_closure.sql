CREATE OR REPLACE FUNCTION private.tag_closure (
  root_ids uuid[]
)
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with recursive closure (tag_id) as (
    select t.id
    from public.oracle_tags t
    where t.id = any (root_ids)
      and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
    union
    select e.child_id
    from closure
    join public.tag_edges e on e.parent_id = closure.tag_id
    where not exists (select 1 from public.disabled_tags d where d.tag_id = e.child_id)
  )
  select closure.tag_id from closure;
$function$;

GRANT EXECUTE ON FUNCTION "private"."tag_closure"(uuid[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."tag_closure"(uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "private"."tag_closure"(uuid[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."tag_closure"(uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."tag_closure"(uuid[]) TO "postgres";
