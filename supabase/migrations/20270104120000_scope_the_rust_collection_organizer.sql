create role mtgscan_collection_organizer login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

alter role mtgscan_collection_organizer set statement_timeout = '15s';
alter role mtgscan_collection_organizer set lock_timeout = '10s';
alter role mtgscan_collection_organizer set idle_in_transaction_session_timeout = '15s';
alter role mtgscan_collection_organizer set search_path = '';

grant usage on schema public, auth to mtgscan_collection_organizer;
grant execute on function auth.uid(), auth.jwt() to mtgscan_collection_organizer;

grant select (user_id, id, is_protected) on public.copies to mtgscan_collection_organizer;
grant update (is_protected) on public.copies to mtgscan_collection_organizer;
grant select (user_id, copy_id) on public.deck_cards to mtgscan_collection_organizer;
grant select (user_id, incoming_copy_id, status) on public.planned_swaps to mtgscan_collection_organizer;
grant select (user_id, id, name, deleted_at) on public.user_tags to mtgscan_collection_organizer;
grant insert (user_id, name), update (name, deleted_at) on public.user_tags to mtgscan_collection_organizer;
grant select (user_id, copy_id, user_tag_id, deleted_at) on public.copy_user_tags to mtgscan_collection_organizer;
grant insert (user_id, copy_id, user_tag_id), update (deleted_at) on public.copy_user_tags to mtgscan_collection_organizer;

create policy "Rust organizer reads owned copies" on public.copies
  for select to mtgscan_collection_organizer using ((select auth.uid()) = user_id);
create policy "Rust organizer protects owned copies" on public.copies
  for update to mtgscan_collection_organizer using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Rust organizer reads owned deck cards" on public.deck_cards
  for select to mtgscan_collection_organizer using ((select auth.uid()) = user_id);
create policy "Rust organizer reads owned holds" on public.planned_swaps
  for select to mtgscan_collection_organizer using ((select auth.uid()) = user_id);
create policy "Rust organizer reads owned user tags" on public.user_tags
  for select to mtgscan_collection_organizer using ((select auth.uid()) = user_id);
create policy "Rust organizer creates owned user tags" on public.user_tags
  for insert to mtgscan_collection_organizer with check ((select auth.uid()) = user_id);
create policy "Rust organizer changes owned user tags" on public.user_tags
  for update to mtgscan_collection_organizer using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Rust organizer reads owned user tag links" on public.copy_user_tags
  for select to mtgscan_collection_organizer using ((select auth.uid()) = user_id);
create policy "Rust organizer creates owned user tag links" on public.copy_user_tags
  for insert to mtgscan_collection_organizer with check ((select auth.uid()) = user_id);
create policy "Rust organizer changes owned user tag links" on public.copy_user_tags
  for update to mtgscan_collection_organizer using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
