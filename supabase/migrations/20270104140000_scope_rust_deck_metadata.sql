create role mtgscan_decks login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
alter role mtgscan_decks set statement_timeout = '15s';
alter role mtgscan_decks set search_path = '';

grant usage on schema public, private, auth to mtgscan_decks;
grant execute on function auth.uid(), auth.jwt() to mtgscan_decks;
grant select on table
  public.decks, public.deck_cards, public.deck_basic_lands, public.deck_evaluations,
  public.copies, public.card_printings, public.cards, public.card_prices, private.needs_you_items
to mtgscan_decks;
grant select (user_id, deck_id, status, outgoing_copy_id) on public.planned_swaps to mtgscan_decks;
grant select (user_id, deck_id, status) on public.buylist_cards to mtgscan_decks;
grant insert (user_id, name, priority) on public.decks to mtgscan_decks;
grant update (name, priority, last_used_at) on public.decks to mtgscan_decks;

grant execute on function
  private.deck_row(public.decks),
  private.deck_role(timestamptz),
  private.deck_evaluation_staleness(public.deck_evaluations),
  private.rules_data_behind(public.deck_evaluations),
  private.basic_land_cards(),
  private.basic_land_kinds(),
  private.default_printing_id(uuid),
  private.name_key(text),
  public.catalog_freshness()
to mtgscan_decks;

create policy "Rust decks read owned decks" on public.decks
  for select to mtgscan_decks using ((select auth.uid()) = user_id);
create policy "Rust decks create owned decks" on public.decks
  for insert to mtgscan_decks with check (
    (select auth.uid()) = user_id and not ((select auth.jwt()) ? 'client_id')
  );
create policy "Rust decks edit owned metadata" on public.decks
  for update to mtgscan_decks
  using ((select auth.uid()) = user_id and not ((select auth.jwt()) ? 'client_id'))
  with check ((select auth.uid()) = user_id and not ((select auth.jwt()) ? 'client_id'));
create policy "Rust decks read owned deck cards" on public.deck_cards
  for select to mtgscan_decks using ((select auth.uid()) = user_id);
create policy "Rust decks read owned basic land counts" on public.deck_basic_lands
  for select to mtgscan_decks using ((select auth.uid()) = user_id);
create policy "Rust decks read owned deck evaluations" on public.deck_evaluations
  for select to mtgscan_decks using ((select auth.uid()) = user_id);
create policy "Rust decks read owned copies" on public.copies
  for select to mtgscan_decks using ((select auth.uid()) = user_id);
create policy "Rust decks read owned planned swaps" on public.planned_swaps
  for select to mtgscan_decks using ((select auth.uid()) = user_id);
create policy "Rust decks read owned buylist cards" on public.buylist_cards
  for select to mtgscan_decks using ((select auth.uid()) = user_id);
create policy "Rust decks read card printings" on public.card_printings
  for select to mtgscan_decks using (true);
create policy "Rust decks read cards" on public.cards
  for select to mtgscan_decks using (true);
create policy "Rust decks read current prices" on public.card_prices
  for select to mtgscan_decks using (true);
