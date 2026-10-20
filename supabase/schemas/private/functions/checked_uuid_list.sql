CREATE OR REPLACE FUNCTION private.checked_uuid_list (
  field     text,
  value     jsonb,
  max_items integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  normalized jsonb;
begin
  perform private.checked_list(field, value, 1, max_items);
  normalized := (
    select jsonb_agg(private.checked_uuid(format('%s[%s]', field, e.ordinality - 1), e.element) order by e.ordinality)
    from jsonb_array_elements(value) with ordinality as e(element, ordinality)
  );
  perform private.checked_list(field, normalized, 1, max_items);
  return normalized;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_uuid_list"(text, jsonb, integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_uuid_list"(text, jsonb, integer) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_uuid_list"(text, jsonb, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_uuid_list"(text, jsonb, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_uuid_list"(text, jsonb, integer) TO "postgres";
