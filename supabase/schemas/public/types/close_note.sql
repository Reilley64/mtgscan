CREATE TYPE "public"."close_note" AS ENUM (
  'closed_by_user',
  'closed_by_ai_client',
  'outgoing_left_deck',
  'held_copy_deleted',
  'held_copy_reverted'
);
