CREATE OR REPLACE FUNCTION private.swap_effect (
  owner_id           uuid,
  chosen_deck_id     uuid,
  incoming           jsonb,
  outgoing_copy_id   uuid,
  outgoing_oracle_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.deck_change_effect(
    evaluation,
    private.judge_deck(jsonb_build_object(
      'copies',
      coalesce((
        select jsonb_agg(deck_copy)
        from jsonb_array_elements(deck.contents -> 'copies') deck_copy
        where (deck_copy ->> 'copy_id')::uuid is distinct from swap_effect.outgoing_copy_id
      ), '[]'::jsonb) || case when incoming ? 'card_printing_id' then jsonb_build_array(jsonb_build_object(
        'copy_id', coalesce(incoming -> 'copy_id', to_jsonb(gen_random_uuid())),
        'card_printing_id', incoming -> 'card_printing_id',
        'role', case when (incoming ->> 'as_commander')::boolean then 'commander' else 'main' end
      )) else '[]'::jsonb end,
      'basic_lands',
      coalesce((
        select jsonb_agg(jsonb_build_object('oracle_id', land.oracle_id, 'count', land.count) order by land.oracle_id)
        from (
          select counted.oracle_id, sum(counted.count) as count
          from (
            select (stored_land ->> 'oracle_id')::uuid as oracle_id, (stored_land ->> 'count')::integer as count
            from jsonb_array_elements(deck.contents -> 'basic_lands') stored_land
            union all
            select (incoming ->> 'basic_land_oracle_id')::uuid, coalesce((incoming ->> 'count')::integer, 1)
            where incoming ? 'basic_land_oracle_id'
            union all
            select swap_effect.outgoing_oracle_id, -1
            where swap_effect.outgoing_copy_id is null and swap_effect.outgoing_oracle_id is not null
          ) counted
          group by counted.oracle_id
          having sum(counted.count) > 0
        ) land
      ), '[]'::jsonb)
    ))
  )
  from (select private.deck_contents(owner_id, chosen_deck_id) as contents) deck
  left join public.deck_evaluations evaluation on evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
$function$;

GRANT EXECUTE ON FUNCTION "private"."swap_effect"(uuid, uuid, jsonb, uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."swap_effect"(uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."swap_effect"(uuid, uuid, jsonb, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."swap_effect"(uuid, uuid, jsonb, uuid, uuid) TO "postgres";
