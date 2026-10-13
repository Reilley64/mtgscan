alter table public.collection_additions
  drop constraint collection_additions_idempotency_key,
  drop column idempotency_key;

create table public.collection_addition_copies (
  user_id uuid not null references auth.users (id) on delete cascade,
  copy_id uuid not null,
  addition_id uuid not null,
  card_printing_id uuid not null,
  finish public.card_finish not null,
  condition public.card_condition not null,
  language public.card_language not null,
  primary key (user_id, copy_id),
  foreign key (addition_id, card_printing_id, finish, condition, language)
    references public.collection_addition_lines (addition_id, card_printing_id, finish, condition, language)
    on delete cascade
);

create index collection_addition_copies_line
  on public.collection_addition_copies (addition_id, card_printing_id, finish, condition, language);

alter table public.collection_addition_copies enable row level security;

revoke all on table public.collection_addition_copies from anon, authenticated;
grant select on table public.collection_addition_copies to authenticated;

create policy "Users read their own addition copies"
  on public.collection_addition_copies
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop function private.scan_batch_stacks(uuid);
drop function private.scan_batch_result(public.collection_additions, boolean);
drop type private.scan_batch_stack;

create type private.scan_batch_copy as (
  copy_id uuid,
  card_printing_id uuid,
  finish public.card_finish,
  condition public.card_condition,
  language public.card_language
);

create function private.checked_copy_ids(field text, value jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 999 then
    perform private.invalid_argument(field, format('%s must be a list of 1 to 999 copy IDs.', field));
  end if;
  return (
    select jsonb_agg(private.checked_uuid(format('%s[%s]', field, e.ordinality - 1), e.element) order by e.ordinality)
    from jsonb_array_elements(value) with ordinality as e(element, ordinality)
  );
end;
$$;

create or replace function private.checked_scan_batch_item(field text, item jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  key text;
  value jsonb;
  printing_id uuid;
  printing_finishes public.card_finish[];
  card_type_line text;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    perform private.invalid_argument(field, format('%s must be a JSON object.', field));
  end if;

  foreach key in array array['card_printing_id', 'finish', 'condition', 'language', 'copy_ids'] loop
    value := item -> key;
    if value is null then
      perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is required.', field, key));
    end if;
    checked := checked || jsonb_build_object(key, case key
      when 'card_printing_id' then
        private.checked_uuid(format('%s.%s', field, key), value)
      when 'finish' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_finish)::text[])
      when 'condition' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_condition)::text[])
      when 'language' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_language)::text[])
      when 'copy_ids' then
        private.checked_copy_ids(format('%s.%s', field, key), value)
    end);
  end loop;

  select entry.key into key
    from jsonb_object_keys(item) as entry(key)
    where not checked ? entry.key
    order by entry.key
    limit 1;
  if found then
    perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is not a known field.', field, key));
  end if;

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

create or replace function private.check_scan_batch(batch jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  key text;
  value jsonb;
  items jsonb;
  repeated_field text;
begin
  if jsonb_typeof(batch) is distinct from 'object' then
    perform private.invalid_argument(null, 'The batch must be a JSON object.');
  end if;

  for key, value in select entry.key, entry.value from jsonb_each(batch) as entry order by entry.key loop
    if key = 'items' then
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

  if items is null then
    perform private.invalid_argument('items', 'items is required.');
  end if;

  if (select sum(jsonb_array_length(item -> 'copy_ids')) from jsonb_array_elements(items) as item) > 10000 then
    perform private.invalid_argument('items', 'A scan batch holds at most 10000 copy IDs.');
  end if;

  select format('items[%s].copy_ids[%s]', copy.item_index, copy.copy_index)
    into repeated_field
    from (
      select
        i.ordinality - 1 as item_index,
        c.ordinality - 1 as copy_index,
        row_number() over (partition by c.copy_id order by i.ordinality, c.ordinality) as occurrence
      from jsonb_array_elements(items) with ordinality as i(item, ordinality)
      cross join jsonb_array_elements_text(i.item -> 'copy_ids') with ordinality as c(copy_id, ordinality)
    ) copy
    where copy.occurrence > 1
    order by copy.item_index, copy.copy_index
    limit 1;
  if repeated_field is not null then
    perform private.invalid_argument(repeated_field, format('%s repeats another copy ID in the batch.', repeated_field));
  end if;

  return (
    select jsonb_agg(
      jsonb_build_object(
        'copy_id', c.copy_id,
        'card_printing_id', i.item -> 'card_printing_id',
        'finish', i.item -> 'finish',
        'condition', i.item -> 'condition',
        'language', i.item -> 'language'
      )
      order by i.ordinality, c.ordinality
    )
    from jsonb_array_elements(items) with ordinality as i(item, ordinality)
    cross join jsonb_array_elements_text(i.item -> 'copy_ids') with ordinality as c(copy_id, ordinality)
  );
end;
$$;

create function private.scan_batch_result(caller uuid, addition public.collection_additions, copies jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'addition_id', addition.id,
    'added_at', addition.added_at,
    'copy_count', coalesce(addition.copy_count, 0),
    'items', (
      select coalesce(jsonb_agg(
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
      from public.collection_addition_lines line
      where line.addition_id = addition.id
    ),
    'copies', (
      select jsonb_agg(
        jsonb_build_object(
          'copy_id', done.copy_id,
          'addition_id', done.addition_id,
          'collection_entry_id', line.collection_entry_id,
          'replayed', done.addition_id is distinct from addition.id
        )
        order by requested.ordinality
      )
      from jsonb_array_elements(copies) with ordinality as requested(element, ordinality)
      join public.collection_addition_copies done
        on done.user_id = caller and done.copy_id = (requested.element ->> 'copy_id')::uuid
      join public.collection_addition_lines line
        on (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
          = (done.addition_id, done.card_printing_id, done.finish, done.condition, done.language)
    )
  );
$$;

create or replace function public.add_scan_batch(batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  copies jsonb;
  new_copy_count integer;
  addition public.collection_additions;
begin
  caller := private.caller_user_id();
  copies := private.check_scan_batch(batch);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('add_scan_batch ' || caller::text, 0));

  select count(*) into new_copy_count
    from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
    where not exists (
      select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
    );

  if new_copy_count = 0 then
    return private.scan_batch_result(caller, addition, copies);
  end if;

  insert into public.collection_additions (user_id, added_at, copy_count, source)
    values (caller, now(), new_copy_count, 'scan_batch')
    returning * into addition;

  with new_copies as (
    select c.*
    from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
    where not exists (
      select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
    )
  ),
  stacks as (
    select n.card_printing_id, n.finish, n.condition, n.language, count(*)::integer as quantity
    from new_copies n
    group by n.card_printing_id, n.finish, n.condition, n.language
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
    private.finish_price_cents(price, s.finish, 'USD'),
    private.finish_price_cents(price, s.finish, 'EUR'),
    (select price_snapshot.snapshot_at from price_snapshot)
  from stacks s
  join merged using (card_printing_id, finish, condition, language)
  left join public.card_prices price on price.printing_id = s.card_printing_id;

  insert into public.collection_addition_copies (
    user_id, copy_id, addition_id, card_printing_id, finish, condition, language
  )
  select caller, c.copy_id, addition.id, c.card_printing_id, c.finish, c.condition, c.language
  from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
  where not exists (
    select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
  );

  return private.scan_batch_result(caller, addition, copies);
end;
$$;
