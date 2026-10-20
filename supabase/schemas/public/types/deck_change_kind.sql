CREATE TYPE "public"."deck_change_kind" AS ENUM (
  'added',
  'removed',
  'made_commander',
  'made_partner',
  'moved_to_main_deck',
  'basic_lands',
  'removed_from_collection',
  'revert',
  'swapped_in',
  'bought'
);
