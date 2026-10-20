CREATE TABLE "public"."card_sets" (
  "code"                 text                     NOT NULL,
  "name"                 text                     NOT NULL,
  "icon_svg_uri"         text                     NOT NULL,
  "set_type"             text,
  "released_at"          date,
  "set_sections_read_at" timestamp with time zone,
  CONSTRAINT "card_sets_pkey" PRIMARY KEY (code)
);

ALTER TABLE "public"."card_sets"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX card_sets_newest_first ON public.card_sets USING btree (released_at DESC, name, code);

CREATE POLICY "Signed-in users read card sets" ON "public"."card_sets"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes card sets" ON "public"."card_sets"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."card_sets" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_sets" TO "service_role";

REVOKE ALL ON TABLE "public"."card_sets" FROM "authenticated";

GRANT SELECT ON TABLE "public"."card_sets" TO "authenticated";

REVOKE ALL ON TABLE "public"."card_sets" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_sets" TO "postgres";

REVOKE ALL ON TABLE "public"."card_sets" FROM "anon";
