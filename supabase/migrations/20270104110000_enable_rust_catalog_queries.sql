grant usage on schema private to mtgscan_collection_reader;
grant execute on function auth.jwt() to mtgscan_collection_reader;

grant select on table
  public.cards,
  public.card_faces,
  public.card_printings,
  public.card_prices,
  public.card_lowest_prices,
  public.oracle_tags,
  public.disabled_tags,
  public.card_taggings,
  public.tag_edges,
  public.combos,
  private.collection_availability
  to mtgscan_collection_reader;

create policy "Rust reader reads lowest current prices" on public.card_lowest_prices
  for select to mtgscan_collection_reader using (true);
create policy "Rust reader reads Oracle tags" on public.oracle_tags
  for select to mtgscan_collection_reader using (true);
create policy "Rust reader reads disabled Oracle tags" on public.disabled_tags
  for select to mtgscan_collection_reader using (true);
create policy "Rust reader reads card Oracle tags" on public.card_taggings
  for select to mtgscan_collection_reader using (true);
create policy "Rust reader reads Oracle tag edges" on public.tag_edges
  for select to mtgscan_collection_reader using (true);
create policy "Rust reader reads combos" on public.combos
  for select to mtgscan_collection_reader using (true);

grant execute on function
  public.search_catalog(jsonb),
  public.get_cards(jsonb),
  public.list_card_printings(jsonb),
  public.search_oracle_tags(jsonb),
  public.catalog_freshness()
  to mtgscan_collection_reader;

do $$
declare
  helper regprocedure;
begin
  for helper in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = any(array[
        'begin_search', 'caller_uses_secret_key', 'card_details_row', 'card_filter_conditions',
        'card_printing_fields', 'catalog_filter_conditions', 'check_card_details_query',
        'check_card_printings_query', 'check_search_query', 'checked_boolean',
        'checked_catalog_values', 'checked_choice', 'checked_choice_list', 'checked_deck_ids', 'checked_integer',
        'checked_list', 'checked_number', 'checked_price', 'checked_tag_slugs', 'checked_text',
        'checked_text_list', 'checked_user_tag_names', 'checked_uuid', 'checked_uuid_list', 'color_bits', 'invalid_argument',
        'keyword_keys', 'name_key', 'owned_copies', 'owned_printing_quantity', 'page_cursor',
        'page_row_ids', 'price_condition', 'price_from', 'price_json', 'printing_filter_conditions',
        'raise_search_error', 'read_page_cursor', 'read_search_cursor', 'record_search',
        'rules_freshness', 'run_catalog_search', 'search_cursor', 'search_page_keys',
        'search_sort_columns', 'some_face_has_type_words', 'tag_closure',
        'tagged_cards_condition', 'text_search', 'type_line_condition', 'type_words', 'usd_amount'
      ])
  loop
    execute format('grant execute on function %s to mtgscan_collection_reader', helper);
  end loop;
end;
$$;
