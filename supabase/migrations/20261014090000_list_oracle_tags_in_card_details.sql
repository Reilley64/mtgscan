create or replace function private.card_details_row(card public.cards, printing public.card_printings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'oracle_id', card.oracle_id,
    'name', card.name,
    'mana_cost', card.mana_cost,
    'mana_value', card.mana_value,
    'type_line', card.type_line,
    'oracle_text', card.oracle_text,
    'colors', to_jsonb(card.colors),
    'color_identity', to_jsonb(card.color_identity),
    'keywords', to_jsonb(card.keywords),
    'faces', (
      select coalesce(jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'name', f.name,
          'mana_cost', f.mana_cost,
          'type_line', f.type_line,
          'oracle_text', f.oracle_text,
          'colors', to_jsonb(f.colors),
          'power', f.power,
          'toughness', f.toughness,
          'loyalty', f.loyalty
        ))
        order by f.face_index
      ), '[]'::jsonb)
      from public.card_faces f
      where f.oracle_id = card.oracle_id
    ),
    'commander_legality', card.commander_legality,
    'can_be_commander', card.can_be_commander,
    'is_game_changer', card.is_game_changer,
    'edhrec_rank', card.edhrec_rank,
    'released_at', card.released_at,
    'printing_count', (
      select count(*)
      from public.card_printings p
      where p.oracle_id = card.oracle_id and p.absent_since is null
    ),
    'price_from', private.price_from(card.oracle_id, 'USD'),
    'owned', jsonb_build_object('quantity', 0, 'free_quantity', 0, 'protected_free_quantity', 0),
    'tags', (
      select coalesce(jsonb_agg(
        jsonb_build_object('slug', t.slug, 'label', t.label)
        order by t.label collate "C", t.slug
      ), '[]'::jsonb)
      from public.card_taggings ct
      join public.oracle_tags t on t.id = ct.tag_id
      where ct.oracle_id = card.oracle_id
        and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
    )
  ) || case
    when printing.id is null then '{}'::jsonb
    else jsonb_build_object('printing', private.card_printing_fields(printing))
  end;
$$;
