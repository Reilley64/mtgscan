CREATE OR REPLACE FUNCTION private.type_line_condition (
  type_value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select '('
    || string_agg(format('c.type_line ~* %L', '\m' || word || '\M'), ' and ')
    || case when count(*) > 1 then format(
      ' and (c.type_line not like ''%% // %%'' or private.some_face_has_type_words(c.type_line, %L))',
      private.type_words(type_value)
    ) else '' end
    || ')'
  from unnest(private.type_words(type_value)) as word;
$function$;

GRANT EXECUTE ON FUNCTION "private"."type_line_condition"(text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."type_line_condition"(text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."type_line_condition"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."type_line_condition"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."type_line_condition"(text) TO "postgres";
