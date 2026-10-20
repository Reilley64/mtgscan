CREATE OR REPLACE FUNCTION private.scan_batch_result (
  caller   uuid,
  addition public.collection_additions,
  copies   jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'addition_id', addition.id,
    'added_at', addition.added_at,
    'copy_count', coalesce(addition.copy_count, 0),
    'items', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'card_printing_id', line.card_printing_id,
          'finish', line.finish,
          'condition', line.condition,
          'language', line.language,
          'quantity_added', line.quantity
        )
        order by line.card_printing_id, line.finish, line.condition, line.language
      ), '[]'::jsonb)
      from public.collection_addition_lines line
      where line.addition_id = addition.id
    ),
    'copies', (
      select jsonb_agg(
        jsonb_build_object(
          'copy_id', done.copy_id,
          'addition_id', done.addition_id,
          'replayed', done.addition_id is distinct from addition.id
        )
        order by requested.ordinality
      )
      from jsonb_array_elements(copies) with ordinality as requested(element, ordinality)
      join public.collection_addition_copies done
        on done.user_id = caller and done.copy_id = (requested.element ->> 'copy_id')::uuid
    )
  );
$function$;

REVOKE ALL ON FUNCTION "private"."scan_batch_result"(uuid, public.collection_additions, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."scan_batch_result"(uuid, public.collection_additions, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."scan_batch_result"(uuid, public.collection_additions, jsonb) TO "postgres";
