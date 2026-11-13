with recursive relevant as (
  select distinct printing.oracle_id from public.copies copy
  join public.card_printings printing on printing.id = copy.card_printing_id
  where copy.user_id = $1::uuid
  union
  select land.oracle_id from private.basic_land_cards() land where land.oracle_id is not null
), tags(oracle_id, tag_id) as (
  select link.oracle_id, link.tag_id from public.card_taggings link
  join relevant on relevant.oracle_id = link.oracle_id
  where not exists (select 1 from public.disabled_tags disabled where disabled.tag_id = link.tag_id)
  union
  select tags.oracle_id, edge.parent_id from tags
  join public.tag_edges edge on edge.child_id = tags.tag_id
  where not exists (select 1 from public.disabled_tags disabled where disabled.tag_id = edge.parent_id)
)
select c.oracle_id::text, c.name_key, c.type_line, c.colors, c.color_identity,
  c.mana_value::double precision, c.can_be_commander, coalesce(c.is_game_changer, false) as is_game_changer,
  c.edhrec_rank::double precision,
  (c.released_at - date '1970-01-01')::double precision as released_at,
  private.keyword_keys(c.keywords) as keywords,
  array(select tag.slug from tags join public.oracle_tags tag on tag.id = tags.tag_id where tags.oracle_id = c.oracle_id) as tags,
  coalesce((select jsonb_agg(case when face.power ~ '^-?[0-9]+(\.[0-9]+)?$' then face.power::double precision end order by face.face_index)
    from public.card_faces face where face.oracle_id = c.oracle_id), '[]') as powers,
  coalesce((select jsonb_agg(case when face.toughness ~ '^-?[0-9]+(\.[0-9]+)?$' then face.toughness::double precision end order by face.face_index)
    from public.card_faces face where face.oracle_id = c.oracle_id), '[]') as toughnesses,
  (__TEXT_MATCH__) as text_match,
  coalesce((__TEXT_TIER__)::double precision, 0) as text_tier,
  (__TEXT_RANK__)::double precision as text_rank
from public.cards c join relevant on relevant.oracle_id = c.oracle_id
