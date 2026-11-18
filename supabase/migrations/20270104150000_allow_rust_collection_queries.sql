grant usage on schema private to mtgscan_collection_reader;
grant select (created_at) on public.copies to mtgscan_collection_reader;
grant select (released_at, absent_since, finishes, lang) on public.card_printings to mtgscan_collection_reader;
grant select (name_key, colors, color_identity, mana_value, can_be_commander, is_game_changer,
  edhrec_rank, released_at, keywords, search_vector, absent_since) on public.cards to mtgscan_collection_reader;
grant select (power, toughness) on public.card_faces to mtgscan_collection_reader;
grant select (snapshot_at) on public.import_snapshots to mtgscan_collection_reader;
grant select (id, slug, search_vector, label_keys, alias_keys) on public.oracle_tags to mtgscan_collection_reader;
grant select (parent_id, child_id) on public.tag_edges to mtgscan_collection_reader;
grant select (oracle_id, tag_id) on public.card_taggings to mtgscan_collection_reader;
grant select (tag_id) on public.disabled_tags to mtgscan_collection_reader;

grant execute on function private.text_search(jsonb), private.name_key(text),
  private.keyword_keys(text[]), private.tagged_cards_condition(text), private.tag_closure(uuid[]),
  private.basic_land_cards(), private.basic_land_kinds(), private.default_printing_id(uuid)
  to mtgscan_collection_reader;

create policy "Rust collection queries read Oracle tags" on public.oracle_tags
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection queries read tag edges" on public.tag_edges
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection queries read card taggings" on public.card_taggings
  for select to mtgscan_collection_reader using (true);
create policy "Rust collection queries read disabled tags" on public.disabled_tags
  for select to mtgscan_collection_reader using (true);
