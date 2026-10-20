CREATE TABLE "public"."copies" (
  "id"               uuid                     NOT NULL,
  "user_id"          uuid                     NOT NULL,
  "addition_id"      uuid                     NOT NULL,
  "card_printing_id" uuid                     NOT NULL,
  "is_protected"     boolean                  NOT NULL DEFAULT false,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "copies_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "copies_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "copies_user_id_id_fkey" FOREIGN KEY (user_id, id) REFERENCES public.collection_addition_copies(user_id, copy_id) ON DELETE CASCADE,
  "created_by"       uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"       uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."copies"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."copies"
  ADD COLUMN "condition" public.card_condition NOT NULL;

ALTER TABLE "public"."copies"
  ADD COLUMN "finish" public.card_finish NOT NULL;

ALTER TABLE "public"."copies"
  ADD COLUMN "language" public.card_language NOT NULL;

ALTER TABLE "public"."copies"
  ADD CONSTRAINT "copies_addition_id_card_printing_id_finish_condition_langu_fkey" FOREIGN KEY (addition_id, card_printing_id, finish, condition, LANGUAGE)
    REFERENCES public.collection_addition_lines(addition_id, card_printing_id, finish, condition, LANGUAGE) ON DELETE CASCADE;

CREATE INDEX copies_addition_line ON public.copies USING btree (addition_id, card_printing_id, finish, condition, LANGUAGE);

CREATE INDEX copies_card_printing ON public.copies USING btree (user_id, card_printing_id);

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.copies
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "The deck evaluation role reads copies" ON "public"."copies"
  FOR SELECT
  TO "deck_evaluator"
  USING (true);

CREATE POLICY "Users read their own copies" ON "public"."copies"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT SELECT ON TABLE "public"."copies" TO "deck_evaluator";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."copies" TO "service_role";

REVOKE ALL ON TABLE "public"."copies" FROM "authenticated";

GRANT SELECT ON TABLE "public"."copies" TO "authenticated";

REVOKE ALL ON TABLE "public"."copies" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."copies" TO "postgres";

REVOKE ALL ON TABLE "public"."copies" FROM "anon";
