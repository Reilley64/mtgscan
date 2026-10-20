CREATE OR REPLACE FUNCTION private.checked_tag_slugs (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  lowered jsonb;
  item_index bigint;
  item text;
begin
  perform private.checked_text_list(field, value);
  lowered := (select jsonb_agg(lower(element)) from jsonb_array_elements_text(value) as element);
  perform private.checked_list(field, lowered, 1, 10);
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements_text(lowered) with ordinality as e(element, ordinality)
  loop
    if not exists (
      select 1
      from public.oracle_tags t
      where t.slug = item
        and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
    ) then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format(
          '%s[%s] is not a known Oracle tag slug. Use the tag lookup to find tag slugs.',
          field,
          item_index
        )
      );
    end if;
  end loop;
  return lowered;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_tag_slugs"(text, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_tag_slugs"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_tag_slugs"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_tag_slugs"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_tag_slugs"(text, jsonb) TO "postgres";
