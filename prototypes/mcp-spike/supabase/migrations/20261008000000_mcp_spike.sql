create table if not exists public.collection_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_name text not null check (length(btrim(card_name)) between 1 and 200),
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now(),
  unique (user_id, card_name)
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  format text not null default 'commander' check (format in ('commander')),
  commander text,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_cards (
  deck_id uuid not null references public.decks (id) on delete cascade,
  card_name text not null check (length(btrim(card_name)) between 1 and 200),
  qty integer not null check (qty > 0),
  primary key (deck_id, card_name)
);

create table if not exists public.deck_change_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 1 and 64),
  summary text check (length(summary) <= 200),
  changes jsonb not null,
  before jsonb not null,
  after jsonb not null,
  revision_before integer not null,
  revision_after integer not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists decks_user_id_idx on public.decks (user_id);
create index if not exists deck_change_log_deck_id_idx on public.deck_change_log (deck_id);

alter table public.collection_cards enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.deck_change_log enable row level security;

revoke all on public.collection_cards, public.decks, public.deck_cards, public.deck_change_log from anon;
grant select, insert, update, delete on public.collection_cards, public.decks, public.deck_cards to authenticated;
revoke update, delete, truncate on public.deck_change_log from authenticated;
grant select, insert on public.deck_change_log to authenticated;

drop policy if exists "Owners manage their collection" on public.collection_cards;
create policy "Owners manage their collection"
  on public.collection_cards for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners manage their decks" on public.decks;
create policy "Owners manage their decks"
  on public.decks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners manage cards in their decks" on public.deck_cards;
create policy "Owners manage cards in their decks"
  on public.deck_cards for all to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from public.decks d where d.id = deck_id and d.user_id = (select auth.uid())));

drop policy if exists "Owners read their deck change log" on public.deck_change_log;
create policy "Owners read their deck change log"
  on public.deck_change_log for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Owners append to their deck change log" on public.deck_change_log;
create policy "Owners append to their deck change log"
  on public.deck_change_log for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.decks d where d.id = deck_id and d.user_id = (select auth.uid()))
  );

create or replace function public.is_basic_land(p_card_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(p_card_name)) in (
    'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
    'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
    'snow-covered mountain', 'snow-covered forest', 'snow-covered wastes'
  );
$$;

