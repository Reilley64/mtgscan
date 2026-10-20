CREATE TABLE "public"."deck_change_lines" (
  "user_id"          uuid NOT NULL,
  "deck_change_id"   uuid NOT NULL,
  "copy_id"          uuid NOT NULL,
  "card_printing_id" uuid NOT NULL,
  CONSTRAINT "deck_change_lines_card_printing_id_fkey" FOREIGN KEY (card_printing_id) REFERENCES public.card_printings(id),
  CONSTRAINT "deck_change_lines_pkey" PRIMARY KEY (user_id, deck_change_id, copy_id),
  CONSTRAINT "deck_change_lines_user_id_deck_change_id_fkey" FOREIGN KEY (user_id, deck_change_id) REFERENCES public.deck_changes(user_id, id) ON DELETE CASCADE
);

ALTER TABLE "public"."deck_change_lines"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."deck_change_lines"
  ADD COLUMN "finish" public.card_finish NOT NULL;

ALTER TABLE "public"."deck_change_lines"
  ADD COLUMN "place_before" public.deck_role;

ALTER TABLE "public"."deck_change_lines"
  ADD COLUMN "place_after" public.deck_role;

CREATE POLICY "Users read their own deck change lines" ON "public"."deck_change_lines"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_change_lines" TO "service_role";

REVOKE ALL ON TABLE "public"."deck_change_lines" FROM "authenticated";

GRANT SELECT ON TABLE "public"."deck_change_lines" TO "authenticated";

REVOKE ALL ON TABLE "public"."deck_change_lines" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_change_lines" TO "postgres";

REVOKE ALL ON TABLE "public"."deck_change_lines" FROM "anon";
