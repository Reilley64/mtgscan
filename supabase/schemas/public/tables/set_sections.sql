CREATE TABLE "public"."set_sections" (
  "set_code" text    NOT NULL,
  "position" integer NOT NULL,
  "name"     text    NOT NULL,
  "search"   text    NOT NULL,
  CONSTRAINT "set_sections_pkey" PRIMARY KEY (set_code, "position"),
  CONSTRAINT "set_sections_set_code_fkey" FOREIGN KEY (set_code) REFERENCES public.card_sets(code)
);

ALTER TABLE "public"."set_sections"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read set sections" ON "public"."set_sections"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes set sections" ON "public"."set_sections"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."set_sections" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."set_sections" TO "service_role";

REVOKE ALL ON TABLE "public"."set_sections" FROM "authenticated";

GRANT SELECT ON TABLE "public"."set_sections" TO "authenticated";

REVOKE ALL ON TABLE "public"."set_sections" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."set_sections" TO "postgres";

REVOKE ALL ON TABLE "public"."set_sections" FROM "anon";
