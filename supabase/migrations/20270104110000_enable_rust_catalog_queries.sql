create or replace function private.caller_uses_secret_key()
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if current_user = session_user and current_user = 'mtgscan_collection_reader' then
    return false;
  end if;
  return coalesce(auth.jwt() ->> 'role' = 'service_role', false);
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc recorder
    join pg_catalog.pg_proc owner_context
      on owner_context.oid = pg_catalog.to_regprocedure('private.collection_reader_owner_id()')
    where recorder.oid = pg_catalog.to_regprocedure('private.record_search(uuid,public.search_api,jsonb,bigint,double precision,uuid[])')
      and recorder.prosecdef
      and pg_catalog.has_schema_privilege(recorder.proowner, owner_context.pronamespace, 'USAGE')
      and pg_catalog.has_function_privilege(recorder.proowner, owner_context.oid, 'EXECUTE')
  ) then
    raise exception using errcode = '42501', message = 'The Catalog recorder owner cannot read Collection reader context';
  end if;
end;
$$;

create or replace function private.record_search(
  search_id uuid,
  api public.search_api,
  query jsonb,
  result_count bigint,
  latency_ms double precision,
  result_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id pg_catalog.uuid;
  caller_kind pg_catalog.text;
begin
  if session_user = 'mtgscan_collection_reader' then
    owner_id := private.collection_reader_owner_id();
    caller_kind := pg_catalog.current_setting('mtgscan.reader_caller', true);
    if api is distinct from 'catalog'::public.search_api
      or owner_id is null
      or caller_kind is null
      or caller_kind not in ('app', 'mcp')
    then
      raise exception using errcode = '42501', message = 'Invalid Catalog reader telemetry context';
    end if;
  else
    owner_id := auth.uid();
    caller_kind := case
      when private.caller_uses_secret_key() then 'release_check'
      when auth.jwt() ->> 'client_id' is not null then 'mcp'
      else 'app'
    end;
  end if;

  insert into public.search_telemetry (
    search_id, user_id, api, caller, query, result_count, latency_ms, result_ids
  )
  values (search_id, owner_id, api, caller_kind::public.search_caller, query, result_count, latency_ms, result_ids);
end;
$$;

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

create function private.catalog_reader_helpers()
returns setof pg_catalog.regprocedure
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.to_regprocedure('private.' || required.signature)
  from pg_catalog.unnest(array[
    'begin_search(public.search_api,jsonb)', 'caller_uses_secret_key()',
    'card_details_row(public.cards,public.card_printings)', 'card_filter_conditions(jsonb)',
    'card_printing_fields(public.card_printings)', 'catalog_filter_conditions(jsonb)',
    'check_card_details_query(jsonb)', 'check_card_printings_query(jsonb)',
    'check_search_query(jsonb,public.search_api)', 'checked_boolean(text,jsonb)',
    'checked_catalog_values(text,jsonb,text)', 'checked_choice(text,jsonb,text[])',
    'checked_choice_list(text,jsonb,text[],integer)', 'checked_deck_ids(text,jsonb)',
    'checked_integer(text,jsonb,integer,integer)', 'checked_list(text,jsonb,integer,integer)',
    'checked_number(text,jsonb,integer,integer)', 'checked_price(text,jsonb)',
    'checked_tag_slugs(text,jsonb)', 'checked_text(text,jsonb,integer)',
    'checked_text_list(text,jsonb)', 'checked_user_tag_names(text,jsonb)',
    'checked_uuid(text,jsonb)', 'checked_uuid_list(text,jsonb,integer)',
    'color_bits(text[])', 'invalid_argument(text,text)', 'keyword_keys(text[])',
    'name_key(text)', 'owned_copies(uuid)', 'owned_printing_quantity(uuid)',
    'page_cursor(text,jsonb)', 'page_row_ids(jsonb)', 'price_condition(text,jsonb)',
    'price_from(uuid)', 'price_json(integer,public.card_finish)', 'printing_filter_conditions(jsonb,text)',
    'raise_search_error(text,text,text)', 'read_page_cursor(text,text,integer)', 'read_search_cursor(text,text)',
    'record_search(uuid,public.search_api,jsonb,bigint,double precision,uuid[])',
    'rules_freshness()', 'run_catalog_search(jsonb)', 'search_cursor(uuid,text,jsonb)',
    'search_page_keys(text,text,boolean,jsonb,integer)', 'search_sort_columns(text,boolean,text,text,text,text)',
    'some_face_has_type_words(text,text[])', 'tag_closure(uuid[])', 'tagged_cards_condition(text)',
    'text_search(jsonb)', 'type_line_condition(text)', 'type_words(text)', 'usd_amount(bigint)'
  ]) as required(signature);
$$;

revoke all on function private.catalog_reader_helpers() from public, anon, authenticated, service_role;
grant execute on function private.catalog_reader_helpers() to mtgscan_collection_reader;

do $$
declare
  helper regprocedure;
begin
  for helper in select private.catalog_reader_helpers()
  loop
    if helper is null then
      raise exception 'A required Catalog reader helper is absent';
    end if;
    execute format('grant execute on function %s to mtgscan_collection_reader', helper);
  end loop;
end;
$$;
