alter function public.search_catalog(jsonb) security invoker;
alter function public.search_collection(jsonb) security invoker;
alter function public.get_cards(jsonb) security invoker;
alter function public.list_card_printings(jsonb) security invoker;

create function private.caller_is_release_check()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role' = 'service_role', false);
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
language sql
security definer
set search_path = ''
as $$
  insert into public.search_telemetry (
    search_id, user_id, api, caller, query, result_count, latency_ms, result_ids
  )
  select
    search_id,
    auth.uid(),
    api,
    case when private.caller_is_release_check() then 'release_check' else 'app' end::public.search_caller,
    query,
    result_count,
    latency_ms,
    result_ids;
$$;

create or replace view private.collection_availability with (security_invoker = true) as
select
  entry.id as collection_entry_id,
  entry.user_id,
  entry.card_printing_id,
  printing.oracle_id,
  entry.finish,
  entry.condition,
  entry.language,
  entry.is_protected,
  entry.quantity,
  deck_use.allocated_quantity,
  deck_use.held_quantity,
  greatest(entry.quantity - deck_use.allocated_quantity - deck_use.held_quantity, 0) as free_quantity
from public.collection_entries entry
join public.card_printings printing on printing.id = entry.card_printing_id
cross join lateral (
  select 0 as allocated_quantity, 0 as held_quantity
) deck_use;

create or replace function private.owned_copies(oracle_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'quantity', coalesce(sum(a.quantity), 0),
    'free_quantity', coalesce(sum(a.free_quantity), 0),
    'protected_free_quantity', coalesce(sum(a.free_quantity) filter (where a.is_protected), 0)
  )
  from private.collection_availability a
  where a.oracle_id = owned_copies.oracle_id and not private.caller_is_release_check();
$$;
create or replace function public.list_collection_printings(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  page_size integer;
  query_hash text;
  after_key jsonb;
  after_latest_addition_at timestamptz;
  after_name text;
  after_id uuid;
  page_rows jsonb;
  last_row jsonb;
  next_cursor text;
begin
  caller := private.caller_user_id();
  checked := private.check_collection_printings_query(query);
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('collection printings ' || caller::text);

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', query_hash, 3);
    begin
      after_latest_addition_at := (after_key ->> 0)::timestamptz;
      after_name := after_key ->> 1;
      after_id := (after_key ->> 2)::uuid;
    exception when others then
      after_id := null;
    end;
    if num_nulls(after_latest_addition_at, after_name, after_id) > 0 then
      perform private.raise_search_error(
        'invalid_cursor',
        'The cursor is not valid. Start again without a cursor.',
        'cursor'
      );
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(page) order by page.latest_addition_at desc, page.name, page.printing_id), '[]'::jsonb)
  into page_rows
  from (
    select
      p.id as printing_id,
      c.name,
      p.set_code as set,
      p.collector_number,
      p.image_uris,
      owned.owned_quantity,
      owned.latest_addition_at
    from (
      select
        e.card_printing_id,
        sum(e.quantity)::integer as owned_quantity,
        max(e.latest_addition_at) as latest_addition_at
      from public.collection_entries e
      group by e.card_printing_id
    ) owned
    join public.card_printings p on p.id = owned.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
    where after_key is null
      or owned.latest_addition_at < after_latest_addition_at
      or (
        owned.latest_addition_at = after_latest_addition_at
        and (c.name, p.id) > (after_name, after_id)
      )
    order by owned.latest_addition_at desc, c.name, p.id
    limit page_size + 1
  ) page;

  if jsonb_array_length(page_rows) > page_size then
    page_rows := page_rows - page_size;
    last_row := page_rows -> (page_size - 1);
    next_cursor := private.page_cursor(
      query_hash,
      jsonb_build_array(last_row -> 'latest_addition_at', last_row -> 'name', last_row -> 'printing_id')
    );
  end if;

  return jsonb_build_object('items', page_rows, 'next_cursor', next_cursor);
end;
$$;

revoke execute on all functions in schema private from public;
alter default privileges in schema private revoke execute on functions from public;

grant usage on schema private to authenticated, service_role;
grant select on table private.collection_availability to authenticated, service_role;

grant execute on function
  private.caller_is_release_check(),
  private.card_filter_conditions(jsonb),
  private.catalog_filter_conditions(jsonb),
  private.check_search_query(jsonb, public.search_api),
  private.checked_boolean(text, jsonb),
  private.checked_catalog_values(text, jsonb, text),
  private.checked_choice(text, jsonb, text[]),
  private.checked_choice_list(text, jsonb, text[], integer),
  private.checked_deck_ids(text, jsonb),
  private.checked_integer(text, jsonb, integer, integer),
  private.checked_list(text, jsonb, integer, integer),
  private.checked_number(text, jsonb, integer, integer),
  private.checked_price(text, jsonb),
  private.checked_tag_slugs(text, jsonb),
  private.checked_text(text, jsonb, integer),
  private.checked_text_list(text, jsonb),
  private.checked_uuid(text, jsonb),
  private.checked_uuid_list(text, jsonb, integer),
  private.collection_filter_conditions(jsonb),
  private.color_bits(text[]),
  private.finish_price_cents(public.card_prices, public.card_finish, public.price_currency),
  private.invalid_argument(text, text),
  private.keyword_keys(text[]),
  private.name_key(text),
  private.owned_copies(uuid),
  private.price_condition(text, jsonb),
  private.price_from(uuid, public.price_currency),
  private.printing_filter_conditions(jsonb, text),
  private.raise_search_error(text, text, text),
  private.read_search_cursor(text, text),
  private.record_search(uuid, public.search_api, jsonb, bigint, double precision, uuid[]),
  private.run_search(public.search_api, jsonb),
  private.search_cursor(uuid, text, jsonb),
  private.some_face_has_type_words(text, text[]),
  private.tag_closure(uuid[]),
  private.tagged_cards_condition(text),
  private.text_search(jsonb),
  private.type_line_condition(text),
  private.type_words(text)
to authenticated, service_role;

grant execute on function
  private.caller_user_id(),
  private.card_details_row(public.cards, public.card_printings),
  private.card_printing_fields(public.card_printings),
  private.check_card_details_query(jsonb),
  private.check_card_printings_query(jsonb),
  private.check_collection_printings_query(jsonb),
  private.owned_printing_quantity(uuid),
  private.page_cursor(text, jsonb),
  private.read_page_cursor(text, text, integer),
  private.rules_freshness()
to authenticated;

grant execute on function
  private.card_search_vector(text, text, text, text[]),
  private.color_bits(text[]),
  private.keyword_keys(text[]),
  private.tag_search_vector(text, text[])
to catalog_importer;

grant execute on function private.is_sorted_set(uuid[]) to service_role;
