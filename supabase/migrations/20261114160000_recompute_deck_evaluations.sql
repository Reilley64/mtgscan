create role deck_evaluator nologin noinherit;
grant deck_evaluator to postgres;

create table public.disabled_tag_changes (
  tag_id uuid not null,
  changed_at timestamptz not null default now()
);

alter table public.disabled_tag_changes enable row level security;

revoke all on table public.disabled_tag_changes from anon, authenticated;
grant insert on table public.disabled_tag_changes to catalog_importer;

create policy "The import role records disabled tag changes"
  on public.disabled_tag_changes
  for insert
  to catalog_importer
  with check (true);

create or replace function public.disable_oracle_tag(tag_id uuid)
returns table (id uuid, slug text, disabled boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.oracle_tags t where t.id = disable_oracle_tag.tag_id) then
    raise exception 'No Oracle tag has the ID %', disable_oracle_tag.tag_id
      using errcode = 'no_data_found';
  end if;
  insert into public.disabled_tags (tag_id)
    values (disable_oracle_tag.tag_id)
    on conflict on constraint disabled_tags_pkey do nothing;
  if found then
    insert into public.disabled_tag_changes (tag_id) values (disable_oracle_tag.tag_id);
  end if;
  return query
    select t.id, t.slug, true
    from public.oracle_tags t
    where t.id = disable_oracle_tag.tag_id;
end;
$$;

create or replace function public.enable_oracle_tag(tag_id uuid)
returns table (id uuid, slug text, disabled boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.disabled_tags d where d.tag_id = enable_oracle_tag.tag_id;
  if not found then
    raise exception 'The Oracle tag % is not disabled', enable_oracle_tag.tag_id
      using errcode = 'no_data_found';
  end if;
  insert into public.disabled_tag_changes (tag_id) values (enable_oracle_tag.tag_id);
  return query
    select
      enable_oracle_tag.tag_id,
      (select t.slug from public.oracle_tags t where t.id = enable_oracle_tag.tag_id),
      false;
end;
$$;

grant usage on schema public, private to deck_evaluator;

do $$
declare
  readable_table text;
begin
  foreach readable_table in array array[
    'disabled_tag_changes',
    'import_snapshots',
    'decks',
    'deck_cards',
    'deck_basic_lands',
    'copies'
  ] loop
    execute format('grant select on table public.%I to deck_evaluator', readable_table);
    execute format(
      'create policy %I on public.%I for select to deck_evaluator using (true)',
      'The deck evaluation role reads ' || replace(readable_table, '_', ' '),
      readable_table
    );
  end loop;
end;
$$;

grant select, insert, update, delete on table public.deck_evaluations to deck_evaluator;

create policy "The deck evaluation role writes deck evaluations"
  on public.deck_evaluations
  for all
  to deck_evaluator
  using (true)
  with check (true);

create function private.lock_decks()
returns table (user_id uuid, deck_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select deck.user_id, deck.id
    from public.decks deck
    order by deck.user_id, deck.id
    for update;
end;
$$;

grant execute on function
  private.lock_decks(),
  private.save_deck_evaluation(uuid, uuid),
  private.deck_contents(uuid, uuid),
  private.deck_role(timestamptz),
  private.judge_deck(jsonb)
to deck_evaluator;

create function public.recompute_deck_evaluations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  chosen_deck_id uuid;
  saved integer := 0;
begin
  for owner_id, chosen_deck_id in select locked.user_id, locked.deck_id from private.lock_decks() locked loop
    perform private.save_deck_evaluation(owner_id, chosen_deck_id);
    saved := saved + (
      select count(*)::integer
      from public.deck_evaluations evaluation
      where evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id
    );
  end loop;
  return saved;
end;
$$;

create function public.deck_evaluations_are_behind()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deck_evaluations evaluation
    where exists (
        select 1
        from public.import_snapshots snapshot
        where snapshot.source in ('catalog', 'oracle_tags', 'commander_spellbook')
          and snapshot.snapshot_at > coalesce(
            case snapshot.source
              when 'catalog' then evaluation.catalog_at
              when 'oracle_tags' then evaluation.oracle_tags_at
              when 'commander_spellbook' then evaluation.commander_spellbook_at
            end,
            '-infinity'
          )
      )
      or evaluation.judged_at < (select max(change.changed_at) from public.disabled_tag_changes change)
  );
$$;

grant create on schema public to deck_evaluator;
alter function public.recompute_deck_evaluations() owner to deck_evaluator;
alter function public.deck_evaluations_are_behind() owner to deck_evaluator;
revoke create on schema public from deck_evaluator;

revoke all on function public.recompute_deck_evaluations() from public, anon, authenticated;
revoke all on function public.deck_evaluations_are_behind() from public, anon, authenticated;
grant execute on function public.recompute_deck_evaluations() to service_role;
grant execute on function public.deck_evaluations_are_behind() to service_role;

select public.recompute_deck_evaluations();
