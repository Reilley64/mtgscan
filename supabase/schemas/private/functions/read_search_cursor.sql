CREATE OR REPLACE FUNCTION private.read_search_cursor (
  encoded_cursor text,
  query_hash     text,
  OUT            search_id uuid,
  OUT            after_key jsonb
)
  RETURNS record
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  payload jsonb;
  issued_at double precision;
begin
  begin
    payload := convert_from(decode(encoded_cursor, 'base64'), 'UTF8')::jsonb;
    search_id := (payload ->> 'search_id')::uuid;
    issued_at := (payload ->> 'issued_at')::double precision;
    after_key := payload -> 'after';
    if jsonb_typeof(after_key) is distinct from 'array'
      or jsonb_array_length(after_key) <> 6
      or num_nulls(
        search_id,
        issued_at,
        (after_key ->> 0)::boolean,
        (after_key ->> 1)::numeric,
        (after_key ->> 2)::numeric,
        after_key ->> 3,
        (after_key ->> 4)::uuid,
        (after_key ->> 5)::uuid
      ) > 0 then
      payload := null;
    end if;
  exception when others then
    payload := null;
  end;

  if payload is null then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor is not valid. Start the search again.',
      'cursor'
    );
  end if;
  if payload ->> 'query_hash' is distinct from read_search_cursor.query_hash then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor belongs to another search. Start the search again.',
      'cursor'
    );
  end if;
  if issued_at < extract(epoch from now() - interval '15 minutes') then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor has expired. Start the search again.',
      'cursor'
    );
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."read_search_cursor"(text, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."read_search_cursor"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."read_search_cursor"(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."read_search_cursor"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."read_search_cursor"(text, text) TO "postgres";
