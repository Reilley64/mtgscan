CREATE OR REPLACE FUNCTION private.save_ai_write (
  owner_id     uuid,
  sent_request jsonb,
  result       jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  insert into public.ai_write_requests (user_id, idempotency_key, request, result)
    values (owner_id, sent_request ->> 'idempotency_key', sent_request, result);
  select result;
$function$;

REVOKE ALL ON FUNCTION "private"."save_ai_write"(uuid, jsonb, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."save_ai_write"(uuid, jsonb, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."save_ai_write"(uuid, jsonb, jsonb) TO "postgres";
