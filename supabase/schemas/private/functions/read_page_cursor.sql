CREATE OR REPLACE FUNCTION private.read_page_cursor (
  encoded_cursor text,
  query_hash     text,
  key_length     integer
)
  RETURNS jsonb
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
    issued_at := (payload ->> 'issued_at')::double precision;
    if issued_at is null
      or jsonb_typeof(payload -> 'after') is distinct from 'array'
      or jsonb_array_length(payload -> 'after') <> key_length then
      payload := null;
    end if;
  exception when others then
    payload := null;
  end;

  if payload is null then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor is not valid. Start again without a cursor.',
      'cursor'
    );
  end if;
  if payload ->> 'query_hash' is distinct from read_page_cursor.query_hash then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor belongs to another query. Start again without a cursor.',
      'cursor'
    );
  end if;
  if issued_at < extract(epoch from now() - interval '15 minutes') then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor has expired. Start again without a cursor.',
      'cursor'
    );
  end if;
  return payload -> 'after';
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."read_page_cursor"(text, text, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."read_page_cursor"(text, text, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."read_page_cursor"(text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."read_page_cursor"(text, text, integer) TO "postgres";
