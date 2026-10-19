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
      when 'move_planned_swap' then private.checked_boolean(field, member)
      when 'priority' then private.checked_choice(field, member, enum_range(null::public.deck_priority)::text[])
      when 'order' then private.checked_choice(field, member, array['newest_first', 'oldest_first'])
      when 'status' then member
      when 'limit' then private.checked_integer(field, member, 1, 50)
      when 'cursor' then private.checked_cursor(field, member)
      when 'by' then private.checked_integer(field, member, -99, 99)
      when 'count' then private.checked_integer(field, member, 1, 99)
      when 'expected_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'expected_deck_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'idempotency_key' then private.checked_key(field, member, 8)
      when 'ref' then private.checked_key(field, member, 1)
      when 'reason' then private.checked_reason(field, member)
      when 'planned_swaps' then private.checked_planned_swaps(field, member)
      when 'planned_swap_ids' then private.checked_uuid_list(field, member, 100)
      when 'copy_ids' then private.checked_uuid_list(field, member, 100)
      when 'buylist_cards' then private.checked_buylist_cards(field, member)
      when 'incoming' then member
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

create function public.mcp_create_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['name']);

  return private.create_user_tag(caller, checked ->> 'name');
end;
$$;

create function public.mcp_set_copies_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy_ids uuid[];
  found_copy_ids uuid[];
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['copy_ids', 'user_tag_id', 'tagged']);
  chosen_copy_ids := array(select jsonb_array_elements_text(checked -> 'copy_ids')::uuid);

  found_copy_ids := private.set_copies_user_tag(
    caller,
    (checked ->> 'user_tag_id')::uuid,
    chosen_copy_ids,
    (checked ->> 'tagged')::boolean
  );
  return (
    select jsonb_build_object(
      'changed', coalesce(jsonb_agg(chosen.copy_id order by chosen.position) filter (where chosen.copy_id = any (found_copy_ids)), '[]'),
      'skipped', coalesce(
        jsonb_agg(jsonb_build_object('copy_id', chosen.copy_id, 'reason', 'missing') order by chosen.position)
          filter (where chosen.copy_id <> all (found_copy_ids)),
        '[]'
      )
    )
    from unnest(chosen_copy_ids) with ordinality chosen(copy_id, position)
  );
end;
$$;

revoke all on function public.mcp_create_user_tag(jsonb), public.mcp_set_copies_user_tag(jsonb) from public, anon, service_role;
grant execute on function public.mcp_create_user_tag(jsonb), public.mcp_set_copies_user_tag(jsonb) to authenticated;
