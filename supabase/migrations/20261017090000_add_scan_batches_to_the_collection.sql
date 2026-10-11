create type public.card_condition as enum (
  'near_mint',
  'lightly_played',
  'moderately_played',
  'heavily_played',
  'damaged'
);

create type public.card_language as enum ('en', 'ja', 'de', 'fr', 'it', 'es', 'pt', 'ko', 'ru', 'zhs', 'zht');

create type public.collection_addition_source as enum ('scan_batch');

create function private.is_sorted_set(ids uuid[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array_position(ids, null) is null
    and ids = array(select distinct id from unnest(ids) as id order by id);
$$;

create table public.collection_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_printing_id uuid not null references public.card_printings (id),
  finish public.card_finish not null,
  condition public.card_condition not null,
  language public.card_language not null,
  is_protected boolean not null default false,
  user_tag_ids uuid[] not null default '{}' check (private.is_sorted_set(user_tag_ids)),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  latest_addition_at timestamptz not null,
  constraint collection_entries_identity unique (
    user_id, card_printing_id, finish, condition, language, is_protected, user_tag_ids
  )
);

create table public.collection_additions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null,
  copy_count integer not null check (copy_count > 0),
  source public.collection_addition_source not null,
  idempotency_key uuid not null,
  constraint collection_additions_idempotency_key unique (user_id, idempotency_key)
);

create table public.collection_addition_lines (
  addition_id uuid not null references public.collection_additions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_printing_id uuid not null references public.card_printings (id),
  finish public.card_finish not null,
  condition public.card_condition not null,
  language public.card_language not null,
  quantity integer not null check (quantity > 0),
  collection_entry_id uuid references public.collection_entries (id) on delete set null,
  entry_quantity integer not null check (entry_quantity > 0),
  purchase_day_usd_cents integer check (purchase_day_usd_cents >= 0),
  purchase_day_eur_cents integer check (purchase_day_eur_cents >= 0),
  price_snapshot_at timestamptz,
  primary key (addition_id, card_printing_id, finish, condition, language)
);

create index collection_addition_lines_user_id on public.collection_addition_lines (user_id);
create index collection_addition_lines_collection_entry_id on public.collection_addition_lines (collection_entry_id);

alter table public.collection_entries enable row level security;
alter table public.collection_additions enable row level security;
alter table public.collection_addition_lines enable row level security;

revoke all on table public.collection_entries, public.collection_additions, public.collection_addition_lines
  from anon, authenticated;
grant select on table public.collection_entries, public.collection_additions, public.collection_addition_lines
  to authenticated;

create policy "Users read their own collection entries"
  on public.collection_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own additions"
  on public.collection_additions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own addition lines"
  on public.collection_addition_lines
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function private.caller_user_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'A signed-in user must call this function.' using errcode = 'insufficient_privilege';
  end if;
  return caller;
end;
$$;

create function private.checked_scan_batch_item(field text, item jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  checked_value jsonb;
  key text;
  value jsonb;
  printing_id uuid;
  printing_finishes public.card_finish[];
  card_type_line text;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    perform private.invalid_argument(field, format('%s must be a JSON object.', field));
  end if;

  for key, value in select entry.key, entry.value from jsonb_each(item) as entry order by entry.key loop
    checked_value := case
      when key = 'card_printing_id' then
        private.checked_uuid(format('%s.%s', field, key), value)
      when key = 'finish' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_finish)::text[])
      when key = 'condition' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_condition)::text[])
      when key = 'language' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_language)::text[])
      when key = 'quantity' then
        private.checked_integer(format('%s.%s', field, key), value, 1, 999)
    end;
    if checked_value is null then
      perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is not a known field.', field, key));
    end if;
    checked := checked || jsonb_build_object(key, checked_value);
  end loop;

  foreach key in array array['card_printing_id', 'finish', 'condition', 'language', 'quantity'] loop
    if not checked ? key then
      perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is required.', field, key));
    end if;
  end loop;

  printing_id := (checked ->> 'card_printing_id')::uuid;
  select p.finishes, c.type_line
    into printing_finishes, card_type_line
    from public.card_printings p
    join public.cards c on c.oracle_id = p.oracle_id
    where p.id = printing_id;
  if not found then
    perform private.raise_search_error(
      'unknown_printing',
      format('%s.card_printing_id is not a card printing in the card catalog.', field),
      format('%s.card_printing_id', field)
    );
  end if;
  if private.some_face_has_type_words(card_type_line, array['basic']) then
    perform private.raise_search_error(
      'basic_land',
      format('%s.card_printing_id is a basic land. Basic lands are not tracked.', field),
      format('%s.card_printing_id', field)
    );
  end if;
  if not (checked ->> 'finish')::public.card_finish = any (printing_finishes) then
    perform private.invalid_argument(
      format('%s.finish', field),
      format(
        '%s.finish must be one of the finishes of this card printing: %s.',
        field,
        array_to_string(printing_finishes, ', ')
      )
    );
  end if;
  return checked;
end;
$$;

