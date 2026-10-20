CREATE TABLE "public"."card_taggings" (
  "tag_id"    uuid NOT NULL,
  "oracle_id" uuid NOT NULL,
  CONSTRAINT "card_taggings_pkey" PRIMARY KEY (tag_id, oracle_id),
  CONSTRAINT "card_taggings_oracle_id_fkey" FOREIGN KEY (oracle_id) REFERENCES public.cards(oracle_id),
  CONSTRAINT "card_taggings_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.oracle_tags(id)
);

ALTER TABLE "public"."card_taggings"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX card_taggings_oracle_id ON public.card_taggings USING btree (oracle_id);

CREATE POLICY "Signed-in users read card taggings" ON "public"."card_taggings"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "The import role writes card taggings" ON "public"."card_taggings"
  FOR ALL
  TO "catalog_importer"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."card_taggings" TO "catalog_importer";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_taggings" TO "service_role";

REVOKE ALL ON TABLE "public"."card_taggings" FROM "authenticated";

GRANT SELECT ON TABLE "public"."card_taggings" TO "authenticated";

REVOKE ALL ON TABLE "public"."card_taggings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."card_taggings" TO "postgres";

REVOKE ALL ON TABLE "public"."card_taggings" FROM "anon";
