CREATE TABLE "public"."tag_edges" (
  "parent_id" uuid NOT NULL,
  "child_id"  uuid NOT NULL,
  CONSTRAINT "tag_edges_child_id_fkey" FOREIGN KEY (child_id) REFERENCES public.oracle_tags(id),
  CONSTRAINT "tag_edges_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.oracle_tags(id),
  CONSTRAINT "tag_edges_pkey" PRIMARY KEY (parent_id, child_id)
);

ALTER TABLE "public"."tag_edges"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX tag_edges_child_id ON public.tag_edges USING btree (child_id);

CREATE POLICY "Signed-in users read tag edges" ON "public"."tag_edges"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes tag edges" ON "public"."tag_edges"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."tag_edges" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tag_edges" TO "service_role";

REVOKE ALL ON TABLE "public"."tag_edges" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tag_edges" TO "authenticated";

REVOKE ALL ON TABLE "public"."tag_edges" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tag_edges" TO "postgres";

REVOKE ALL ON TABLE "public"."tag_edges" FROM "anon";
