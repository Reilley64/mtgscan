create role mtgscan_collection_reader login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

alter role mtgscan_collection_reader set default_transaction_read_only = on;
alter role mtgscan_collection_reader set statement_timeout = '15s';
alter role mtgscan_collection_reader set search_path = '';

grant usage on schema public, auth to mtgscan_collection_reader;
grant execute on function auth.uid() to mtgscan_collection_reader;

grant select (user_id, id, addition_id, card_printing_id, finish, condition, language, is_protected)
  on public.copies to mtgscan_collection_reader;
grant select (user_id, id, added_at) on public.collection_additions to mtgscan_collection_reader;
grant select (user_id, addition_id, card_printing_id, finish, condition, language, purchase_day_usd_cents)
  on public.collection_addition_lines to mtgscan_collection_reader;
grant select (id, oracle_id, set_code, set_name, collector_number, rarity, image_uris, art_crop_uri, artist)
  on public.card_printings to mtgscan_collection_reader;
grant select (oracle_id, name, type_line, mana_cost, commander_legality)
  on public.cards to mtgscan_collection_reader;
grant select (oracle_id, face_index, name, oracle_text) on public.card_faces to mtgscan_collection_reader;
grant select (printing_id, usd_nonfoil_cents, usd_foil_cents, usd_etched_cents)
  on public.card_prices to mtgscan_collection_reader;
grant select (source, succeeded_at) on public.import_snapshots to mtgscan_collection_reader;
grant select (user_id, id, name, deleted_at) on public.user_tags to mtgscan_collection_reader;
grant select (user_id, copy_id, user_tag_id, deleted_at) on public.copy_user_tags to mtgscan_collection_reader;
grant select (user_id, id, name) on public.decks to mtgscan_collection_reader;
grant select (user_id, deck_id, copy_id, commander_at) on public.deck_cards to mtgscan_collection_reader;
grant select (user_id, deck_id, incoming_copy_id, status) on public.planned_swaps to mtgscan_collection_reader;

create policy "Rust collection reader reads owned copies" on public.copies
  for select to mtgscan_collection_reader using ((select auth.uid()) = user_id);
create policy "Rust collection reader reads owned additions" on public.collection_additions
  for select to mtgscan_collection_reader using ((select auth.uid()) = user_id);
create policy "Rust collection reader reads owned addition lines" on public.collection_addition_lines
  for select to mtgscan_collection_reader using ((select auth.uid()) = user_id);
create policy "Rust collection reader reads owned user tags" on public.user_tags
  for select to mtgscan_collection_reader using ((select auth.uid()) = user_id);
create policy "Rust collection reader reads owned copy user tags" on public.copy_user_tags
  for select to mtgscan_collection_reader using ((select auth.uid()) = user_id);
create policy "Rust collection reader reads owned decks" on public.decks
  for select to mtgscan_collection_reader using ((select auth.uid()) = user_id);
create policy "Rust collection reader reads owned deck cards" on public.deck_cards
  for select to mtgscan_collection_reader using ((select auth.uid()) = user_id);
create policy "Rust collection reader reads owned planned swaps" on public.planned_swaps
  for select to mtgscan_collection_reader using ((select auth.uid()) = user_id);
create policy "Rust collection reader reads card printings" on public.card_printings
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection reader reads cards" on public.cards
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection reader reads card faces" on public.card_faces
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection reader reads current prices" on public.card_prices
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection reader reads import timestamps" on public.import_snapshots
  for select to mtgscan_collection_reader using (true);
