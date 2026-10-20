CREATE OR REPLACE FUNCTION private.has_subtype (
  type_line text,
  subtype   text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select format(' %s ', split_part(split_part(type_line, ' // ', 1), ' — ', 2)) like format('%% %s %%', subtype);
$function$;

REVOKE ALL ON FUNCTION "private"."has_subtype"(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."has_subtype"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."has_subtype"(text, text) TO "postgres";
