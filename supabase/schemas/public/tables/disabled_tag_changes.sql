CREATE TABLE "public"."disabled_tag_changes" (
  "tag_id"     uuid                     NOT NULL,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."disabled_tag_changes"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "The deck evaluation role reads disabled tag changes" ON "public"."disabled_tag_changes"
  FOR SELECT
  TO "deck_evaluator"
  USING (true);

CREATE POLICY "The import role records disabled tag changes" ON "public"."disabled_tag_changes"
  FOR INSERT
  TO "catalog_importer"
  WITH CHECK (true);

GRANT INSERT ON TABLE "public"."disabled_tag_changes" TO "catalog_importer";

GRANT SELECT ON TABLE "public"."disabled_tag_changes" TO "deck_evaluator";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."disabled_tag_changes" TO "service_role";

REVOKE ALL ON TABLE "public"."disabled_tag_changes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."disabled_tag_changes" TO "postgres";

REVOKE ALL ON TABLE "public"."disabled_tag_changes" FROM "anon", "authenticated";
