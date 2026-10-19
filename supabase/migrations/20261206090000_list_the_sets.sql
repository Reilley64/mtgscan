create function private.set_card_printings(set_codes text[])
returns table (set_code text, card_printing_id uuid, in_main_set boolean)
language sql
stable
set search_path = ''
as $$
  with printing as (
    select p.set_code, p.id, p.booster, p.promo, p.variation
    from public.card_printings p
    where p.set_code = any (set_codes)
      and p.absent_since is null
      and not exists (select 1 from private.basic_land_cards() land where land.oracle_id = p.oracle_id)
  ),
  set_printings as (
    select
      printing.*,
      bool_or(printing.booster) over (partition by printing.set_code) as set_has_booster_cards,
      bool_and(printing.promo) over (partition by printing.set_code) as set_has_only_promos
    from printing
  )
  select
    set_printings.set_code,
    set_printings.id,
    case
      when set_printings.set_has_booster_cards then set_printings.booster and not set_printings.promo and not set_printings.variation
      when set_printings.set_has_only_promos then true
      else not set_printings.promo
    end
  from set_printings;
$$;

grant execute on function private.set_card_printings(text[]) to authenticated;

create function public.list_sets()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return jsonb_build_object('items', coalesce((
    with released_set as (
      select card_set.code, card_set.name, card_set.icon_svg_uri, card_set.released_at
      from public.card_sets card_set
      where card_set.released_at <= current_date
        and exists (
          select 1 from public.card_printings p where p.set_code = card_set.code and p.absent_since is null
        )
    ),
    completion as (
      select
        printing.set_code,
        count(*) as size,
        count(*) filter (
          where exists (select 1 from public.copies owned where owned.card_printing_id = printing.card_printing_id)
        ) as owned
      from private.set_card_printings(array(select released_set.code from released_set)) printing
      where printing.in_main_set
      group by printing.set_code
    )
    select jsonb_agg(
      jsonb_build_object(
        'code', released_set.code,
        'name', released_set.name,
        'icon_svg_uri', released_set.icon_svg_uri,
        'released_at', released_set.released_at,
        'completion', jsonb_build_object(
          'any', jsonb_build_object('owned', coalesce(completion.owned, 0), 'size', coalesce(completion.size, 0))
        )
      )
      order by released_set.released_at desc, released_set.name, released_set.code
    )
    from released_set
    left join completion on completion.set_code = released_set.code
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.list_sets() from public, anon, service_role;
grant execute on function public.list_sets() to authenticated;
