CREATE OR REPLACE FUNCTION public.limit_email_sign_ups (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case
    when event -> 'user' -> 'app_metadata' ->> 'provider' = 'email'
      and lower(event -> 'user' ->> 'email') <> 'test-user@mtgscan.test'
    then jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'Sign up with Apple or Google.')
    )
    else '{}'::jsonb
  end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."limit_email_sign_ups"(jsonb) TO "supabase_auth_admin";

REVOKE ALL ON FUNCTION "public"."limit_email_sign_ups"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."limit_email_sign_ups"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."limit_email_sign_ups"(jsonb) FROM PUBLIC, "anon", "authenticated", "service_role";
