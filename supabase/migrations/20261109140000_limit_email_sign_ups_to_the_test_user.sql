create function public.limit_email_sign_ups(event jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when event -> 'user' -> 'app_metadata' ->> 'provider' = 'email'
      and lower(event -> 'user' ->> 'email') <> 'test-user@mtgscan.test'
    then jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'Sign up with Apple or Google.')
    )
    else '{}'::jsonb
  end;
$$;

revoke all on function public.limit_email_sign_ups(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.limit_email_sign_ups(jsonb) to supabase_auth_admin;
