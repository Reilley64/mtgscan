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
      when 'deleted' then private.checked_boolean(field, member)
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

create function private.user_tag_copy_count(owner_id uuid, chosen_user_tag_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select count(*)
  from public.copy_user_tags link
  where link.user_id = owner_id and link.user_tag_id = chosen_user_tag_id and link.deleted_at is null;
$$;

grant execute on function private.user_tag_copy_count(uuid, uuid) to authenticated;

create or replace function public.list_user_tags(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
begin
  perform private.caller_user_id();
  checked := private.checked_object(null, query, '{}', array['deleted']);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_tag_id', user_tag.id,
        'name', user_tag.name,
        'copy_count', private.user_tag_copy_count(user_tag.user_id, user_tag.id)
      )
      order by lower(user_tag.name), user_tag.name, user_tag.id
    )
    from public.user_tags user_tag
    where (user_tag.deleted_at is not null) = coalesce((checked ->> 'deleted')::boolean, false)
  ), '[]'::jsonb));
end;
$$;

create function public.mcp_rename_user_tag(request jsonb)
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
  checked := private.check_request(request, array['user_tag_id', 'name']);

  return private.rename_user_tag(caller, (checked ->> 'user_tag_id')::uuid, checked ->> 'name');
end;
$$;

create function public.mcp_delete_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_user_tag_id uuid;
  changed boolean;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['user_tag_id']);
  chosen_user_tag_id := (checked ->> 'user_tag_id')::uuid;

  changed := private.delete_user_tag(caller, chosen_user_tag_id);
  return jsonb_build_object(
    'user_tag_id', chosen_user_tag_id,
    'changed', changed,
    'copy_count', case when changed then private.user_tag_copy_count(caller, chosen_user_tag_id) else 0 end
  );
end;
$$;

create function public.mcp_restore_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  user_tag public.user_tags;
  changed boolean;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['user_tag_id']);

  begin
    update public.user_tags restored
      set deleted_at = null
      where restored.user_id = caller and restored.id = (checked ->> 'user_tag_id')::uuid and restored.deleted_at is not null
      returning * into user_tag;
  exception when unique_violation then
    perform private.raise_search_error(
      'user_tag_exists',
      'You already have another user tag with the name of this user tag.',
      'user_tag_id'
    );
  end;
  changed := user_tag.id is not null;
  if not changed then
    select * into user_tag
      from public.user_tags existing
      where existing.user_id = caller and existing.id = (checked ->> 'user_tag_id')::uuid;
    if user_tag.id is null then
      perform private.raise_user_tag_not_found();
    end if;
  end if;

  return jsonb_build_object(
    'user_tag_id', user_tag.id,
    'name', user_tag.name,
    'changed', changed,
    'copy_count', private.user_tag_copy_count(caller, user_tag.id)
  );
end;
$$;

revoke all on function public.mcp_rename_user_tag(jsonb), public.mcp_delete_user_tag(jsonb), public.mcp_restore_user_tag(jsonb)
  from public, anon, service_role;
grant execute on function public.mcp_rename_user_tag(jsonb), public.mcp_delete_user_tag(jsonb), public.mcp_restore_user_tag(jsonb)
  to authenticated;
