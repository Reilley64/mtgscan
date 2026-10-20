CREATE TABLE "public"."deck_basic_lands" (
  "user_id"    uuid                     NOT NULL,
  "deck_id"    uuid                     NOT NULL,
  "oracle_id"  uuid                     NOT NULL,
  "count"      integer                  NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "deck_basic_lands_count_check" CHECK (((count >= 1) AND (count <= 99))),
  CONSTRAINT "deck_basic_lands_oracle_id_fkey" FOREIGN KEY (oracle_id) REFERENCES public.cards(oracle_id),
  CONSTRAINT "deck_basic_lands_pkey" PRIMARY KEY (user_id, deck_id, oracle_id),
  CONSTRAINT "deck_basic_lands_user_id_deck_id_fkey" FOREIGN KEY (user_id, deck_id) REFERENCES public.decks(user_id, id) ON DELETE CASCADE,
  "created_by" uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by" uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."deck_basic_lands"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.deck_basic_lands
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "The deck evaluation role reads deck basic lands" ON "public"."deck_basic_lands"
  FOR SELECT
  TO "deck_evaluator"
  USING (true);

CREATE POLICY "Users read their own deck basic lands" ON "public"."deck_basic_lands"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT SELECT ON TABLE "public"."deck_basic_lands" TO "deck_evaluator";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_basic_lands" TO "service_role";

REVOKE ALL ON TABLE "public"."deck_basic_lands" FROM "authenticated";

GRANT SELECT ON TABLE "public"."deck_basic_lands" TO "authenticated";

REVOKE ALL ON TABLE "public"."deck_basic_lands" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_basic_lands" TO "postgres";

REVOKE ALL ON TABLE "public"."deck_basic_lands" FROM "anon";
