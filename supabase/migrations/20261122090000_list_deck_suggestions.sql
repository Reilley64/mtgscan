create function private.checked_cursor(field text, value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(value) not in ('string', 'null') then
    perform private.invalid_argument(field, format('%s must be a string or null.', field));
  end if;
  return value;
end;
$$;

grant execute on function private.checked_cursor(text, jsonb) to authenticated;

create or replace function private.checked_object(path text, value jsonb, required_fields text[], optional_fields text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  key text;
  member jsonb;
  field text;
begin
  if jsonb_typeof(value) is distinct from 'object' then
    perform private.invalid_argument(path, coalesce(path || ' must be a JSON object.', 'The request must be a JSON object.'));
  end if;

  for key, member in select entry.key, entry.value from jsonb_each(value) as entry order by entry.key loop
    field := concat_ws('.', path, key);
    if not key = any(required_fields || optional_fields) then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(key, case key
      when 'name' then private.checked_name(member)
      when 'tagged' then private.checked_boolean(field, member)
      when 'unprotect' then private.checked_boolean(field, member)
      when 'commander' then private.checked_boolean(field, member)
      when 'as_commander' then private.checked_boolean(field, member)
      when 'priority' then private.checked_choice(field, member, enum_range(null::public.deck_priority)::text[])
      when 'status' then private.checked_choice(field, member, enum_range(null::public.deck_suggestion_status)::text[])
      when 'limit' then private.checked_integer(field, member, 1, 50)
      when 'cursor' then private.checked_cursor(field, member)
      when 'counts' then private.checked_basic_land_counts(field, member)
      when 'expected_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'expected_deck_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'idempotency_key' then private.checked_key(field, member, 8)
      when 'ref' then private.checked_key(field, member, 1)
      when 'pair_with' then private.checked_key(field, member, 1)
      when 'reason' then private.checked_reason(field, member)
      when 'suggestions' then private.checked_deck_suggestions(field, member)
      when 'incoming' then private.checked_object(field, member, array['oracle_id'], array['as_commander', 'from_deck_id'])
      when 'outgoing' then private.checked_outgoing(field, member)
      else private.checked_uuid(field, member)
    end);
  end loop;

  foreach key in array required_fields loop
    if not checked ? key then
      field := concat_ws('.', path, key);
      perform private.invalid_argument(field, format('%s is required.', field));
    end if;
  end loop;
  return checked;
end;
$$;

create function public.list_deck_suggestions(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  chosen_deck_id uuid;
  chosen_status public.deck_suggestion_status;
  page_size integer;
  query_hash text;
  after_key jsonb;
  after_created_at timestamptz;
  after_id uuid;
  page_rows jsonb;
  next_cursor text;
begin
  perform private.caller_user_id();
  checked := jsonb_build_object('limit', 20)
    || private.checked_object(null, query, '{}', array['deck_id', 'status', 'cursor', 'limit']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  chosen_status := (checked ->> 'status')::public.deck_suggestion_status;
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5(concat_ws(' ', 'deck suggestions', chosen_deck_id, chosen_status));

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', query_hash, 2);
    begin
      after_created_at := (after_key ->> 0)::timestamptz;
      after_id := (after_key ->> 1)::uuid;
    exception when data_exception then
      after_id := null;
    end;
    if after_created_at is null or after_id is null then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
  end if;

  if chosen_deck_id is not null and not exists (select 1 from public.decks deck where deck.id = chosen_deck_id) then
    perform private.raise_deck_not_found();
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'suggestion_id', suggestion.id,
      'deck_id', suggestion.deck_id,
      'deck_name', deck.name,
      'incoming', jsonb_build_object(
        'oracle_id', suggestion.incoming_oracle_id,
        'name', incoming.name,
        'as_commander', suggestion.as_commander,
        'from_deck_id', suggestion.from_deck_id
      ),
      'outgoing', case
        when suggestion.outgoing_copy_id is not null then
          jsonb_build_object('copy_id', suggestion.outgoing_copy_id, 'name', outgoing.name)
        when suggestion.outgoing_oracle_id is not null then
          jsonb_build_object('basic_land_oracle_id', suggestion.outgoing_oracle_id, 'name', outgoing.name)
      end,
      'reason', suggestion.reason,
      'status', suggestion.status,
      'paired_suggestion_id', suggestion.paired_suggestion_id,
      'client_name', suggestion.client_name,
      'created_at', suggestion.created_at,
      'status_changed_at', suggestion.status_changed_at,
      'events', coalesce((
        select jsonb_agg(
          jsonb_build_object('kind', event.kind, 'client_name', event.client_name, 'created_at', event.created_at)
          order by event.created_at, event.id
        )
        from public.deck_suggestion_events event
        where event.user_id = suggestion.user_id and event.suggestion_id = suggestion.id
      ), '[]'::jsonb)
    )
    order by suggestion.created_at desc, suggestion.id desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.deck_suggestions listed
      where (chosen_deck_id is null or listed.deck_id = chosen_deck_id)
        and (chosen_status is null or listed.status = chosen_status)
        and (after_id is null or (listed.created_at, listed.id) < (after_created_at, after_id))
      order by listed.created_at desc, listed.id desc
      limit page_size + 1
    ) suggestion
    join public.decks deck on deck.user_id = suggestion.user_id and deck.id = suggestion.deck_id
    join public.cards incoming on incoming.oracle_id = suggestion.incoming_oracle_id
    left join public.cards outgoing on outgoing.oracle_id = suggestion.outgoing_oracle_id;

  if jsonb_array_length(page_rows) > page_size then
    page_rows := page_rows - page_size;
    next_cursor := private.page_cursor(
      query_hash,
      jsonb_build_array(page_rows -> (page_size - 1) -> 'created_at', page_rows -> (page_size - 1) -> 'suggestion_id')
    );
  end if;

  return jsonb_build_object('items', page_rows, 'next_cursor', next_cursor);
end;
$$;

revoke all on function public.list_deck_suggestions(jsonb) from public, anon, service_role;
grant execute on function public.list_deck_suggestions(jsonb) to authenticated;
