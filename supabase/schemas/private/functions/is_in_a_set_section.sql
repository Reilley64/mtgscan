CREATE OR REPLACE FUNCTION private.is_in_a_set_section (
  set_code         text,
  card_printing_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.set_section_card_printings listed
    where listed.set_code = is_in_a_set_section.set_code and listed.card_printing_id = is_in_a_set_section.card_printing_id
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."is_in_a_set_section"(text, uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."is_in_a_set_section"(text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "private"."is_in_a_set_section"(text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_in_a_set_section"(text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."is_in_a_set_section"(text, uuid) TO "postgres";