create or replace function public.preview_deck_change(p_deck_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_deck public.decks%rowtype;
  v_cards jsonb;
  v_work jsonb;
  v_change jsonb;
  v_index integer := 0;
  v_op text;
  v_name text;
  v_key text;
  v_qty integer;
  v_current integer;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_touched text[] := array[]::text[];
  v_count_before integer;
  v_count_after integer;
  v_commander_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_deck from public.decks where id = p_deck_id;
  if not found then
    raise exception 'deck_not_found' using detail = 'No deck with this id is visible to the signed-in user.';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) not between 1 and 20 then
    raise exception 'invalid_changes' using detail = 'changes must be an array with 1 to 20 items.';
  end if;

  select coalesce(jsonb_object_agg(card_name, qty), '{}'::jsonb) into v_cards
  from public.deck_cards where deck_id = p_deck_id;
  v_work := v_cards;

  for v_change in select value from jsonb_array_elements(p_changes) loop
    v_index := v_index + 1;
    v_op := v_change ->> 'op';
    v_name := btrim(coalesce(v_change ->> 'card_name', ''));

    if v_op is null or v_op not in ('add', 'remove') then
      v_errors := v_errors || jsonb_build_object('change', v_index, 'code', 'invalid_op', 'message', 'op must be add or remove.');
      continue;
    end if;
    if length(v_name) not between 1 and 200 then
      v_errors := v_errors || jsonb_build_object('change', v_index, 'code', 'invalid_card_name', 'message', 'card_name must have 1 to 200 characters.');
      continue;
    end if;
    if jsonb_typeof(v_change -> 'quantity') <> 'number' or (v_change ->> 'quantity') !~ '^[0-9]+$'
      or (v_change ->> 'quantity')::numeric not between 1 and 4 then
      v_errors := v_errors || jsonb_build_object('change', v_index, 'code', 'invalid_quantity', 'message', 'quantity must be an integer from 1 to 4.');
      continue;
    end if;
    v_qty := (v_change ->> 'quantity')::integer;

    v_key := null;
    select k into v_key from jsonb_object_keys(v_work) as k where lower(k) = lower(v_name) limit 1;
    if v_key is null then
      select c.card_name into v_key from public.collection_cards c where lower(c.card_name) = lower(v_name) limit 1;
    end if;
    v_name := coalesce(v_key, v_name);
    v_current := coalesce((v_work ->> v_name)::integer, 0);

    if v_op = 'add' then
      v_work := jsonb_set(v_work, array[v_name], to_jsonb(v_current + v_qty));
      if not public.is_basic_land(v_name)
        and not exists (select 1 from public.collection_cards c where lower(c.card_name) = lower(v_name)) then
        v_warnings := v_warnings || jsonb_build_object('change', v_index, 'code', 'not_in_collection', 'message', format('%s is not in the collection.', v_name));
      end if;
    else
      if v_current < v_qty then
        v_errors := v_errors || jsonb_build_object('change', v_index, 'code', 'not_enough_copies', 'message', format('The deck has %s of %s, so %s cannot be removed.', v_current, v_name, v_qty));
        continue;
      end if;
      if v_current - v_qty = 0 then
        v_work := v_work - v_name;
      else
        v_work := jsonb_set(v_work, array[v_name], to_jsonb(v_current - v_qty));
      end if;
    end if;

    if not v_name = any (v_touched) then
      v_touched := array_append(v_touched, v_name);
    end if;
  end loop;

  v_commander_count := case when v_deck.commander is null then 0 else 1 end;
  select v_commander_count + coalesce(sum(value::integer), 0) into v_count_before from jsonb_each_text(v_cards);
  select v_commander_count + coalesce(sum(value::integer), 0) into v_count_after from jsonb_each_text(v_work);

  for v_name in select unnest(v_touched) loop
    if v_deck.format = 'commander' and coalesce((v_work ->> v_name)::integer, 0) > 1 and not public.is_basic_land(v_name) then
      v_errors := v_errors || jsonb_build_object('card_name', v_name, 'code', 'singleton', 'message', format('Commander decks allow only one %s.', v_name));
    end if;
    if v_deck.commander is not null and lower(v_name) = lower(v_deck.commander) and coalesce((v_work ->> v_name)::integer, 0) > 0 then
      v_errors := v_errors || jsonb_build_object('card_name', v_name, 'code', 'commander_in_library', 'message', 'The commander cannot also be in the main deck.');
    end if;
    v_lines := v_lines || jsonb_build_object(
      'card_name', v_name,
      'before', coalesce((v_cards ->> v_name)::integer, 0),
      'after', coalesce((v_work ->> v_name)::integer, 0)
    );
  end loop;

  if v_deck.format = 'commander' and v_count_after > 100 then
    v_errors := v_errors || jsonb_build_object('code', 'deck_too_large', 'message', format('Commander decks have at most 100 cards. This change makes %s.', v_count_after));
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'deck_id', v_deck.id,
    'deck_name', v_deck.name,
    'revision', v_deck.revision,
    'card_count_before', v_count_before,
    'card_count_after', v_count_after,
    'lines', v_lines,
    'errors', v_errors,
    'warnings', v_warnings
  );
end;
$$;

