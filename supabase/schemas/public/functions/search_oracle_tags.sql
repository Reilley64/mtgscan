CREATE OR REPLACE FUNCTION public.search_oracle_tags (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  rules_freshness record;
  field text;
  value jsonb;
  lookup_text text;
  row_limit integer := 10;
  text_key text;
  text_query tsquery;
  pattern text;
  items jsonb;
begin
  select * into rules_freshness from public.catalog_freshness() f where f.source = 'catalog';
  if rules_freshness.snapshot_at is null then
    perform private.raise_search_error(
      'data_unavailable',
      'No card catalog import has succeeded yet. Try again later.'
    );
  end if;

  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;
  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    case field
      when 'text' then
        lookup_text := private.checked_text(field, value, 100) #>> '{}';
      when 'limit' then
        row_limit := private.checked_integer(field, value, 1, 20)::integer;
      else
        perform private.invalid_argument(field, format('%s is not a known field.', field));
    end case;
  end loop;
  if lookup_text is null then
    perform private.invalid_argument('text', 'text is required.');
  end if;

  text_key := private.name_key(lookup_text);
  text_query := plainto_tsquery('english', lookup_text);
  pattern := '%' || replace(replace(replace(lookup_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with candidates as (
    select
      t.id,
      t.slug,
      t.label,
      t.aliases,
      t.description,
      case
        when text_key = any (t.label_keys) then 0
        when text_key = any (t.alias_keys) then 1
        else 2
      end as match_tier,
      ts_rank(t.search_vector, text_query) as text_rank
    from public.oracle_tags t
    where (
        text_key = any (t.label_keys)
        or text_key = any (t.alias_keys)
        or t.search_vector @@ text_query
        or (t.slug || ' ' || t.label) ilike pattern
      )
      and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
  ),
  ranked as (
    select
      candidate.*,
      (
        select count(distinct ct.oracle_id)
        from private.tag_closure(array[candidate.id]) as closure(tag_id)
        join public.card_taggings ct on ct.tag_id = closure.tag_id
        join public.cards c on c.oracle_id = ct.oracle_id
        where c.commander_legality = 'legal'
          and c.absent_since is null
      ) as card_count
    from candidates candidate
  ),
  top as (
    select *
    from ranked
    order by match_tier, text_rank desc, card_count desc, slug, id
    limit row_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', top.id,
      'slug', top.slug,
      'label', top.label,
      'aliases', to_jsonb(top.aliases),
      'description', top.description,
      'parent_slugs', to_jsonb(array(
        select parent.slug
        from public.tag_edges e
        join public.oracle_tags parent on parent.id = e.parent_id
        where e.child_id = top.id
          and not exists (select 1 from public.disabled_tags d where d.tag_id = parent.id)
        order by parent.slug
      )),
      'card_count', top.card_count
    )
    order by top.match_tier, top.text_rank desc, top.card_count desc, top.slug, top.id
  ), '[]'::jsonb)
  into items
  from top;

  return jsonb_build_object(
    'items', items,
    'rules_data_as_of', rules_freshness.snapshot_at,
    'rules_stale', rules_freshness.is_stale
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."search_oracle_tags"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."search_oracle_tags"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_oracle_tags"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."search_oracle_tags"(jsonb) FROM PUBLIC, "anon", "service_role";
