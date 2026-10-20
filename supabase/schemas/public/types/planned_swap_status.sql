CREATE TYPE "public"."planned_swap_status" AS ENUM (
  'open',
  'swapped_in',
  'closed',
  'moved_to_buylist'
);
