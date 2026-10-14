create function private.raise_user_tag_not_found()
returns void
language sql
set search_path = ''
as $$
  select private.raise_search_error('not_found', 'user_tag_id is not one of your user tags.', 'user_tag_id');
$$;

create function private.raise_user_tag_exists()
returns void
language sql
set search_path = ''
as $$
  select private.raise_search_error('user_tag_exists', 'You already have a user tag with this name.', 'name');
$$;

create or replace function public.create_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  created public.user_tags;
begin
  caller := private.caller_user_id();
  checked := private.check_user_tag_request(request, array['name']);

  insert into public.user_tags (user_id, name)
    values (caller, checked ->> 'name')
    on conflict (user_id, lower(name)) do nothing
    returning * into created;
  if created.id is null then
    perform private.raise_user_tag_exists();
  end if;

  return jsonb_build_object('user_tag_id', created.id, 'name', created.name);
end;
$$;

create or replace function public.set_copy_user_tag(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy_id uuid;
  chosen_user_tag_id uuid;
begin
  caller := private.caller_user_id();
  chosen_copy_id := private.checked_copy_id(request, array['user_tag_id', 'tagged']);
  checked := private.check_user_tag_request(request - 'copy_id', array['user_tag_id', 'tagged']);
  chosen_user_tag_id := (checked ->> 'user_tag_id')::uuid;

  if not exists (select 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id) then
    perform private.raise_copy_not_found();
  end if;
  if not exists (
    select 1 from public.user_tags user_tag where user_tag.user_id = caller and user_tag.id = chosen_user_tag_id
  ) then
    perform private.raise_user_tag_not_found();
  end if;

  if (checked ->> 'tagged')::boolean then
    insert into public.copy_user_tags (user_id, copy_id, user_tag_id)
      values (caller, chosen_copy_id, chosen_user_tag_id)
      on conflict do nothing;
  else
    delete from public.copy_user_tags link
      where link.user_id = caller and link.copy_id = chosen_copy_id and link.user_tag_id = chosen_user_tag_id;
  end if;
end;
$$;

create function public.rename_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  renamed public.user_tags;
begin
  caller := private.caller_user_id();
  checked := private.check_user_tag_request(request, array['user_tag_id', 'name']);

  begin
    update public.user_tags user_tag
      set name = checked ->> 'name'
      where user_tag.user_id = caller and user_tag.id = (checked ->> 'user_tag_id')::uuid
      returning * into renamed;
  exception when unique_violation then
    perform private.raise_user_tag_exists();
  end;
  if renamed.id is null then
    perform private.raise_user_tag_not_found();
  end if;

  return jsonb_build_object('user_tag_id', renamed.id, 'name', renamed.name);
end;
$$;

create function public.delete_user_tag(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  checked := private.check_user_tag_request(request, array['user_tag_id']);

  delete from public.user_tags user_tag
    where user_tag.user_id = caller and user_tag.id = (checked ->> 'user_tag_id')::uuid;
  if not found then
    perform private.raise_user_tag_not_found();
  end if;
end;
$$;

revoke all on function
  public.rename_user_tag(jsonb),
  public.delete_user_tag(jsonb)
from public, anon, service_role;
grant execute on function
  public.rename_user_tag(jsonb),
  public.delete_user_tag(jsonb)
to authenticated;
