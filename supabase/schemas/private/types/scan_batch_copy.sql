CREATE TYPE "private"."scan_batch_copy" AS (
  "copy_id"          uuid,
  "card_printing_id" uuid,
  "finish"           public.card_finish,
  "condition"        public.card_condition,
  "language"         public.card_language
);
