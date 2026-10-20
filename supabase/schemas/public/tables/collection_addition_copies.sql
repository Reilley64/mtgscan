CREATE TABLE "public"."collection_addition_copies" (
  "user_id"          uuid NOT NULL,
  "copy_id"          uuid NOT NULL,
  "addition_id"      uuid NOT NULL,
  "card_printing_id" uuid NOT NULL,
  CONSTRAINT "collection_addition_copies_pkey" PRIMARY KEY (user_id, copy_id),
  CONSTRAINT "collection_addition_copies_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."collection_addition_copies"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."collection_addition_copies"
  ADD COLUMN "condition" public.card_condition NOT NULL;

ALTER TABLE "public"."collection_addition_copies"
  ADD COLUMN "finish" public.card_finish NOT NULL;

ALTER TABLE "public"."collection_addition_copies"
  ADD COLUMN "language" public.card_language NOT NULL;

ALTER TABLE "public"."collection_addition_copies"
  ADD CONSTRAINT "collection_addition_copies_addition_id_card_printing_id_fi_fkey" FOREIGN KEY (addition_id, card_printing_id, finish, condition, LANGUAGE)
    REFERENCES public.collection_addition_lines(addition_id, card_printing_id, finish, condition, LANGUAGE) ON DELETE CASCADE;

CREATE INDEX collection_addition_copies_line ON public.collection_addition_copies USING btree (addition_id, card_printing_id, finish, condition, LANGUAGE);

CREATE POLICY "Users read their own addition copies" ON "public"."collection_addition_copies"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."collection_addition_copies" TO "service_role";

REVOKE ALL ON TABLE "public"."collection_addition_copies" FROM "authenticated";

GRANT SELECT ON TABLE "public"."collection_addition_copies" TO "authenticated";

REVOKE ALL ON TABLE "public"."collection_addition_copies" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."collection_addition_copies" TO "postgres";

REVOKE ALL ON TABLE "public"."collection_addition_copies" FROM "anon";
