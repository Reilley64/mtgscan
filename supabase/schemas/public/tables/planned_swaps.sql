CREATE TABLE "public"."planned_swaps" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"            uuid                     NOT NULL,
  "deck_id"            uuid                     NOT NULL,
  "incoming_copy_id"   uuid,
  "incoming_oracle_id" uuid                     NOT NULL,
  "as_commander"       boolean                  NOT NULL,
  "outgoing_copy_id"   uuid,
  "outgoing_oracle_id" uuid,
  "reason"             text                     NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "status_changed_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "planned_swaps_check" CHECK (((outgoing_copy_id IS NULL) OR (outgoing_oracle_id IS NOT NULL))),
  CONSTRAINT "planned_swaps_incoming_oracle_id_fkey" FOREIGN KEY (incoming_oracle_id) REFERENCES public.cards(oracle_id),
  CONSTRAINT "planned_swaps_outgoing_oracle_id_fkey" FOREIGN KEY (outgoing_oracle_id) REFERENCES public.cards(oracle_id),
  CONSTRAINT "planned_swaps_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "planned_swaps_reason_check" CHECK (((char_length(reason) >= 20) AND (char_length(reason) <= 600))),
  CONSTRAINT "planned_swaps_user_id_deck_id_fkey" FOREIGN KEY (user_id, deck_id) REFERENCES public.decks(user_id, id) ON DELETE CASCADE,
  "created_by"         uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"         uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."planned_swaps"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."planned_swaps"
  ADD COLUMN "close_note" public.close_note;

ALTER TABLE "public"."planned_swaps"
  ADD COLUMN "status" public.planned_swap_status NOT NULL DEFAULT 'open'::public.planned_swap_status;

CREATE INDEX planned_swaps_by_creation ON public.planned_swaps USING btree (user_id, created_at);

CREATE INDEX planned_swaps_by_deck ON public.planned_swaps USING btree (user_id, deck_id, status);

CREATE UNIQUE INDEX planned_swaps_hold_one_copy ON public.planned_swaps USING btree (user_id, incoming_copy_id)
  WHERE (status = 'open'::public.planned_swap_status);

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.planned_swaps
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "Users read their own planned swaps" ON "public"."planned_swaps"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planned_swaps" TO "service_role";

REVOKE ALL ON TABLE "public"."planned_swaps" FROM "authenticated";

GRANT SELECT ON TABLE "public"."planned_swaps" TO "authenticated";

REVOKE ALL ON TABLE "public"."planned_swaps" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."planned_swaps" TO "postgres";

REVOKE ALL ON TABLE "public"."planned_swaps" FROM "anon";
