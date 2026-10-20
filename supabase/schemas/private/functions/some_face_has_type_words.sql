CREATE OR REPLACE FUNCTION private.some_face_has_type_words (
  type_line text,
  words     text[]
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from unnest(string_to_array(type_line, ' // ')) as face where private.type_words(face) @> words
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."some_face_has_type_words"(text, text[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."some_face_has_type_words"(text, text[]) TO "service_role";

REVOKE ALL ON FUNCTION "private"."some_face_has_type_words"(text, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."some_face_has_type_words"(text, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."some_face_has_type_words"(text, text[]) TO "postgres";
