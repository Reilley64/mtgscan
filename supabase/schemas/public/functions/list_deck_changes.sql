CREATE OR REPLACE FUNCTION public.list_deck_changes (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
  chosen_deck_id uuid;
  page_size integer;
  query_hash text;
  after_revision integer;
  page_rows jsonb;
  next_cursor text;
begin
  perform private.caller_user_id();
  checked := private.check_deck_changes_query(query);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('deck changes ' || chosen_deck_id::text);

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    begin
      after_revision := (private.read_page_cursor(checked ->> 'cursor', query_hash, 1) ->> 0)::integer;
    exception when invalid_text_representation then
      after_revision := null;
    end;
    if after_revision is null then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
  end if;

  if not exists (select 1 from public.decks deck where deck.id = chosen_deck_id) then
    perform private.raise_deck_not_found();
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'deck_change_id', change.id,
      'revision', change.revision,
      'kind', change.kind,
      'changed_at', change.changed_at,
      'reverted', change.reverted_by is not null,
      'reason', change.reason,
      'lines', private.deck_change_lines(change.user_id, change.id)
    )
    order by change.revision desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.deck_changes change
      where change.deck_id = chosen_deck_id
        and (after_revision is null or change.revision < after_revision)
      order by change.revision desc
      limit page_size + 1
    ) change;

  if jsonb_array_length(page_rows) > page_size then
    page_rows := page_rows - page_size;
    next_cursor := private.page_cursor(query_hash, jsonb_build_array(page_rows -> (page_size - 1) -> 'revision'));
  end if;

  return jsonb_build_object('items', page_rows, 'next_cursor', next_cursor);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_deck_changes"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_deck_changes"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_deck_changes"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_deck_changes"(jsonb) FROM PUBLIC, "anon", "service_role";
