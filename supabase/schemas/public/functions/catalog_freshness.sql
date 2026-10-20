CREATE OR REPLACE FUNCTION public.catalog_freshness()
  RETURNS TABLE (
    source              public.import_source,
    snapshot_at         timestamp with time zone,
    succeeded_at        timestamp with time zone,
    last_attempt_at     timestamp with time zone,
    last_attempt_status public.import_run_status,
    is_stale            boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select
    s.source,
    snapshot.snapshot_at,
    snapshot.succeeded_at,
    last_attempt.started_at,
    last_attempt.status,
    snapshot.succeeded_at is null
      or case s.source
        when 'prices' then snapshot.snapshot_at < now() - interval '24 hours'
        else snapshot.succeeded_at < now() - interval '7 days'
      end
  from unnest(enum_range(null::public.import_source)) as s(source)
  left join public.import_snapshots snapshot on snapshot.source = s.source
  left join lateral (
    select r.started_at, r.status
    from public.import_runs r
    where r.source = s.source
    order by r.started_at desc
    limit 1
  ) last_attempt on true
  order by s.source;
$function$;

GRANT EXECUTE ON FUNCTION "public"."catalog_freshness"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."catalog_freshness"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."catalog_freshness"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."catalog_freshness"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."catalog_freshness"() FROM PUBLIC, "anon";
