CREATE TABLE "public"."oracle_tags" (
  "id"          uuid   NOT NULL,
  "slug"        text   NOT NULL,
  "label"       text   NOT NULL,
  "description" text,
  "aliases"     text[] NOT NULL,
  CONSTRAINT "oracle_tags_pkey" PRIMARY KEY (id),
  CONSTRAINT "oracle_tags_slug_key" UNIQUE (slug) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE "public"."oracle_tags"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX oracle_tags_slug_label_trigrams ON public.oracle_tags USING gin ((((slug || ' '::text) || label)) extensions.gin_trgm_ops);

CREATE POLICY "Signed-in users read Oracle tags" ON "public"."oracle_tags"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes Oracle tags" ON "public"."oracle_tags"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."oracle_tags" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oracle_tags" TO "service_role";

ALTER TABLE "public"."oracle_tags"
  ADD COLUMN "label_keys" text[] GENERATED ALWAYS AS (private.name_keys(ARRAY[slug, label])) STORED;

ALTER TABLE "public"."oracle_tags"
  ADD COLUMN "alias_keys" text[] GENERATED ALWAYS AS (private.name_keys(aliases)) STORED;

ALTER TABLE "public"."oracle_tags"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (private.tag_search_vector(label, aliases)) STORED;

CREATE INDEX oracle_tags_search_vector ON public.oracle_tags USING gin (search_vector);

REVOKE ALL ON TABLE "public"."oracle_tags" FROM "authenticated";

GRANT SELECT ON TABLE "public"."oracle_tags" TO "authenticated";

REVOKE ALL ON TABLE "public"."oracle_tags" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oracle_tags" TO "postgres";

REVOKE ALL ON TABLE "public"."oracle_tags" FROM "anon";
