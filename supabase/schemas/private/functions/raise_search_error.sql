CREATE OR REPLACE FUNCTION private.raise_search_error (
  error_code    text,
  error_message text,
  error_field   text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code', error_code,
      'message', error_message,
      'details', error_field,
      'hint', null
    )::text,
    detail = jsonb_build_object(
      'status', case error_code when 'data_unavailable' then 503 else 400 end,
      'headers', '{}'::jsonb
    )::text;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."raise_search_error"(text, text, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."raise_search_error"(text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."raise_search_error"(text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."raise_search_error"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."raise_search_error"(text, text, text) TO "postgres";
