create function private.listed_sets()
returns setof public.card_sets
language sql
stable
set search_path = ''
as $$
  select card_set.*
  from public.card_sets card_set
  where card_set.released_at <= current_date
    and exists (
      select 1 from public.card_printings p where p.set_code = card_set.code and p.absent_since is null
    );
$$;

create function private.set_card_printing_counts(set_codes text[])
returns table (set_code text, card_printing_id uuid, in_main_set boolean, any_count integer)
language sql
stable
set search_path = ''
as $$
  select printing.set_code, printing.card_printing_id, printing.in_main_set, coalesce(owned.copies, 0)::integer
  from private.set_card_printings(set_codes) printing
  left join (
    select copy.card_printing_id, count(*) as copies
    from public.copies copy
    group by copy.card_printing_id
  ) owned on owned.card_printing_id = printing.card_printing_id;
$$;

create function private.set_completion(any_counts integer[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'any', jsonb_build_object(
      'owned', coalesce(cardinality(array(select count from unnest(any_counts) count where count > 0)), 0),
      'size', coalesce(cardinality(any_counts), 0)
    )
  );
$$;

create function private.set_row(card_set public.card_sets, completion jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', card_set.code,
    'name', card_set.name,
    'icon_svg_uri', card_set.icon_svg_uri,
    'released_at', card_set.released_at,
    'completion', completion
  );
$$;

create or replace function public.list_sets()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return jsonb_build_object('items', coalesce((
    with main_set as (
      select printing.set_code, array_agg(printing.any_count) as any_counts
      from private.set_card_printing_counts(array(select listed_set.code from private.listed_sets() listed_set)) printing
      where printing.in_main_set
      group by printing.set_code
    )
    select jsonb_agg(
      private.set_row(listed_set, private.set_completion(main_set.any_counts))
      order by listed_set.released_at desc, listed_set.name, listed_set.code
    )
    from private.listed_sets() listed_set
    left join main_set on main_set.set_code = listed_set.code
  ), '[]'::jsonb));
end;
$$;

create function private.check_set_query(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  checked_value jsonb;
  field text;
  value jsonb;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field = 'code' then
        private.checked_text(field, value, 16)
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'code' then
    perform private.invalid_argument('code', 'code is required.');
  end if;
  return checked;
end;
$$;

create function public.get_set(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  card_set public.card_sets;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_set_query(query);
  select * into card_set from private.listed_sets() listed_set where listed_set.code = checked ->> 'code';
  if card_set.code is null then
    perform private.raise_search_error('not_found', 'code is not a released set in the card catalog.', 'code');
  end if;

  with printing as (
    select
      counts.in_main_set,
      counts.any_count,
      (substring(p.collector_number from '^[0-9]+'))::numeric as collector_digits,
      p.collector_number,
      jsonb_build_object(
        'printing_id', p.id,
        'name', c.name,
        'collector_number', p.collector_number,
        'image_uri', p.image_uris[1],
        'finishes', to_jsonb(p.finishes),
        'counts', jsonb_build_object('any', counts.any_count)
      ) as row
    from private.set_card_printing_counts(array[card_set.code]) counts
    join public.card_printings p on p.id = counts.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
  )
  select
    private.set_row(card_set, private.set_completion(array_agg(printing.any_count) filter (where printing.in_main_set)))
    || jsonb_build_object(
      'main_set', coalesce(
        jsonb_agg(printing.row order by printing.collector_digits nulls last, printing.collector_number)
          filter (where printing.in_main_set),
        '[]'::jsonb
      ),
      'variants', jsonb_build_object(
        'completion', private.set_completion(array_agg(printing.any_count) filter (where not printing.in_main_set)),
        'card_printings', coalesce(
          jsonb_agg(printing.row order by printing.collector_digits nulls last, printing.collector_number)
            filter (where not printing.in_main_set),
          '[]'::jsonb
        )
      )
    )
  into result
  from printing;
  return result;
end;
$$;

grant execute on function
  private.listed_sets(),
  private.set_card_printing_counts(text[]),
  private.set_completion(integer[]),
  private.set_row(public.card_sets, jsonb),
  private.check_set_query(jsonb)
to authenticated;

revoke all on function public.get_set(jsonb) from public, anon, service_role;
grant execute on function public.get_set(jsonb) to authenticated;
