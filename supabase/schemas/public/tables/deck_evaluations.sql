CREATE TABLE "public"."deck_evaluations" (
  "user_id"                uuid                     NOT NULL,
  "deck_id"                uuid                     NOT NULL,
  "violations"             jsonb                    NOT NULL,
  "undetermined"           jsonb                    NOT NULL,
  "revision"               integer                  NOT NULL,
  "catalog_at"             timestamp with time zone,
  "judged_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "estimated_bracket"      smallint                 NOT NULL,
  "bracket_signals"        jsonb                    NOT NULL,
  "missing_signal_count"   integer                  NOT NULL,
  "oracle_tags_at"         timestamp with time zone,
  "commander_spellbook_at" timestamp with time zone,
  "chosen_color"           text,
  CONSTRAINT "deck_evaluations_chosen_color_check" CHECK ((chosen_color = ANY (ARRAY['W'::text, 'U'::text, 'B'::text, 'R'::text, 'G'::text]))),
  CONSTRAINT "deck_evaluations_estimated_bracket_check" CHECK (((estimated_bracket >= 2) AND (estimated_bracket <= 4))),
  CONSTRAINT "deck_evaluations_missing_signal_count_check" CHECK ((missing_signal_count >= 0)),
  CONSTRAINT "deck_evaluations_pkey" PRIMARY KEY (user_id, deck_id),
  CONSTRAINT "deck_evaluations_revision_check" CHECK ((revision > 0)),
  CONSTRAINT "deck_evaluations_user_id_deck_id_fkey" FOREIGN KEY (user_id, deck_id) REFERENCES public.decks(user_id, id) ON DELETE CASCADE
);

ALTER TABLE "public"."deck_evaluations"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."deck_evaluations"
  ADD COLUMN "validity" public.deck_validity NOT NULL;

CREATE POLICY "The deck evaluation role writes deck evaluations" ON "public"."deck_evaluations"
  FOR ALL
  TO "deck_evaluator"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users read their own deck evaluations" ON "public"."deck_evaluations"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."deck_evaluations" TO "deck_evaluator";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_evaluations" TO "service_role";

REVOKE ALL ON TABLE "public"."deck_evaluations" FROM "authenticated";

GRANT SELECT ON TABLE "public"."deck_evaluations" TO "authenticated";

REVOKE ALL ON TABLE "public"."deck_evaluations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deck_evaluations" TO "postgres";

REVOKE ALL ON TABLE "public"."deck_evaluations" FROM "anon";
