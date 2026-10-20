CREATE OR REPLACE FUNCTION private.combo_lowest_bracket (
  bracket_tag public.combo_bracket_tag
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case bracket_tag when 'ruthless' then 4 when 'spicy' then 3 when 'powerful' then 3 end;
$function$;

REVOKE ALL ON FUNCTION "private"."combo_lowest_bracket"(public.combo_bracket_tag) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."combo_lowest_bracket"(public.combo_bracket_tag) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."combo_lowest_bracket"(public.combo_bracket_tag) TO "postgres";
