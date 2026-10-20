CREATE OR REPLACE FUNCTION public.enable_oracle_tag (
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
  delete from public.disabled_tags d where d.tag_id = enable_oracle_tag.tag_id;
  if not found then
    raise exception 'The Oracle tag % is not disabled', enable_oracle_tag.tag_id
      using errcode = 'no_data_found';
  end if;
  insert into public.disabled_tag_changes (tag_id) values (enable_oracle_tag.tag_id);
  return query
    select
      enable_oracle_tag.tag_id,
      (select t.slug from public.oracle_tags t where t.id = enable_oracle_tag.tag_id),
      false;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enable_oracle_tag"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."enable_oracle_tag"(uuid) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."enable_oracle_tag"(uuid) TO "catalog_importer";

ALTER FUNCTION "public"."enable_oracle_tag"(uuid) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."enable_oracle_tag"(uuid) FROM PUBLIC, "anon", "authenticated";
