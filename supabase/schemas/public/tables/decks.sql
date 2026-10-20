CREATE TABLE "public"."decks" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "revision"     integer                  NOT NULL DEFAULT 0,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "decks_name_check" CHECK (((name !~ '^\s|\s$'::text) AND ((char_length(name) >= 1) AND (char_length(name) <= 64)))),
  CONSTRAINT "decks_pkey" PRIMARY KEY (user_id, id),
  CONSTRAINT "decks_revision_check" CHECK ((revision >= 0)),
  CONSTRAINT "decks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  "created_by"   uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"   uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."decks"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."decks"
  ADD COLUMN "priority" public.deck_priority NOT NULL DEFAULT 'medium'::public.deck_priority;

CREATE INDEX decks_last_used ON public.decks USING btree (user_id, last_used_at DESC);

CREATE TRIGGER record_who_changed
  BEFORE INSERT OR UPDATE ON public.decks
  FOR EACH ROW
  EXECUTE FUNCTION private.record_who_changed();

CREATE POLICY "The deck evaluation role reads decks" ON "public"."decks"
  FOR SELECT
  TO "deck_evaluator"
  USING (true);

CREATE POLICY "Users read their own decks" ON "public"."decks"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT SELECT ON TABLE "public"."decks" TO "deck_evaluator";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."decks" TO "service_role";

REVOKE ALL ON TABLE "public"."decks" FROM "authenticated";

GRANT SELECT ON TABLE "public"."decks" TO "authenticated";

REVOKE ALL ON TABLE "public"."decks" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."decks" TO "postgres";

REVOKE ALL ON TABLE "public"."decks" FROM "anon";
