CREATE TABLE "public"."deck_change_basic_lands" (
  "user_id"        uuid    NOT NULL,
  "deck_change_id" uuid    NOT NULL,
  "oracle_id"      uuid    NOT NULL,
  "count_before"   integer NOT NULL,
  "count_after"    integer NOT NULL,
  CONSTRAINT "deck_change_basic_lands_count_after_check" CHECK (((count_after >= 0) AND (count_after <= 99))),
  CONSTRAINT "deck_change_basic_lands_count_before_check" CHECK (((count_before >= 0) AND (count_before <= 99))),
  CONSTRAINT "deck_change_basic_lands_oracle_id_fkey" FOREIGN KEY (oracle_id) REFERENCES public.cards(oracle_id),
  CONSTRAINT "deck_change_basic_lands_pkey" PRIMARY KEY (user_id, deck_change_id, oracle_id),
  CONSTRAINT "deck_change_basic_lands_user_id_deck_change_id_fkey" FOREIGN KEY (user_id, deck_change_id) REFERENCES public.deck_changes(user_id, id) ON DELETE CASCADE
);

ALTER TABLE "public"."deck_change_basic_lands"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own deck change basic lands" ON "public"."deck_change_basic_lands"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_change_basic_lands" TO "service_role";

REVOKE ALL ON TABLE "public"."deck_change_basic_lands" FROM "authenticated";

GRANT SELECT ON TABLE "public"."deck_change_basic_lands" TO "authenticated";

REVOKE ALL ON TABLE "public"."deck_change_basic_lands" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_change_basic_lands" TO "postgres";

REVOKE ALL ON TABLE "public"."deck_change_basic_lands" FROM "anon";
