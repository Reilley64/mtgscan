create type public.deck_priority as enum ('high', 'medium', 'low');

create table public.decks (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name !~ '^\s|\s$' and char_length(name) between 1 and 64),
  priority public.deck_priority not null default 'medium',
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index decks_last_used on public.decks (user_id, last_used_at desc);

alter table public.decks enable row level security;

revoke all on table public.decks from anon, authenticated;
grant select on table public.decks to authenticated;

create policy "Users read their own decks"
  on public.decks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

alter function private.checked_user_tag_name(jsonb) rename to checked_name;

alter function private.check_user_tag_request(jsonb, text[]) rename to check_request;

create or replace function private.check_request(request jsonb, fields text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  field text;
  value jsonb;
begin
  if jsonb_typeof(request) is distinct from 'object' then
    perform private.invalid_argument(null, 'The request must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(request) as entry order by entry.key loop
    if not field = any(fields) then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, case field
      when 'name' then private.checked_name(value)
      when 'tagged' then private.checked_boolean(field, value)
      else private.checked_uuid(field, value)
    end);
  end loop;

  foreach field in array fields loop
    if not checked ? field then
      perform private.invalid_argument(field, format('%s is required.', field));
    end if;
  end loop;
  return checked;
end;
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
  checked := private.check_request(request, array['name']);

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
  checked := private.check_request(request - 'copy_id', array['user_tag_id', 'tagged']);
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

create or replace function public.rename_user_tag(request jsonb)
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
  checked := private.check_request(request, array['user_tag_id', 'name']);

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

create or replace function public.delete_user_tag(request jsonb)
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
  checked := private.check_request(request, array['user_tag_id']);

  delete from public.user_tags user_tag
    where user_tag.user_id = caller and user_tag.id = (checked ->> 'user_tag_id')::uuid;
  if not found then
    perform private.raise_user_tag_not_found();
  end if;
end;
$$;

create function private.raise_deck_not_found()
returns void
language sql
set search_path = ''
as $$
  select private.raise_search_error('not_found', 'deck_id is not one of your decks.', 'deck_id');
$$;

create function private.deck_row(deck public.decks)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'deck_id', deck.id,
    'name', deck.name,
    'priority', deck.priority,
    'card_count', 0,
    'commanders', '[]'::jsonb,
    'last_used_at', deck.last_used_at
  );
$$;

grant execute on function
  private.checked_name(jsonb),
  private.check_request(jsonb, text[]),
  private.raise_deck_not_found(),
  private.deck_row(public.decks)
to authenticated;

create function public.create_deck(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  created_id uuid;
begin
  caller := private.caller_user_id();
  checked := private.check_request(request, array['name']);

  insert into public.decks (user_id, name)
    values (caller, checked ->> 'name')
    returning id into created_id;

  return jsonb_build_object('deck_id', created_id);
end;
$$;

create function public.mark_deck_used(request jsonb)
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
  checked := private.check_request(request, array['deck_id']);

  update public.decks deck
    set last_used_at = now()
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

create function public.list_decks()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(private.deck_row(deck) order by deck.last_used_at desc, lower(deck.name), deck.name, deck.id)
    from public.decks deck
  ), '[]'::jsonb));
end;
$$;

create function public.get_deck(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_request(query, array['deck_id']);

  select private.deck_row(deck) || jsonb_build_object('revision', deck.revision, 'created_at', deck.created_at)
    into result
    from public.decks deck
    where deck.id = (checked ->> 'deck_id')::uuid;
  if result is null then
    perform private.raise_deck_not_found();
  end if;
  return result;
end;
$$;

revoke all on function
  public.create_deck(jsonb),
  public.mark_deck_used(jsonb),
  public.list_decks(),
  public.get_deck(jsonb)
from public, anon, service_role;
grant execute on function
  public.create_deck(jsonb),
  public.mark_deck_used(jsonb),
  public.list_decks(),
  public.get_deck(jsonb)
to authenticated;
