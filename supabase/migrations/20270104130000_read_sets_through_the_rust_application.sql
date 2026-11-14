grant select (code, name, icon_svg_uri, released_at) on public.card_sets to mtgscan_collection_reader;
grant select (set_code, position, name) on public.set_sections to mtgscan_collection_reader;
grant select (set_code, position, card_printing_id) on public.set_section_card_printings to mtgscan_collection_reader;
grant select (booster, promo, variation, finishes, absent_since) on public.card_printings to mtgscan_collection_reader;

create policy "Rust collection reader reads sets" on public.card_sets
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection reader reads set sections" on public.set_sections
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection reader reads set section card printings" on public.set_section_card_printings
  for select to mtgscan_collection_reader using (true);
