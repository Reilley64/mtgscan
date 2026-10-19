create table private.storage_limit (
  only_row boolean primary key default true check (only_row),
  bytes bigint not null check (bytes > 0)
);

insert into private.storage_limit (bytes) values (1000000000);

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
