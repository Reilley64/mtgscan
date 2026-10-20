CREATE OR REPLACE FUNCTION private.checked_plan_query (
  query     jsonb,
  list_name text,
  statuses  text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  after_key jsonb;
  after_created_at timestamptz;
  after_id uuid;
begin
  checked := jsonb_build_object('limit', 20, 'order', 'newest_first')
    || private.checked_object(null, query, '{}', array['deck_id', 'status', 'order', 'cursor', 'limit']);
  if checked ? 'status' then
    perform private.checked_choice('status', checked -> 'status', statuses);
  end if;
  checked := checked || jsonb_build_object(
    'query_hash', md5(concat_ws(' ', list_name, checked ->> 'deck_id', checked ->> 'status', checked ->> 'order'))
  );

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', checked ->> 'query_hash', 2);
    begin
      after_created_at := (after_key ->> 0)::timestamptz;
      after_id := (after_key ->> 1)::uuid;
    exception when data_exception then
      after_id := null;
    end;
    if after_created_at is null or after_id is null then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
    checked := checked || jsonb_build_object('after_created_at', after_created_at, 'after_id', after_id);
  end if;

  if checked ? 'deck_id' and not exists (select 1 from public.decks deck where deck.id = (checked ->> 'deck_id')::uuid) then
    perform private.raise_deck_not_found();
  end if;
  return checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_plan_query"(jsonb, text, text[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_plan_query"(jsonb, text, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_plan_query"(jsonb, text, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_plan_query"(jsonb, text, text[]) TO "postgres";
