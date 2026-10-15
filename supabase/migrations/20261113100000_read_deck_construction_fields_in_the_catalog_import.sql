create type public.copy_limit as enum ('one', 'any_number', 'number', 'unknown');

alter table public.cards
  add column has_partner boolean,
  add column partner_text text,
  add column partner_with_name text,
  add column has_choose_a_background boolean,
  add column has_doctors_companion boolean,
  add column commander_chooses_a_color boolean,
  add column copy_limit public.copy_limit not null default 'unknown',
  add column copy_limit_number integer,
  add constraint cards_copy_limit_number check ((copy_limit = 'number') = (copy_limit_number is not null));

alter table public.cards alter column copy_limit drop default;

alter table catalog_import.cards
  add column has_partner boolean,
  add column partner_text text,
  add column partner_with_name text,
  add column has_choose_a_background boolean,
  add column has_doctors_companion boolean,
  add column commander_chooses_a_color boolean,
  add column copy_limit public.copy_limit,
  add column copy_limit_number integer;

create or replace function catalog_import.merge_catalog(run public.import_runs, staged_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  staged_cards bigint;
  staged_faces bigint;
  staged_printings bigint;
  accepted_cards bigint;
  accepted_printings bigint;
  dropped_cards bigint;
  dropped_printings bigint;
  cards_inserted bigint;
  cards_updated bigint;
  cards_absent bigint;
  faces_inserted bigint;
  faces_updated bigint;
  faces_deleted bigint;
  printings_inserted bigint;
  printings_updated bigint;
  printings_absent bigint;
  missing bigint;
begin
  select count(*), count(*) filter (
      where num_nulls(oracle_id, name, mana_cost, mana_value, colors, color_identity, keywords,
        type_line, oracle_text, commander_legality, can_be_commander, copy_limit) > 0
    )
    into staged_cards, missing
    from catalog_import.cards c
    where c.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'cards', staged_rows -> 'cards', staged_cards, missing);

  select count(*), count(*) filter (
      where num_nulls(oracle_id, face_index, name, mana_cost, type_line, oracle_text, colors) > 0
    )
    into staged_faces, missing
    from catalog_import.card_faces f
    where f.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'card_faces', staged_rows -> 'card_faces', staged_faces, missing);

  select count(*), count(*) filter (
      where num_nulls(id, oracle_id, set_code, set_name, collector_number, lang, rarity, released_at,
        finishes, image_uris) > 0
    )
    into staged_printings, missing
    from catalog_import.card_printings p
    where p.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'card_printings', staged_rows -> 'card_printings', staged_printings, missing);

  delete from catalog_import.card_printings p
    where p.run_id = run.id
      and not exists (
        select 1 from catalog_import.cards c where c.run_id = run.id and c.oracle_id = p.oracle_id
      );
  get diagnostics dropped_printings = row_count;

  delete from catalog_import.cards c
    where c.run_id = run.id
      and not exists (
        select 1 from catalog_import.card_printings p where p.run_id = run.id and p.oracle_id = c.oracle_id
      );
  get diagnostics dropped_cards = row_count;

  delete from catalog_import.card_faces f
    where f.run_id = run.id
      and not exists (
        select 1 from catalog_import.cards c where c.run_id = run.id and c.oracle_id = f.oracle_id
      );

  update catalog_import.cards c
    set released_at = first_printing.released_at
    from (
      select p.oracle_id, min(p.released_at) as released_at
      from catalog_import.card_printings p
      where p.run_id = run.id
      group by p.oracle_id
    ) first_printing
    where c.run_id = run.id and c.oracle_id = first_printing.oracle_id;

  accepted_cards := staged_cards - dropped_cards;
  accepted_printings := staged_printings - dropped_printings;

  perform catalog_import.check_shrink(
    'cards',
    (select count(*) from public.cards where absent_since is null),
    accepted_cards,
    run.accept_shrink
  );
  perform catalog_import.check_shrink(
    'card_printings',
    (select count(*) from public.card_printings where absent_since is null),
    accepted_printings,
    run.accept_shrink
  );

  with merged as (
    insert into public.cards as live (
      oracle_id, name, mana_cost, mana_value, colors, color_identity, keywords, type_line,
      oracle_text, edhrec_rank, commander_legality, is_game_changer, can_be_commander, released_at,
      has_partner, partner_text, partner_with_name, has_choose_a_background, has_doctors_companion,
      commander_chooses_a_color, copy_limit, copy_limit_number
    )
    select
      oracle_id, name, mana_cost, mana_value, colors, color_identity, keywords, type_line,
      oracle_text, edhrec_rank, commander_legality, is_game_changer, can_be_commander, released_at,
      has_partner, partner_text, partner_with_name, has_choose_a_background, has_doctors_companion,
      commander_chooses_a_color, copy_limit, copy_limit_number
    from catalog_import.cards
    where run_id = run.id
    on conflict (oracle_id) do update set
      name = excluded.name,
      mana_cost = excluded.mana_cost,
      mana_value = excluded.mana_value,
      colors = excluded.colors,
      color_identity = excluded.color_identity,
      keywords = excluded.keywords,
      type_line = excluded.type_line,
      oracle_text = excluded.oracle_text,
      edhrec_rank = excluded.edhrec_rank,
      commander_legality = excluded.commander_legality,
      is_game_changer = excluded.is_game_changer,
      can_be_commander = excluded.can_be_commander,
      released_at = excluded.released_at,
      has_partner = excluded.has_partner,
      partner_text = excluded.partner_text,
      partner_with_name = excluded.partner_with_name,
      has_choose_a_background = excluded.has_choose_a_background,
      has_doctors_companion = excluded.has_doctors_companion,
      commander_chooses_a_color = excluded.commander_chooses_a_color,
      copy_limit = excluded.copy_limit,
      copy_limit_number = excluded.copy_limit_number,
      absent_since = null
    where (
      live.name, live.mana_cost, live.mana_value, live.colors, live.color_identity, live.keywords,
      live.type_line, live.oracle_text, live.edhrec_rank, live.commander_legality,
      live.is_game_changer, live.can_be_commander, live.released_at, live.has_partner,
      live.partner_text, live.partner_with_name, live.has_choose_a_background,
      live.has_doctors_companion, live.commander_chooses_a_color, live.copy_limit,
      live.copy_limit_number, live.absent_since
    ) is distinct from (
      excluded.name, excluded.mana_cost, excluded.mana_value, excluded.colors,
      excluded.color_identity, excluded.keywords, excluded.type_line, excluded.oracle_text,
      excluded.edhrec_rank, excluded.commander_legality, excluded.is_game_changer,
      excluded.can_be_commander, excluded.released_at, excluded.has_partner,
      excluded.partner_text, excluded.partner_with_name, excluded.has_choose_a_background,
      excluded.has_doctors_companion, excluded.commander_chooses_a_color, excluded.copy_limit,
      excluded.copy_limit_number, null::timestamptz
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into cards_inserted, cards_updated
    from merged;

  update public.cards live
    set absent_since = now()
    where live.absent_since is null
      and not exists (
        select 1 from catalog_import.cards c where c.run_id = run.id and c.oracle_id = live.oracle_id
      );
  get diagnostics cards_absent = row_count;

  with merged as (
    insert into public.card_faces as live (
      oracle_id, face_index, name, mana_cost, type_line, oracle_text, colors, power, toughness, loyalty
    )
    select f.oracle_id, f.face_index, f.name, f.mana_cost, f.type_line, f.oracle_text, f.colors,
      f.power, f.toughness, f.loyalty
    from catalog_import.card_faces f
    where f.run_id = run.id
    on conflict (oracle_id, face_index) do update set
      name = excluded.name,
      mana_cost = excluded.mana_cost,
      type_line = excluded.type_line,
      oracle_text = excluded.oracle_text,
      colors = excluded.colors,
      power = excluded.power,
      toughness = excluded.toughness,
      loyalty = excluded.loyalty
    where (
      live.name, live.mana_cost, live.type_line, live.oracle_text, live.colors, live.power,
      live.toughness, live.loyalty
    ) is distinct from (
      excluded.name, excluded.mana_cost, excluded.type_line, excluded.oracle_text, excluded.colors,
      excluded.power, excluded.toughness, excluded.loyalty
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into faces_inserted, faces_updated
    from merged;

  delete from public.card_faces live
    where exists (
        select 1 from catalog_import.cards c where c.run_id = run.id and c.oracle_id = live.oracle_id
      )
      and not exists (
        select 1
        from catalog_import.card_faces f
        where f.run_id = run.id and f.oracle_id = live.oracle_id and f.face_index = live.face_index
      );
  get diagnostics faces_deleted = row_count;

  with merged as (
    insert into public.card_printings as live (
      id, oracle_id, set_code, set_name, collector_number, lang, rarity, released_at, finishes,
      illustration_id, image_uris, art_crop_uri
    )
    select id, oracle_id, set_code, set_name, collector_number, lang, rarity, released_at, finishes,
      illustration_id, image_uris, art_crop_uri
    from catalog_import.card_printings
    where run_id = run.id
    on conflict (id) do update set
      oracle_id = excluded.oracle_id,
      set_code = excluded.set_code,
      set_name = excluded.set_name,
      collector_number = excluded.collector_number,
      lang = excluded.lang,
      rarity = excluded.rarity,
      released_at = excluded.released_at,
      finishes = excluded.finishes,
      illustration_id = excluded.illustration_id,
      image_uris = excluded.image_uris,
      art_crop_uri = excluded.art_crop_uri,
      absent_since = null
    where (
      live.oracle_id, live.set_code, live.set_name, live.collector_number, live.lang, live.rarity,
      live.released_at, live.finishes, live.illustration_id, live.image_uris, live.art_crop_uri,
      live.absent_since
    ) is distinct from (
      excluded.oracle_id, excluded.set_code, excluded.set_name, excluded.collector_number,
      excluded.lang, excluded.rarity, excluded.released_at, excluded.finishes,
      excluded.illustration_id, excluded.image_uris, excluded.art_crop_uri, null::timestamptz
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into printings_inserted, printings_updated
    from merged;

  update public.card_printings live
    set absent_since = now()
    where live.absent_since is null
      and not exists (
        select 1 from catalog_import.card_printings p where p.run_id = run.id and p.id = live.id
      );
  get diagnostics printings_absent = row_count;

  return jsonb_build_object(
    'cards', jsonb_build_object(
      'staged', staged_cards,
      'accepted', accepted_cards,
      'dropped', dropped_cards,
      'inserted', cards_inserted,
      'updated', cards_updated,
      'marked_absent', cards_absent
    ),
    'card_faces', jsonb_build_object(
      'staged', staged_faces,
      'inserted', faces_inserted,
      'updated', faces_updated,
      'deleted', faces_deleted
    ),
    'card_printings', jsonb_build_object(
      'staged', staged_printings,
      'accepted', accepted_printings,
      'dropped', dropped_printings,
      'inserted', printings_inserted,
      'updated', printings_updated,
      'marked_absent', printings_absent
    )
  );
end;
$$;
