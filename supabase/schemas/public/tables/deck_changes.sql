CREATE TABLE "public"."deck_changes" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "deck_id"     uuid                     NOT NULL,
  "revision"    integer                  NOT NULL,
  "changed_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "reverted_by" uuid,
  "reason"      text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "deck_changes_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "deck_changes_revision_check" CHECK ((revision > 0)),
  CONSTRAINT "deck_changes_user_id_deck_id_revision_key" UNIQUE (user_id, deck_id, revision),
  CONSTRAINT "deck_changes_user_id_reverted_by_fkey" FOREIGN KEY (user_id, reverted_by) REFERENCES public.deck_changes(user_id, id),
  CONSTRAINT "deck_changes_user_id_deck_id_fkey" FOREIGN KEY (user_id, deck_id) REFERENCES public.decks(user_id, id) ON DELETE CASCADE,
  "created_by"  uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"  uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."deck_changes"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."deck_changes"
  ADD COLUMN "kind" public.deck_change_kind NOT NULL;

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.deck_changes
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "Users read their own deck changes" ON "public"."deck_changes"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_changes" TO "service_role";

REVOKE ALL ON TABLE "public"."deck_changes" FROM "authenticated";

GRANT SELECT ON TABLE "public"."deck_changes" TO "authenticated";

REVOKE ALL ON TABLE "public"."deck_changes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_changes" TO "postgres";

REVOKE ALL ON TABLE "public"."deck_changes" FROM "anon";
