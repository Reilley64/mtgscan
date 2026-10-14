create table public.user_tags (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create unique index user_tags_name on public.user_tags (user_id, lower(name));

create table public.copy_user_tags (
  user_id uuid not null,
  copy_id uuid not null,
  user_tag_id uuid not null,
  primary key (user_id, copy_id, user_tag_id),
  foreign key (user_id, copy_id) references public.copies (user_id, id) on delete cascade,
  foreign key (user_id, user_tag_id) references public.user_tags (user_id, id) on delete cascade
);

create index copy_user_tags_user_tag on public.copy_user_tags (user_id, user_tag_id);

alter table public.user_tags enable row level security;
alter table public.copy_user_tags enable row level security;

revoke all on table public.user_tags, public.copy_user_tags from anon, authenticated;
grant select on table public.user_tags, public.copy_user_tags to authenticated;

create policy "Users read their own user tags"
  on public.user_tags
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own copy user tags"
  on public.copy_user_tags
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function private.checked_user_tag_name(value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'string' or char_length(btrim(value #>> '{}')) not between 1 and 64 then
    perform private.invalid_argument('name', 'name must be 1 to 64 characters after trimming.');
  end if;
  return to_jsonb(btrim(value #>> '{}'));
end;
$$;

create function private.check_user_tag_request(request jsonb, fields text[])
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
      when 'name' then private.checked_user_tag_name(value)
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

grant execute on function
  private.check_user_tag_request(jsonb, text[]),
  private.checked_user_tag_name(jsonb)
to authenticated;

create function public.create_user_tag(request jsonb)
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
    perform private.raise_search_error('user_tag_exists', 'You already have a user tag with this name.', 'name');
  end if;

  return jsonb_build_object('user_tag_id', created.id, 'name', created.name);
end;
$$;

create function public.set_copy_user_tag(request jsonb)
returns jsonb
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
  checked := private.check_user_tag_request(request, array['copy_id', 'user_tag_id', 'tagged']);
  chosen_copy_id := (checked ->> 'copy_id')::uuid;
  chosen_user_tag_id := (checked ->> 'user_tag_id')::uuid;

  if not exists (select 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id) then
    perform private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
  end if;
  if not exists (
    select 1 from public.user_tags tag where tag.user_id = caller and tag.id = chosen_user_tag_id
  ) then
    perform private.raise_search_error('not_found', 'user_tag_id is not one of your user tags.', 'user_tag_id');
  end if;

  if (checked ->> 'tagged')::boolean then
    insert into public.copy_user_tags (user_id, copy_id, user_tag_id)
      values (caller, chosen_copy_id, chosen_user_tag_id)
      on conflict do nothing;
  else
    delete from public.copy_user_tags link
      where link.user_id = caller and link.copy_id = chosen_copy_id and link.user_tag_id = chosen_user_tag_id;
  end if;

  return checked;
end;
$$;

create function public.list_user_tags()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_tag_id', tag.id,
        'name', tag.name,
        'copy_count', (
          select count(*) from public.copy_user_tags link where link.user_id = tag.user_id and link.user_tag_id = tag.id
        )
      )
      order by lower(tag.name), tag.name, tag.id
    )
    from public.user_tags tag
  ), '[]'::jsonb));
end;
$$;

revoke all on function
  public.create_user_tag(jsonb),
  public.set_copy_user_tag(jsonb),
  public.list_user_tags()
from public, anon, service_role;
grant execute on function
  public.create_user_tag(jsonb),
  public.set_copy_user_tag(jsonb),
  public.list_user_tags()
to authenticated;

create or replace function public.get_copy(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  chosen_currency public.price_currency;
  prices_stale boolean;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_copy_query(query);
  chosen_currency := (checked ->> 'price_currency')::public.price_currency;
  select f.is_stale into prices_stale from public.catalog_freshness() f where f.source = 'prices';

  select private.copy_row(a, p, c, price, chosen_currency, prices_stale) || jsonb_build_object(
    'free', a.is_free,
    'added_at', addition.added_at,
    'purchase_day_price', private.price_json(
      case chosen_currency
        when 'USD' then line.purchase_day_usd_cents
        when 'EUR' then line.purchase_day_eur_cents
      end,
      chosen_currency,
      a.finish
    ),
    'type_line', c.type_line,
    'faces', coalesce((
      select jsonb_agg(jsonb_build_object('name', f.name, 'oracle_text', f.oracle_text) order by f.face_index)
      from public.card_faces f
      where f.oracle_id = c.oracle_id
    ), '[]'::jsonb),
    'commander_legality', c.commander_legality,
    'user_tags', coalesce((
      select jsonb_agg(jsonb_build_object('user_tag_id', tag.id, 'name', tag.name) order by lower(tag.name), tag.name, tag.id)
      from public.copy_user_tags link
      join public.user_tags tag on tag.user_id = link.user_id and tag.id = link.user_tag_id
      where link.user_id = a.user_id and link.copy_id = a.copy_id
    ), '[]'::jsonb)
  )
  into result
  from private.collection_availability a
  join public.copies copy on copy.user_id = a.user_id and copy.id = a.copy_id
  join public.collection_additions addition on addition.id = copy.addition_id
  join public.collection_addition_lines line
    on (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
      = (copy.addition_id, copy.card_printing_id, copy.finish, copy.condition, copy.language)
  join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = p.oracle_id
  left join public.card_prices price on price.printing_id = p.id
  where a.copy_id = (checked ->> 'copy_id')::uuid;

  if result is null then
    perform private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
  end if;
  return result;
end;
$$;
