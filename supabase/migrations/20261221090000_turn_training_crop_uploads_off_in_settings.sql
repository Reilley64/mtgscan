alter table public.profiles
  add column training_crop_uploads boolean not null default true,
  add column updated_at timestamptz,
  add column created_by uuid,
  add column updated_by uuid;

update public.profiles set updated_at = created_at, created_by = user_id, updated_by = user_id;

alter table public.profiles
  alter column updated_at set not null,
  alter column updated_at set default now(),
  alter column created_by set not null,
  alter column created_by set default auth.uid(),
  alter column updated_by set not null,
  alter column updated_by set default auth.uid();

create trigger record_who_changed
  before insert or update on public.profiles
  for each row execute function private.record_who_changed();

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
      when 'on' then private.checked_boolean(field, member)
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
      when 'crop' then member
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

create function public.get_training_crop_settings(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  perform private.check_request(query, array[]::text[]);
  return (select jsonb_build_object('uploads_on', p.training_crop_uploads) from public.profiles p);
end;
$$;

revoke all on function public.get_training_crop_settings(jsonb) from public, anon, service_role;
grant execute on function public.get_training_crop_settings(jsonb) to authenticated;

create function public.set_training_crop_uploads(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  uploads_on boolean;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  uploads_on := (private.check_request(request, array['on']) ->> 'on')::boolean;

  update public.profiles p
    set training_crop_uploads = uploads_on
    where p.user_id = caller;

  return jsonb_build_object('uploads_on', uploads_on);
end;
$$;

revoke all on function public.set_training_crop_uploads(jsonb) from public, anon, service_role;
grant execute on function public.set_training_crop_uploads(jsonb) to authenticated;

create or replace function public.add_training_crop(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked jsonb;
  crop public.training_crops;
begin
  checked := private.check_request(request, array['user_id', 'copy_id', 'crop']);
  crop := private.checked_training_crop((checked ->> 'copy_id')::uuid, checked -> 'crop');
  if exists (
    select 1
    from public.profiles p
    where p.user_id = (checked ->> 'user_id')::uuid
      and not p.training_crop_uploads
  ) then
    perform private.raise_search_error('uploads_off', 'Training crop uploads are off for this user.');
  end if;
  if private.storage_left_before_upload_stop() <= 0 then
    perform private.raise_search_error('storage_full', 'Training crop uploads are stopped because Storage is 90% full.');
  end if;
  if not exists (
    select 1
    from public.copies c
    where c.user_id = (checked ->> 'user_id')::uuid
      and c.id = (checked ->> 'copy_id')::uuid
  ) then
    perform private.raise_search_error('unknown_copy', 'The copy is not in the collection.', 'copy_id');
  end if;
  insert into public.training_crops values (crop.*) on conflict (crop_id) do nothing;
end;
$$;
