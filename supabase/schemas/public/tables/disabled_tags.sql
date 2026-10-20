CREATE TABLE "public"."disabled_tags" (
  "tag_id"      uuid                     NOT NULL,
  "disabled_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "disabled_tags_pkey" PRIMARY KEY (tag_id)
);

ALTER TABLE "public"."disabled_tags"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read disabled tags" ON "public"."disabled_tags"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes disabled tags" ON "public"."disabled_tags"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT ON TABLE "public"."disabled_tags" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."disabled_tags" TO "service_role";

REVOKE ALL ON TABLE "public"."disabled_tags" FROM "authenticated";

GRANT SELECT ON TABLE "public"."disabled_tags" TO "authenticated";

REVOKE ALL ON TABLE "public"."disabled_tags" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."disabled_tags" TO "postgres";

REVOKE ALL ON TABLE "public"."disabled_tags" FROM "anon";
