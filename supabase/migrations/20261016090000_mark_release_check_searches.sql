alter table public.search_telemetry
  alter column user_id drop not null,
  add constraint search_telemetry_user_matches_caller check ((caller = 'release_check') = (user_id is null));

create or replace function private.record_search(
  search_id uuid,
  api public.search_api,
  query jsonb,
  result_count bigint,
  latency_ms double precision,
  result_ids uuid[]
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.search_telemetry (
    search_id, user_id, api, caller, query, result_count, latency_ms, result_ids
  )
  select
    search_id,
    auth.uid(),
    api,
    case when caller.is_secret_key then 'release_check' else 'app' end::public.search_caller,
    query,
    result_count,
    latency_ms,
    result_ids
  from (select coalesce(auth.jwt() ->> 'role' = 'service_role', false) as is_secret_key) as caller;
$$;

grant execute on function public.search_catalog(jsonb) to service_role;
