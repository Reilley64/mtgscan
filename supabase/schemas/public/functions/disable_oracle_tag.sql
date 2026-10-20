CREATE OR REPLACE FUNCTION public.disable_oracle_tag (
  tag_id uuid
)
  RETURNS TABLE (
    id       uuid,
    slug     text,
    disabled boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not exists (select 1 from public.oracle_tags t where t.id = disable_oracle_tag.tag_id) then
    raise exception 'No Oracle tag has the ID %', disable_oracle_tag.tag_id
      using errcode = 'no_data_found';
  end if;
  insert into public.disabled_tags (tag_id)
    values (disable_oracle_tag.tag_id)
    on conflict on constraint disabled_tags_pkey do nothing;
  if found then
    insert into public.disabled_tag_changes (tag_id) values (disable_oracle_tag.tag_id);
  end if;
  return query
    select t.id, t.slug, true
    from public.oracle_tags t
    where t.id = disable_oracle_tag.tag_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."disable_oracle_tag"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."disable_oracle_tag"(uuid) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."disable_oracle_tag"(uuid) TO "catalog_importer";

ALTER FUNCTION "public"."disable_oracle_tag"(uuid) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."disable_oracle_tag"(uuid) FROM PUBLIC, "anon", "authenticated";
