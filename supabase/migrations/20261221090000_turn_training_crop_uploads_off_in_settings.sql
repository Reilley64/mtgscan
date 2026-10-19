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

create function public.get_training_crop_settings(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid;
begin
  caller := private.caller_user_id();
  perform private.check_request(query, array[]::text[]);
  return (
    select jsonb_build_object('uploads_on', p.training_crop_uploads)
    from public.profiles p
    where p.user_id = caller
  );
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
  if jsonb_typeof(request) is distinct from 'object' then
    perform private.invalid_argument(null, 'The request must be a JSON object.');
  end if;
  perform private.checked_object(null, request - 'on', '{}', '{}');
  if not request ? 'on' then
    perform private.invalid_argument('on', 'on is required.');
  end if;
  uploads_on := private.checked_boolean('on', request -> 'on')::boolean;

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
  if jsonb_typeof(request) is distinct from 'object' then
    perform private.invalid_argument(null, 'The request must be a JSON object.');
  end if;
  checked := private.checked_object(null, request - 'crop', array['user_id', 'copy_id'], '{}');
  if not request ? 'crop' then
    perform private.invalid_argument('crop', 'crop is required.');
  end if;
  crop := private.checked_training_crop((checked ->> 'copy_id')::uuid, request -> 'crop');
  if exists (
    select 1
    from public.profiles p
    where p.user_id = (checked ->> 'user_id')::uuid
      and not p.training_crop_uploads
  ) then
    perform private.raise_search_error('uploads_off', 'Training crop uploads are off for this user.');
  end if;
  if (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o)
    >= 0.9 * (select l.bytes from private.storage_limit l) then
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
