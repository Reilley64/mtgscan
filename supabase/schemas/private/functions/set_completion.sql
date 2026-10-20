CREATE OR REPLACE FUNCTION private.set_completion (
  counts jsonb[]
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_object_agg(view_completion.finish_view, view_completion.completion)
  from (
    select
      finish_view,
      jsonb_build_object(
        'owned', count(printing.counts) filter (where (printing.counts ->> finish_view)::integer > 0),
        'size', count(printing.counts) filter (where printing.counts ->> finish_view is not null)
      ) as completion
    from unnest(array['any', 'nonfoil', 'foil']) as finish_view
    left join unnest(counts) as printing (counts) on true
    group by finish_view
  ) view_completion;
$function$;

GRANT EXECUTE ON FUNCTION "private"."set_completion"(jsonb[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."set_completion"(jsonb[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."set_completion"(jsonb[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."set_completion"(jsonb[]) TO "postgres";