create function private.check_scan_batch(batch jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  key text;
  value jsonb;
  idempotency_key jsonb;
  items jsonb;
begin
  if jsonb_typeof(batch) is distinct from 'object' then
    perform private.invalid_argument(null, 'The batch must be a JSON object.');
  end if;

  for key, value in select entry.key, entry.value from jsonb_each(batch) as entry order by entry.key loop
    if key = 'idempotency_key' then
      idempotency_key := private.checked_uuid(key, value);
    elsif key = 'items' then
      if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 2000 then
        perform private.invalid_argument(key, 'items must be a list of 1 to 2000 stacks.');
      end if;
      items := (
        select jsonb_agg(
          private.checked_scan_batch_item(format('items[%s]', e.ordinality - 1), e.element)
          order by e.ordinality
        )
        from jsonb_array_elements(value) with ordinality as e(element, ordinality)
      );
    else
      perform private.invalid_argument(key, format('%s is not a known field.', key));
    end if;
  end loop;

  if idempotency_key is null then
    perform private.invalid_argument('idempotency_key', 'idempotency_key is required.');
  end if;
  if items is null then
    perform private.invalid_argument('items', 'items is required.');
  end if;

  return jsonb_build_object(
    'idempotency_key', idempotency_key,
    'items', (
      select jsonb_agg(to_jsonb(stack) order by stack.card_printing_id, stack.finish, stack.condition, stack.language)
      from (
        select i.card_printing_id, i.finish, i.condition, i.language, sum(i.quantity)::integer as quantity
        from jsonb_to_recordset(items) as i(
          card_printing_id uuid,
          finish public.card_finish,
          condition public.card_condition,
          language public.card_language,
          quantity integer
        )
        group by i.card_printing_id, i.finish, i.condition, i.language
      ) stack
    )
  );
end;
$$;

create function private.scan_batch_result(addition public.collection_additions, replayed boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'addition_id', addition.id,
    'added_at', addition.added_at,
    'copy_count', addition.copy_count,
    'replayed', replayed,
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'card_printing_id', line.card_printing_id,
        'finish', line.finish,
        'condition', line.condition,
        'language', line.language,
        'collection_entry_id', line.collection_entry_id,
        'quantity_added', line.quantity,
        'entry_quantity', line.entry_quantity
      )
      order by line.card_printing_id, line.finish, line.condition, line.language
    ), '[]'::jsonb)
  )
  from public.collection_addition_lines line
  where line.addition_id = addition.id;
$$;

create function private.scan_batch_stacks(addition_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_agg(
    jsonb_build_object(
      'card_printing_id', line.card_printing_id,
      'finish', line.finish,
      'condition', line.condition,
      'language', line.language,
      'quantity', line.quantity
    )
    order by line.card_printing_id, line.finish, line.condition, line.language
  )
  from public.collection_addition_lines line
  where line.addition_id = scan_batch_stacks.addition_id;
$$;

create function public.add_scan_batch(batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  addition public.collection_additions;
begin
  caller := private.caller_user_id();
  checked := private.check_scan_batch(batch);

  insert into public.collection_additions (user_id, added_at, copy_count, source, idempotency_key)
    values (
      caller,
      now(),
      (select sum((stack ->> 'quantity')::integer) from jsonb_array_elements(checked -> 'items') as stack),
      'scan_batch',
      (checked ->> 'idempotency_key')::uuid
    )
    on conflict on constraint collection_additions_idempotency_key do nothing
    returning * into addition;

  if addition.id is null then
    select * into addition
      from public.collection_additions a
      where a.user_id = caller and a.idempotency_key = (checked ->> 'idempotency_key')::uuid;
    if private.scan_batch_stacks(addition.id) is distinct from checked -> 'items' then
      perform private.raise_search_error(
        'idempotency_conflict',
        'idempotency_key was already used for a scan batch with different items.',
        'idempotency_key'
      );
    end if;
    return private.scan_batch_result(addition, true);
  end if;

  with stacks as (
    select s.*
    from jsonb_to_recordset(checked -> 'items') as s(
      card_printing_id uuid,
      finish public.card_finish,
      condition public.card_condition,
      language public.card_language,
      quantity integer
    )
  ),
  merged as (
    insert into public.collection_entries as entry (
      user_id, card_printing_id, finish, condition, language, quantity, latest_addition_at
    )
    select caller, s.card_printing_id, s.finish, s.condition, s.language, s.quantity, addition.added_at
    from stacks s
    order by s.card_printing_id, s.finish, s.condition, s.language
    on conflict on constraint collection_entries_identity do update set
      quantity = entry.quantity + excluded.quantity,
      latest_addition_at = greatest(entry.latest_addition_at, excluded.latest_addition_at)
    returning entry.id, entry.card_printing_id, entry.finish, entry.condition, entry.language, entry.quantity
  ),
  price_snapshot as (
    select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'prices'
  )
  insert into public.collection_addition_lines (
    addition_id, user_id, card_printing_id, finish, condition, language, quantity,
    collection_entry_id, entry_quantity, purchase_day_usd_cents, purchase_day_eur_cents, price_snapshot_at
  )
  select
    addition.id,
    caller,
    s.card_printing_id,
    s.finish,
    s.condition,
    s.language,
    s.quantity,
    merged.id,
    merged.quantity,
    case s.finish
      when 'nonfoil' then price.usd_nonfoil_cents
      when 'foil' then price.usd_foil_cents
      when 'etched' then price.usd_etched_cents
    end,
    case s.finish
      when 'nonfoil' then price.eur_nonfoil_cents
      when 'foil' then price.eur_foil_cents
    end,
    (select price_snapshot.snapshot_at from price_snapshot)
  from stacks s
  join merged using (card_printing_id, finish, condition, language)
  left join public.card_prices price on price.printing_id = s.card_printing_id;

  return private.scan_batch_result(addition, false);
end;
$$;

revoke all on function public.add_scan_batch(jsonb) from public, anon, service_role;
grant execute on function public.add_scan_batch(jsonb) to authenticated;
