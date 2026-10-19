create table private.storage_limit (
  only_row boolean primary key default true check (only_row),
  bytes bigint not null check (bytes > 0)
);

insert into private.storage_limit (bytes) values (1000000000);

create function private.storage_left_before_upload_stop()
returns numeric
language sql
stable
set search_path = ''
as $$
  select 0.9 * l.bytes - (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o)
  from private.storage_limit l;
$$;

create function public.get_training_crop_storage(query jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.check_request(query, array[]::text[]);
  return jsonb_build_object('bytes_left', private.storage_left_before_upload_stop());
end;
$$;

revoke all on function public.get_training_crop_storage(jsonb) from public, anon, authenticated;
grant execute on function public.get_training_crop_storage(jsonb) to service_role;

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
