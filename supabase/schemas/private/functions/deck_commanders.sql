CREATE OR REPLACE FUNCTION private.deck_commanders (
  contents jsonb
)
  RETURNS TABLE (
    copy_id                 uuid,
    name                    text,
    card                    jsonb,
    has_rules_data          boolean,
    can_be_commander        boolean,
    is_background           boolean,
    is_time_lord_doctor     boolean,
    has_partner             boolean,
    partner_text            text,
    partner_with_name       text,
    has_choose_a_background boolean,
    has_doctors_companion   boolean
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    copy.copy_id,
    card.name,
    deck_card.card,
    listed.oracle_id is not null,
    listed.can_be_commander,
    private.has_subtype(listed.type_line, 'Background'),
    private.has_subtype(listed.type_line, 'Time Lord') and private.has_subtype(listed.type_line, 'Doctor'),
    listed.has_partner,
    listed.partner_text,
    listed.partner_with_name,
    listed.has_choose_a_background,
    listed.has_doctors_companion
  from private.deck_evaluation_cards(contents) deck_card
  join jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, role public.deck_role)
    on copy.copy_id = (deck_card.card ->> 'copy_id')::uuid
  join public.cards card on card.oracle_id = deck_card.oracle_id
  left join public.cards listed on listed.oracle_id = card.oracle_id and listed.absent_since is null
  where copy.role = 'commander'
  order by card.name, copy.copy_id;
$function$;

REVOKE ALL ON FUNCTION "private"."deck_commanders"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_commanders"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_commanders"(jsonb) TO "postgres";
