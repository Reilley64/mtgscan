CREATE TABLE "public"."deck_cards" (
  "user_id"      uuid                     NOT NULL,
  "deck_id"      uuid                     NOT NULL,
  "copy_id"      uuid                     NOT NULL,
  "commander_at" timestamp with time zone,
  "added_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "deck_cards_pkey" PRIMARY KEY (user_id, copy_id),
  CONSTRAINT "deck_cards_user_id_copy_id_fkey" FOREIGN KEY (user_id, copy_id) REFERENCES public.copies(user_id, id) ON DELETE CASCADE,
  CONSTRAINT "deck_cards_user_id_deck_id_fkey" FOREIGN KEY (user_id, deck_id) REFERENCES public.decks(user_id, id) ON DELETE CASCADE,
  "created_by"   uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"   uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."deck_cards"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX deck_cards_deck ON public.deck_cards USING btree (user_id, deck_id);

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.deck_cards
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "The deck evaluation role reads deck cards" ON "public"."deck_cards"
  FOR SELECT
  TO "deck_evaluator"
  USING (true);

CREATE POLICY "Users read their own deck cards" ON "public"."deck_cards"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT SELECT ON TABLE "public"."deck_cards" TO "deck_evaluator";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_cards" TO "service_role";

REVOKE ALL ON TABLE "public"."deck_cards" FROM "authenticated";

GRANT SELECT ON TABLE "public"."deck_cards" TO "authenticated";

REVOKE ALL ON TABLE "public"."deck_cards" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_cards" TO "postgres";

REVOKE ALL ON TABLE "public"."deck_cards" FROM "anon";
