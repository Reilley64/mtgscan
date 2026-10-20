CREATE OR REPLACE FUNCTION private.replayed_ai_write (
  owner_id     uuid,
  sent_request jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  earlier_request public.ai_write_requests;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai write ' || owner_id::text, 0));
  delete from public.ai_write_requests expired where expired.created_at < now() - interval '24 hours';
  select * into earlier_request
    from public.ai_write_requests saved
    where saved.user_id = owner_id and saved.idempotency_key = sent_request ->> 'idempotency_key';
  if earlier_request.user_id is null then
    return null;
  end if;
  if earlier_request.request <> sent_request then
    perform private.raise_search_error(
      'idempotency_conflict',
      'idempotency_key was used with different input. Send a new idempotency_key.',
      'idempotency_key'
    );
  end if;
  return earlier_request.result || jsonb_build_object('replayed', true);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."replayed_ai_write"(uuid, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."replayed_ai_write"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."replayed_ai_write"(uuid, jsonb) TO "postgres";
