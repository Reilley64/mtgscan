CREATE OR REPLACE FUNCTION private.plan_page (
  page_rows  jsonb,
  page_size  integer,
  query_hash text,
  id_field   text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select case
    when jsonb_array_length(page_rows) > page_size then jsonb_build_object(
      'items', page_rows - page_size,
      'next_cursor', private.page_cursor(
        query_hash,
        jsonb_build_array(page_rows -> (page_size - 1) -> 'created_at', page_rows -> (page_size - 1) -> id_field)
      )
    )
    else jsonb_build_object('items', page_rows, 'next_cursor', null)
  end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."plan_page"(jsonb, integer, text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."plan_page"(jsonb, integer, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."plan_page"(jsonb, integer, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."plan_page"(jsonb, integer, text, text) TO "postgres";