create or replace function public.apply_deck_change(
  p_deck_id uuid,
  p_expected_revision integer,
  p_changes jsonb,
  p_idempotency_key text,
  p_summary text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_revision integer;
  v_log public.deck_change_log%rowtype;
  v_plan jsonb;
  v_line jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_result jsonb;
  v_log_id bigint;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 64 then
    raise exception 'invalid_idempotency_key' using detail = 'idempotency_key must have 1 to 64 characters.';
  end if;
  if p_summary is not null and length(p_summary) > 200 then
    raise exception 'invalid_summary' using detail = 'summary must have at most 200 characters.';
  end if;

  select revision into v_revision from public.decks where id = p_deck_id for update;
  if not found then
    raise exception 'deck_not_found' using detail = 'No deck with this id is visible to the signed-in user.';
  end if;

  select * into v_log from public.deck_change_log
  where user_id = v_user and idempotency_key = p_idempotency_key;
  if found then
    if v_log.deck_id = p_deck_id and v_log.changes = p_changes and v_log.revision_before = p_expected_revision then
      return v_log.result || jsonb_build_object('log_id', v_log.id, 'replayed', true);
    end if;
    raise exception 'idempotency_key_reused' using detail = 'This idempotency_key was already used for a different change.';
  end if;

  if v_revision <> p_expected_revision then
    raise exception 'stale_revision'
      using detail = format('Expected revision %s, but the deck is at revision %s. Nothing was changed.', p_expected_revision, v_revision),
            hint = 'Call get_deck or preview_deck_change again, then apply with the new revision.';
  end if;

  v_plan := public.preview_deck_change(p_deck_id, p_changes);
  if not (v_plan ->> 'ok')::boolean then
    raise exception 'invalid_change' using detail = (v_plan -> 'errors')::text;
  end if;

  for v_line in select value from jsonb_array_elements(v_plan -> 'lines') loop
    v_before := v_before || jsonb_build_object(v_line ->> 'card_name', (v_line ->> 'before')::integer);
    v_after := v_after || jsonb_build_object(v_line ->> 'card_name', (v_line ->> 'after')::integer);
    if (v_line ->> 'after')::integer = 0 then
      delete from public.deck_cards where deck_id = p_deck_id and card_name = v_line ->> 'card_name';
    else
      insert into public.deck_cards (deck_id, card_name, qty)
      values (p_deck_id, v_line ->> 'card_name', (v_line ->> 'after')::integer)
      on conflict (deck_id, card_name) do update set qty = excluded.qty;
    end if;
  end loop;

  update public.decks set revision = revision + 1, updated_at = now()
  where id = p_deck_id
  returning revision into v_revision;

  v_result := jsonb_build_object(
    'status', 'applied',
    'deck_id', p_deck_id,
    'revision_before', p_expected_revision,
    'revision_after', v_revision,
    'card_count_after', v_plan -> 'card_count_after',
    'lines', v_plan -> 'lines',
    'warnings', v_plan -> 'warnings',
    'replayed', false
  );

  insert into public.deck_change_log (
    user_id, deck_id, idempotency_key, summary, changes, before, after, revision_before, revision_after, result
  ) values (
    v_user, p_deck_id, p_idempotency_key, p_summary, p_changes, v_before, v_after, p_expected_revision, v_revision, v_result
  )
  returning id into v_log_id;

  return v_result || jsonb_build_object('log_id', v_log_id);
end;
$$;

create or replace function public.seed_spike_data()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_deck uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select id into v_deck from public.decks where user_id = v_user order by created_at limit 1;
  if found then
    return jsonb_build_object('seeded', false, 'deck_id', v_deck, 'message', 'Spike data already exists for this user.');
  end if;

  insert into public.collection_cards (user_id, card_name, qty)
  select v_user, t.card_name, t.qty
  from (values
    ('Sol Ring', 2),
    ('Arcane Signet', 1),
    ('Sol Talisman', 1),
    ('Solemn Simulacrum', 1),
    ('Command Tower', 1),
    ('Mind Stone', 1),
    ('Fellwar Stone', 1),
    ('Thought Vessel', 1),
    ('Exotic Orchard', 1),
    ('Swords to Plowshares', 1),
    ('Path to Exile', 1),
    ('Counterspell', 2),
    ('Rhystic Study', 1),
    ('Cyclonic Rift', 1),
    ('Lightning Bolt', 3),
    ('Beast Within', 1),
    ('Cultivate', 1),
    ('Kodama''s Reach', 1),
    ('Llanowar Elves', 2),
    ('Kenrith, the Returned King', 1)
  ) as t (card_name, qty)
  on conflict (user_id, card_name) do nothing;

  insert into public.decks (user_id, name, format, commander)
  values (v_user, 'Kenrith spike deck', 'commander', 'Kenrith, the Returned King')
  returning id into v_deck;

  insert into public.deck_cards (deck_id, card_name, qty)
  select v_deck, t.card_name, t.qty
  from (values
    ('Sol Ring', 1),
    ('Command Tower', 1),
    ('Mind Stone', 1),
    ('Swords to Plowshares', 1),
    ('Counterspell', 1),
    ('Rhystic Study', 1),
    ('Cyclonic Rift', 1),
    ('Lightning Bolt', 1),
    ('Beast Within', 1),
    ('Cultivate', 1),
    ('Plains', 2),
    ('Island', 2),
    ('Swamp', 2),
    ('Mountain', 2),
    ('Forest', 2)
  ) as t (card_name, qty);

  return jsonb_build_object('seeded', true, 'deck_id', v_deck);
end;
$$;

revoke all on function public.is_basic_land(text) from public, anon;
revoke all on function public.preview_deck_change(uuid, jsonb) from public, anon;
revoke all on function public.apply_deck_change(uuid, integer, jsonb, text, text) from public, anon;
revoke all on function public.seed_spike_data() from public, anon;
grant execute on function public.is_basic_land(text) to authenticated;
grant execute on function public.preview_deck_change(uuid, jsonb) to authenticated;
grant execute on function public.apply_deck_change(uuid, integer, jsonb, text, text) to authenticated;
grant execute on function public.seed_spike_data() to authenticated;
