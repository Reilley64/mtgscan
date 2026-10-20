CREATE TABLE "public"."buylist_cards" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"            uuid                     NOT NULL,
  "deck_id"            uuid                     NOT NULL,
  "incoming_oracle_id" uuid                     NOT NULL,
  "as_commander"       boolean                  NOT NULL,
  "outgoing_copy_id"   uuid,
  "outgoing_oracle_id" uuid,
  "reason"             text                     NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "status_changed_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "buylist_cards_check" CHECK (((outgoing_copy_id IS NULL) OR (outgoing_oracle_id IS NOT NULL))),
  CONSTRAINT "buylist_cards_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "buylist_cards_reason_check" CHECK (((char_length(reason) >= 20) AND (char_length(reason) <= 600))),
  CONSTRAINT "buylist_cards_incoming_oracle_id_fkey" FOREIGN KEY (incoming_oracle_id) REFERENCES public.cards(oracle_id),
  CONSTRAINT "buylist_cards_outgoing_oracle_id_fkey" FOREIGN KEY (outgoing_oracle_id) REFERENCES public.cards(oracle_id),
  CONSTRAINT "buylist_cards_user_id_deck_id_fkey" FOREIGN KEY (user_id, deck_id) REFERENCES public.decks(user_id, id) ON DELETE CASCADE,
  "created_by"         uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"         uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."buylist_cards"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."buylist_cards"
  ADD COLUMN "status" public.buylist_card_status NOT NULL DEFAULT 'open'::public.buylist_card_status;

ALTER TABLE "public"."buylist_cards"
  ADD COLUMN "close_note" public.close_note;

CREATE INDEX buylist_cards_by_creation ON public.buylist_cards USING btree (user_id, created_at);

CREATE INDEX buylist_cards_by_deck ON public.buylist_cards USING btree (user_id, deck_id, status);

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.buylist_cards
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "Users read their own buylist cards" ON "public"."buylist_cards"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."buylist_cards" TO "service_role";

REVOKE ALL ON TABLE "public"."buylist_cards" FROM "authenticated";

GRANT SELECT ON TABLE "public"."buylist_cards" TO "authenticated";

REVOKE ALL ON TABLE "public"."buylist_cards" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."buylist_cards" TO "postgres";

REVOKE ALL ON TABLE "public"."buylist_cards" FROM "anon";
